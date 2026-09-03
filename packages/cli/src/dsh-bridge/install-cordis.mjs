// @wufufu770/d2d-cli - dsh bridge: cordis patch installer
import fs from 'node:fs';
import nodePath from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = nodePath.dirname(fileURLToPath(import.meta.url));
const PATCH_YML_PATH = nodePath.join(__dirname, 'cordis-patch.yml');

const REQUIRED_BUNDLES = [
  '@deepseek-ai/dsh-base',
  '@deepseek-ai/dsh-web-app',
  '@wufufu770/d2d-core',
  '@wufufu770/d2d-agents',
  '@wufufu770/d2d-skills',
  '@wufufu770/d2d-hooks',
  '@wufufu770/d2d-panel',
  '@wufufu770/d2d-graphd',
];

const REQUIRED_PLUGIN = 'd2d-pentest';

function defaultDshHome() {
  if (process.env.DSH_HOME) return nodePath.resolve(process.env.DSH_HOME);
  if (process.platform === 'darwin') {
    return nodePath.join(os.homedir(), 'Library', 'Application Support', 'dsh');
  }
  if (process.platform === 'win32') {
    return nodePath.join(process.env.APPDATA || os.homedir(), 'dsh');
  }
  return nodePath.join(process.env.XDG_CONFIG_HOME || nodePath.join(os.homedir(), '.config'), 'dsh');
}

function defaultWebProfile(dshHome) {
  return nodePath.join(dshHome, 'profiles', 'web');
}

function readPatchYml(p) {
  if (!fs.existsSync(p)) return null;
  const text = fs.readFileSync(p, 'utf8');
  // Try JSON first (written by us for tests/round-trip)
  const trimmed = text.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try { return JSON.parse(text); } catch { /* fall through to YAML */ }
  }
  return parseSimpleYaml(text);
}

function writePatchYml(p, data) {
  const dir = nodePath.dirname(p);
  fs.mkdirSync(dir, { recursive: true });
  // Write as JSON for round-trip safety (yaml subset)
  fs.writeFileSync(p, JSON.stringify(data, null, 2));
}

