// @wufufu770/d2d-cli test - dsh bridge (cordis patch)
import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { enable, disable, status, readPatchYml, writePatchYml, parseSimpleYaml, mergePatch, REQUIRED_BUNDLES, REQUIRED_PLUGIN } from '../../src/dsh-bridge/install-cordis.mjs';

test('parseSimpleYaml parses bundles list', () => {
  const text = `
bundles:
  - "@deepseek-ai/dsh-base"
  - "@deepseek-ai/dsh-web-app"
plugins:
  d2d-pentest:
    inject: ["tools", "commands"]
    scope: ["session"]
`;
  const parsed = parseSimpleYaml(text);
  assert.deepEqual(parsed.bundles, ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app']);
  assert.deepEqual(parsed.plugins['d2d-pentest'].inject, ['tools', 'commands']);
  assert.deepEqual(parsed.plugins['d2d-pentest'].scope, ['session']);
});

test('parseSimpleYaml ignores comments and blank lines', () => {
  const text = `
# This is a comment
bundles:
  - "a"

  # another comment
  - "b"
`;
  const parsed = parseSimpleYaml(text);
  assert.deepEqual(parsed.bundles, ['a', 'b']);
});

test('mergePatch: idempotent (no duplicates)', () => {
  const desired = { bundles: ['a', 'b'], plugins: { p1: { inject: ['x'] } } };
  const existing = { bundles: ['a', 'b'], plugins: { p1: { inject: ['x'] } } };
  const merged = mergePatch(existing, desired);
  assert.deepEqual(merged.bundles, ['a', 'b']);  // no duplicates
  assert.deepEqual(merged.plugins.p1.inject, ['x']);
});

test('mergePatch: adds missing bundles', () => {
  const desired = { bundles: ['a', 'b', 'c'], plugins: {} };
  const existing = { bundles: ['a'], plugins: {} };
  const merged = mergePatch(existing, desired);
  assert.deepEqual(merged.bundles.sort(), ['a', 'b', 'c']);
});

test('mergePatch: existing plugin config wins', () => {
  const desired = { bundles: [], plugins: { p1: { inject: ['new'] } } };
  const existing = { bundles: [], plugins: { p1: { inject: ['old'], scope: ['s'] } } };
  const merged = mergePatch(existing, desired);
  assert.deepEqual(merged.plugins.p1.inject, ['old']);  // existing wins
  assert.deepEqual(merged.plugins.p1.scope, ['s']);     // existing preserved
});

test('enable creates profile + patch on fresh install', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'd2d-bridge-'));
  try {
    const result = enable({ dshHome: tmp, log: () => {} });
    assert.equal(result.status, 'enabled');
    const patchPath = path.join(tmp, 'profiles', 'web', 'cordis.patch.yml');
    assert.ok(fs.existsSync(patchPath), 'patch file should exist');
    const parsed = JSON.parse(fs.readFileSync(patchPath, 'utf8'));
    // All required bundles present
    for (const b of REQUIRED_BUNDLES) {
      assert.ok(parsed.bundles.includes(b), `missing bundle: ${b}`);
    }
    // d2d-pentest plugin present
    assert.ok(parsed.plugins[REQUIRED_PLUGIN]);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('enable is idempotent (no changes on second call)', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'd2d-bridge-'));
  try {
    enable({ dshHome: tmp, log: () => {} });
    const result2 = enable({ dshHome: tmp, log: () => {} });
    assert.equal(result2.status, 'noop', 'second enable should be noop');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('enable adds missing bundles without overwriting existing config', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'd2d-bridge-'));
  try {
    // Pre-existing patch with only 2 bundles + custom plugin
    const webDir = path.join(tmp, 'profiles', 'web');
    fs.mkdirSync(webDir, { recursive: true });
    writePatchYml(path.join(webDir, 'cordis.patch.yml'), {
      bundles: ['@deepseek-ai/dsh-base', '@wufufu770/d2d-core'],
      plugins: { 'd2d-pentest': { inject: ['custom'] } },
    });
    const result = enable({ dshHome: tmp, log: () => {} });
    assert.equal(result.status, 'enabled');
    const parsed = JSON.parse(fs.readFileSync(path.join(webDir, 'cordis.patch.yml'), 'utf8'));
    // All required bundles added
    for (const b of REQUIRED_BUNDLES) {
      assert.ok(parsed.bundles.includes(b), `missing: ${b}`);
    }
    // Custom inject preserved
    assert.deepEqual(parsed.plugins['d2d-pentest'].inject, ['custom']);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('disable removes d2d bundles but keeps non-d2d', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'd2d-bridge-'));
  try {
    enable({ dshHome: tmp, log: () => {} });
    const result = disable({ dshHome: tmp, log: () => {} });
    assert.equal(result.status, 'disabled');
    const parsed = JSON.parse(fs.readFileSync(path.join(tmp, 'profiles', 'web', 'cordis.patch.yml'), 'utf8'));
    // No d2d bundles
    for (const b of parsed.bundles) {
      assert.ok(!b.startsWith('@wufufu770/d2d-'), `still has d2d bundle: ${b}`);
    }
    // d2d-pentest plugin removed
    assert.equal(parsed.plugins['d2d-pentest'], undefined);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('status: missing when no patch file', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'd2d-bridge-'));
  try {
    const result = status({ dshHome: tmp });
    assert.equal(result.status, 'missing');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('status: enabled when full d2d config present', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'd2d-bridge-'));
  try {
    enable({ dshHome: tmp, log: () => {} });
    const result = status({ dshHome: tmp });
    assert.equal(result.status, 'enabled');
    // Only d2d bundles are filtered (dsh-base/dsh-web-app excluded)
    const d2dRequired = REQUIRED_BUNDLES.filter(b => b.startsWith('@wufufu770/d2d-'));
    assert.equal(result.d2dBundles.length, d2dRequired.length);
    assert.equal(result.d2dPlugin, true);
    assert.equal(result.missingD2dBundles.length, 0);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('status: partial when only some d2d bundles present', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'd2d-bridge-'));
  try {
    const webDir = path.join(tmp, 'profiles', 'web');
    fs.mkdirSync(webDir, { recursive: true });
    writePatchYml(path.join(webDir, 'cordis.patch.yml'), {
      bundles: ['@wufufu770/d2d-core'],
      plugins: {},
    });
    const result = status({ dshHome: tmp });
    assert.equal(result.status, 'partial');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('8 required bundles defined', () => {
  assert.equal(REQUIRED_BUNDLES.length, 8);
  assert.ok(REQUIRED_BUNDLES.includes('@wufufu770/d2d-core'));
  assert.ok(REQUIRED_BUNDLES.includes('@wufufu770/d2d-graphd'));
});
