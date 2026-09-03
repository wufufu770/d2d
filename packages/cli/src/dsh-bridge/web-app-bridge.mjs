// @wufufu770/d2d-cli - dsh-web-app bridge
// Embed d2d-panel into dsh Web's React framework.
// Two halves:
//   1. HOST plugin (packages/panel/src/host-index.mjs) — registers /d2d/api routes
//      against ctx.webServer + ctx.effect()
//   2. CLIENT bundle (packages/panel/src/client.js) — UMD-ish blob that the dsh
//      browser runtime loads via window.__ModuleLoader__.load({id:'d2d-panel',...})
// This bridge wires both halves into a dsh cordis bundle context and exposes
// a single `registerWebApp(ctx)` entry point.

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ===== Resolved panel asset paths (single source of truth) =====
function defaultPanelPaths() {
  // layout: <monorepo-root>/packages/cli/src/dsh-bridge/web-app-bridge.mjs
  // panel:  <monorepo-root>/packages/panel/src/{host-index.mjs,client.js}
  return {
    hostPlugin: resolve(__dirname, '..', '..', '..', 'panel', 'src', 'host-index.mjs'),
    clientBundle: resolve(__dirname, '..', '..', '..', 'panel', 'src', 'client.js'),
  };
}

/**
 * Resolve and return paths to the host plugin + client bundle.
 * Throws clearly if the panel package is missing.
 */
export function getPanelPaths(opts = {}) {
  const paths = { ...defaultPanelPaths(), ...(opts.paths || {}) };
  if (!existsSync(paths.clientBundle)) {
    throw new Error(`d2d-panel client bundle missing: ${paths.clientBundle}`);
  }
  if (!existsSync(paths.hostPlugin)) {
    throw new Error(`d2d-panel host plugin missing: ${paths.hostPlugin} (run pnpm install)`);
  }
  return paths;
}

/**
 * Load the dsh host plugin module from packages/panel.
 * Returns the module object (with `name`, `inject`, `apply` exports).
 */
export async function loadHostPlugin(opts = {}) {
  const paths = getPanelPaths(opts);
  return await import(paths.hostPlugin);
}

/**
 * Load the browser client bundle as a raw source string.
 * dsh's web runtime serves this as a static asset and then evaluates
 * it inside `window.__ModuleLoader__.load(...)` registration.
 */
export function loadClientBundle(opts = {}) {
  const paths = getPanelPaths(opts);
  return readFileSync(paths.clientBundle, 'utf8');
}

/**
 * Build a module-loader descriptor for the dsh browser runtime.
 * The runtime stores these and exposes them under window.__ModuleLoader__
 * so that dsh's React framework can mount d2d-panel inside its sidebar.
 *
 * Returns: { id, source, contentType, size, sha256 }
 */
export function mountClientModule(opts = {}) {
  const source = loadClientBundle(opts);
  const idMatch = source.match(/window\.__ModuleLoader__\.load\(\s*\{\s*id:\s*['"]([^'"]+)['"]/);
  if (!idMatch) {
    throw new Error('client bundle is malformed: no window.__ModuleLoader__.load id found');
  }
  const id = idMatch[1];
  if (id !== 'd2d-panel') {
    // We rely on the id being d2d-panel for both lookup and injection timing.
    throw new Error(`client bundle id mismatch: expected "d2d-panel", got "${id}"`);
  }
  // Lightweight sha256-ish fingerprint (length + first-64-chars of summed bytes).
  // Avoids importing crypto for the common test path; the bridge is identified by content hash in dsh.
  let h1 = 0x811c9dc5;
  for (let i = 0; i < source.length; i++) {
    h1 ^= source.charCodeAt(i);
    h1 = Math.imul(h1, 0x01000193) >>> 0;
  }
  const sha256 = `fnv1a-${h1.toString(16).padStart(8, '0')}-${source.length}`;
  return {
    id,
    source,
    contentType: 'application/javascript',
    size: source.length,
    sha256,
  };
}

/**
 * Full bridge entry: mount host plugin + register client module on a dsh ctx.
 *
 * Expected dsh ctx shape (mockable in tests):
 *   ctx.effect(fn)            — schedule side-effects during plugin activation
 *   ctx.webServer             — provides ctx.webServer.register({...})
 *   ctx.webRuntime            — provides ctx.webRuntime.clientModules = { ... }
 *   ctx.webRuntime.trustedHosts — used by host trust-gate
 *   ctx.log(...args)          — optional logger
 *
 * Returns: { hostPlugin, clientModule }
 */
export async function registerWebApp(ctx, config = {}) {
  if (!ctx || typeof ctx.effect !== 'function') {
    throw new Error('ctx.effect is required (dsh cordis context)');
  }

  // 1. Load host plugin + register it through ctx.effect (cordis activation).
  // Allow config to override panel paths (mainly for tests).
  const hostPlugin = await loadHostPlugin(config);
  if (typeof hostPlugin.apply !== 'function') {
    throw new Error(`d2d-panel host plugin has no apply() export (got keys: ${Object.keys(hostPlugin).join(', ')})`);
  }
  ctx.effect(() => hostPlugin.apply(ctx, config));

  // 2. Build + register the client module so dsh's web runtime can mount it.
  const clientModule = mountClientModule();
  if (ctx.webRuntime && ctx.webRuntime.clientModules && typeof ctx.webRuntime.clientModules.register === 'function') {
    ctx.webRuntime.clientModules.register(clientModule);
  }

  return { hostPlugin, clientModule };
}

/**
 * Static manifest for `d2d bridge status` / health checks.
 */
export function manifest(opts = {}) {
  const paths = getPanelPaths(opts);
  return {
    bridge: 'dsh-web-app',
    version: '0.3.0-M1',
    panel: {
      hostPlugin: paths.hostPlugin,
      clientBundle: paths.clientBundle,
    },
    client: {
      id: 'd2d-panel',
      loader: 'window.__ModuleLoader__.load',
    },
    host: {
      pluginName: 'd2d-panel',
      inject: ['webServer', 'webRuntime'],
      apiPrefix: '/d2d/api',
    },
  };
}

// ===== CLI entry =====
if (import.meta.url === `file://${process.argv[1]}`) {
  const cmd = process.argv[2] || 'manifest';
  if (cmd === 'manifest') {
    const m = manifest();
    console.log(JSON.stringify(m, null, 2));
  } else if (cmd === 'mount') {
    const m = mountClientModule();
    console.log(JSON.stringify({ id: m.id, size: m.size, sha256: m.sha256, contentType: m.contentType }, null, 2));
  } else {
    console.error('usage: web-app-bridge.mjs <manifest|mount>');
    process.exit(1);
  }
}