function parseSimpleYaml(text) {
  // Lightweight parser for the simple structure we use
  // Returns: { bundles: [...], plugins: { name: {inject, scope} } }
  const result = { bundles: [], plugins: {} };
  let currentSection = null;
  let currentPlugin = null;

  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    if (trimmed === 'bundles:') { currentSection = 'bundles'; currentPlugin = null; continue; }
    if (trimmed === 'plugins:') { currentSection = 'plugins'; currentPlugin = null; continue; }

    if (currentSection === 'bundles' && trimmed.startsWith('- ')) {
      const item = trimmed.slice(2).trim().replace(/^["']|["']$/g, '');
      if (item) result.bundles.push(item);
      continue;
    }

    if (currentSection === 'plugins' && /^[a-z][a-z0-9-]*:$/.test(trimmed)) {
      currentPlugin = trimmed.slice(0, -1);
      result.plugins[currentPlugin] = {};
      continue;
    }

    if (currentSection === 'plugins' && currentPlugin && trimmed.includes(':')) {
      const colonIdx = trimmed.indexOf(':');
      const key = trimmed.slice(0, colonIdx).trim();
      let value = trimmed.slice(colonIdx + 1).trim();
      if (value.startsWith('[') && value.endsWith(']')) {
        value = value.slice(1, -1).split(',').map(s => s.trim().replace(/^["']|["']$/g, ''));
      } else if (value.startsWith('"') && value.endsWith('"')) {
        value = value.slice(1, -1);
      }
      result.plugins[currentPlugin][key] = value;
    }
  }
  return result;
}

function mergePatch(existing, desired) {
  const merged = {
    bundles: [...(existing.bundles || [])],
    plugins: { ...(existing.plugins || {}) },
  };
  for (const b of desired.bundles) {
    if (!merged.bundles.includes(b)) merged.bundles.push(b);
  }
  for (const [name, def] of Object.entries(desired.plugins)) {
    if (!merged.plugins[name]) {
      merged.plugins[name] = def;
    } else {
      // merge plugin config (existing wins for already-set keys)
      merged.plugins[name] = { ...def, ...merged.plugins[name] };
    }
  }
  return merged;
}

function loadDesired() {
  // Read the desired patch from the bundled file
  return readPatchYml(PATCH_YML_PATH) || { bundles: REQUIRED_BUNDLES, plugins: { [REQUIRED_PLUGIN]: { inject: ['tools', 'commands', 'agents'], scope: ['session', 'engagement'] } } };
}

function enable({ dshHome, patchPath, log = console } = {}) {
  dshHome = dshHome || defaultDshHome();
  patchPath = patchPath || nodePath.join(defaultWebProfile(dshHome), 'cordis.patch.yml');

  const desired = loadDesired();
  const existing = readPatchYml(patchPath) || { bundles: [], plugins: {} };

  if (JSON.stringify(existing) === JSON.stringify({ bundles: desired.bundles.sort(), plugins: desired.plugins })) {
    log(`[bridge] patch already up to date: ${patchPath}`);
    return { status: 'noop', patchPath };
  }

  const merged = mergePatch(existing, desired);
  writePatchYml(patchPath, merged);
  log(`[bridge] ✓ enabled: ${patchPath}`);
  return { status: 'enabled', patchPath, bundles: merged.bundles.length, plugins: Object.keys(merged.plugins) };
}

function disable({ dshHome, patchPath, log = console } = {}) {
  dshHome = dshHome || defaultDshHome();
  patchPath = patchPath || nodePath.join(defaultWebProfile(dshHome), 'cordis.patch.yml');

  const existing = readPatchYml(patchPath);
  if (!existing) {
    log(`[bridge] no patch to disable: ${patchPath}`);
    return { status: 'noop', patchPath };
  }

  const filtered = {
    bundles: (existing.bundles || []).filter(b => !b.startsWith('@wufufu770/d2d-')),
    plugins: Object.fromEntries(
      Object.entries(existing.plugins || {}).filter(([k]) => k !== REQUIRED_PLUGIN)
    ),
  };
  writePatchYml(patchPath, filtered);
  log(`[bridge] ✓ disabled d2d bundles from ${patchPath}`);
  return { status: 'disabled', patchPath, bundles: filtered.bundles.length, plugins: Object.keys(filtered.plugins) };
}

function status({ dshHome, patchPath } = {}) {
  dshHome = dshHome || defaultDshHome();
  patchPath = patchPath || nodePath.join(defaultWebProfile(dshHome), 'cordis.patch.yml');

  const existing = readPatchYml(patchPath);
  if (!existing) {
    return { status: 'missing', patchPath };
  }

  const d2dBundles = (existing.bundles || []).filter(b => b.startsWith('@wufufu770/d2d-'));
  // Count only d2d-required bundles (exclude @deepseek-ai/* which are dsh's own)
  const d2dRequired = REQUIRED_BUNDLES.filter(b => b.startsWith('@wufufu770/d2d-'));
  const allD2dPresent = d2dRequired.every(b => d2dBundles.includes(b));
  const hasD2dPlugin = REQUIRED_PLUGIN in (existing.plugins || {});
  return {
    status: allD2dPresent && hasD2dPlugin ? 'enabled' : 'partial',
    patchPath,
    d2dBundles,
    d2dPlugin: hasD2dPlugin,
    missingD2dBundles: d2dRequired.filter(b => !d2dBundles.includes(b)),
    allBundles: existing.bundles,
    allPlugins: Object.keys(existing.plugins || {}),
  };
}

export { enable, disable, status, readPatchYml, writePatchYml, parseSimpleYaml, mergePatch, REQUIRED_BUNDLES, REQUIRED_PLUGIN };

// ===== CLI entry =====
if (import.meta.url === `file://${process.argv[1]}`) {
  const cmd = process.argv[2] || 'status';
  const opts = {};
  for (let i = 3; i < process.argv.length; i++) {
    if (process.argv[i] === '--dsh-home') opts.dshHome = process.argv[++i];
    else if (process.argv[i] === '--patch') opts.patchPath = process.argv[++i];
  }
  const action = { enable, disable, status }[cmd];
  if (!action) {
    console.error(`usage: install-cordis.mjs <enable|disable|status> [--dsh-home <path>] [--patch <path>]`);
    process.exit(1);
  }
  const result = action(opts);
  console.log(JSON.stringify(result, null, 2));
}
