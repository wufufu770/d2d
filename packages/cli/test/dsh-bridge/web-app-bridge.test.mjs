// @wufufu770/d2d-cli test - dsh-web-app bridge
import { test } from 'node:test';
import assert from 'node:assert';
import {
  getPanelPaths,
  loadClientBundle,
  loadHostPlugin,
  mountClientModule,
  registerWebApp,
  manifest,
} from '../../src/dsh-bridge/web-app-bridge.mjs';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

test('getPanelPaths: resolves panel host + client files', () => {
  const p = getPanelPaths();
  assert.ok(p.hostPlugin.endsWith('host-index.mjs'));
  assert.ok(p.clientBundle.endsWith('client.js'));
  assert.ok(fs.existsSync(p.hostPlugin));
  assert.ok(fs.existsSync(p.clientBundle));
});

test('getPanelPaths: throws clearly when host plugin missing', () => {
  const real = getPanelPaths();
  assert.throws(() => getPanelPaths({
    paths: { hostPlugin: '/nonexistent/host-index.mjs', clientBundle: real.clientBundle },
  }), /host plugin missing/);
});

test('getPanelPaths: throws clearly when client bundle missing', () => {
  const real = getPanelPaths();
  assert.throws(() => getPanelPaths({
    paths: { hostPlugin: real.hostPlugin, clientBundle: '/nonexistent/client.js' },
  }), /client bundle missing/);
});

test('loadClientBundle: returns source string starting with module loader', () => {
  const src = loadClientBundle();
  assert.equal(typeof src, 'string');
  assert.ok(src.length > 1000, 'client bundle should be substantial');
  assert.match(src, /window\.__ModuleLoader__\.load\(/);
});

test('loadClientBundle: contains d2d-panel id', () => {
  const src = loadClientBundle();
  assert.match(src, /id:\s*['"]d2d-panel['"]/);
});

test('loadHostPlugin: returns module with name, inject, apply', async () => {
  const mod = await loadHostPlugin();
  assert.equal(mod.name, 'd2d-panel');
  assert.ok(Array.isArray(mod.inject));
  assert.ok(mod.inject.includes('webServer'));
  assert.ok(mod.inject.includes('webRuntime'));
  assert.equal(typeof mod.apply, 'function');
});

test('mountClientModule: returns loader descriptor', () => {
  const m = mountClientModule();
  assert.equal(m.id, 'd2d-panel');
  assert.equal(m.contentType, 'application/javascript');
  assert.ok(m.size > 1000);
  assert.ok(m.sha256.startsWith('fnv1a-'));
  assert.equal(typeof m.source, 'string');
  assert.match(m.source, /window\.__ModuleLoader__\.load/);
});

test('mountClientModule: sha256 fingerprint is deterministic', () => {
  const a = mountClientModule();
  const b = mountClientModule();
  assert.equal(a.sha256, b.sha256);
  assert.equal(a.size, b.size);
});

test('mountClientModule: detects malformed bundle (bad id)', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'd2d-bridge-'));
  try {
    const badPath = path.join(tmp, 'client.js');
    fs.writeFileSync(badPath, 'window.__ModuleLoader__.load({id: "wrong-name"})');
    assert.throws(() => mountClientModule({
      paths: {
        hostPlugin: getPanelPaths().hostPlugin,
        clientBundle: badPath,
      },
    }), /client bundle id mismatch/);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('mountClientModule: detects malformed bundle (no id)', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'd2d-bridge-'));
  try {
    const badPath = path.join(tmp, 'client.js');
    fs.writeFileSync(badPath, 'window.somethingElse()');
    assert.throws(() => mountClientModule({
      paths: {
        hostPlugin: getPanelPaths().hostPlugin,
        clientBundle: badPath,
      },
    }), /no window\.__ModuleLoader__\.load id found/);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('registerWebApp: wires host plugin via ctx.effect', async () => {
  const registered = [];
  const ctx = {
    // Mock dsh cordis effect: executes the callback (cordis runs effects eagerly
    // during plugin activation).
    effect: (fn) => { fn(); },
    webServer: { register: (route) => registered.push(route) },
    webRuntime: { trustedHosts: [] },
    log: () => {},
  };

  const result = await registerWebApp(ctx);
  assert.ok(result.hostPlugin);
  assert.ok(result.hostPlugin.apply);
  // The host plugin's apply() called ctx.effect() → ctx.webServer.register()
  const apiRoute = registered.find(r => r.path === '/d2d/api');
  assert.ok(apiRoute, 'expected /d2d/api route to be registered');
  assert.equal(apiRoute.kind, 'prefix');
  assert.equal(typeof apiRoute.handler, 'function');
});

test('registerWebApp: also registers client module if runtime supports it', async () => {
  const clientModules = [];
  const ctx = {
    effect: () => {},
    webServer: { register: () => {} },
    webRuntime: {
      trustedHosts: [],
      clientModules: { register: (m) => clientModules.push(m) },
    },
    log: () => {},
  };
  await registerWebApp(ctx);
  assert.equal(clientModules.length, 1);
  assert.equal(clientModules[0].id, 'd2d-panel');
  assert.match(clientModules[0].source, /window\.__ModuleLoader__\.load/);
});

test('registerWebApp: graceful when clientModules missing', async () => {
  const ctx = {
    effect: () => {},
    webServer: { register: () => {} },
    webRuntime: { trustedHosts: [] }, // no clientModules
    log: () => {},
  };
  // Should not throw
  const result = await registerWebApp(ctx);
  assert.ok(result.hostPlugin);
});

test('registerWebApp: throws if ctx missing', async () => {
  await assert.rejects(async () => {
    await registerWebApp(null);
  }, /ctx\.effect is required/);
});

test('registerWebApp: throws if ctx.effect missing', async () => {
  await assert.rejects(async () => {
    await registerWebApp({});
  }, /ctx\.effect is required/);
});

test('registerWebApp: throws if host plugin has no apply()', async () => {
  const badHost = path.join(os.tmpdir(), `bad-host-${Date.now()}.mjs`);
  fs.writeFileSync(badHost, 'export const name = "x"; export const inject = [];');
  try {
    await assert.rejects(async () => {
      await registerWebApp(
        { effect: () => {} },
        { paths: { hostPlugin: badHost, clientBundle: getPanelPaths().clientBundle } },
      );
    }, /has no apply\(\) export/);
  } finally {
    fs.rmSync(badHost, { force: true });
  }
});

test('manifest: returns bridge metadata', () => {
  const m = manifest();
  assert.equal(m.bridge, 'dsh-web-app');
  assert.equal(m.client.id, 'd2d-panel');
  assert.equal(m.client.loader, 'window.__ModuleLoader__.load');
  assert.equal(m.host.pluginName, 'd2d-panel');
  assert.ok(m.host.inject.includes('webServer'));
  assert.equal(m.host.apiPrefix, '/d2d/api');
  assert.ok(m.panel.hostPlugin.endsWith('host-index.mjs'));
  assert.ok(m.panel.clientBundle.endsWith('client.js'));
});

test('end-to-end: registerWebApp produces a complete plugin descriptor', async () => {
  const mod = await loadHostPlugin();
  const client = mountClientModule();
  // Host plugin shape matches cordis bundle expectations
  assert.equal(typeof mod.name, 'string');
  assert.ok(Array.isArray(mod.inject));
  // Client bundle has React factory (the actual factory function)
  assert.match(client.source, /factory:\s*\(require\)\s*=>/);
});