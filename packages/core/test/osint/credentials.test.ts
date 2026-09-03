// @wufufu770/d2d-core test - credentials.json encrypted store
// Run with: node --experimental-strip-types --test test/osint/credentials.test.ts

import { test } from 'node:test';
import assert from 'node:assert';
import { mkdtempSync, rmSync, existsSync, statSync, chmodSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

import {
  CredentialStore,
  defaultPaths,
  encrypt,
  decrypt,
  deriveKey,
  fingerprint,
  loadHostKey,
  PROVIDER_IDS,
  FILE_MODE,
  runCli,
} from '../../src/osint/credentials.ts';

// Helper: temp dir + persisted Ed25519 key
function freshEnv() {
  const tmpDir = mkdtempSync(path.join(tmpdir(), 'd2d-cred-'));
  const hostKeyPath = path.join(tmpDir, 'host-key');
  const dataDir = path.join(tmpDir, 'data');
  const credPath = path.join(dataDir, 'credentials.json');
  // Generate a real host-key and persist it
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519');
  writeFileSync(hostKeyPath, privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 });
  return { tmpDir, hostKeyPath, dataDir, credPath };
}

test('set then get roundtrip across 6 providers', async () => {
  const env = freshEnv();
  try {
    const store = new CredentialStore(env.hostKeyPath, env.credPath);
    await store.load();
    for (const provider of PROVIDER_IDS) {
      await store.set(provider, `secret-${provider}-abc123`);
    }
    const store2 = new CredentialStore(env.hostKeyPath, env.credPath);
    await store2.load();
    for (const provider of PROVIDER_IDS) {
      const v = await store2.get(provider);
      assert.equal(v, `secret-${provider}-abc123`, `${provider} roundtrip failed`);
    }
  } finally { rmSync(env.tmpDir, { recursive: true, force: true }); }
});

test('get returns null for unset provider', async () => {
  const env = freshEnv();
  try {
    const store = new CredentialStore(env.hostKeyPath, env.credPath);
    await store.load();
    const v = await store.get('fofa');
    assert.equal(v, null);
  } finally { rmSync(env.tmpDir, { recursive: true, force: true }); }
});

test('delete removes credential; returns true/false based on existence', async () => {
  const env = freshEnv();
  try {
    const store = new CredentialStore(env.hostKeyPath, env.credPath);
    await store.load();
    await store.set('hunter', 'hk-xxx');
    assert.equal(await store.delete('hunter'), true);
    assert.equal(await store.delete('hunter'), false); // already gone
    assert.equal(await store.get('hunter'), null);
  } finally { rmSync(env.tmpDir, { recursive: true, force: true }); }
});

test('list returns all 6 providers with correct set/unset status', async () => {
  const env = freshEnv();
  try {
    const store = new CredentialStore(env.hostKeyPath, env.credPath);
    await store.load();
    await store.set('fofa', 'fofa-key');
    await store.set('0.zone', 'zone-token');
    const rows = await store.list();
    assert.equal(rows.length, 6);
    assert.deepEqual(rows.find((r) => r.provider === 'fofa'), { provider: 'fofa', set: true });
    assert.deepEqual(rows.find((r) => r.provider === '0.zone'), { provider: '0.zone', set: true });
    assert.deepEqual(rows.find((r) => r.provider === 'hunter'), { provider: 'hunter', set: false });
  } finally { rmSync(env.tmpDir, { recursive: true, force: true }); }
});

test('credentials.json is written with mode 0o600', async () => {
  const env = freshEnv();
  try {
    const store = new CredentialStore(env.hostKeyPath, env.credPath);
    await store.load();
    await store.set('quake', 'qt-xxx');
    assert.ok(existsSync(env.credPath), 'credentials.json must be created');
    const mode = statSync(env.credPath).mode & 0o777;
    assert.equal(mode, FILE_MODE, `mode should be 0o600 (0o${mode.toString(8)})`);
  } finally { rmSync(env.tmpDir, { recursive: true, force: true }); }
});

test('Ed25519 derivation is deterministic — same key + same salt → same AES key', () => {
  const env = freshEnv();
  try {
    const { privateKey } = crypto.generateKeyPairSync('ed25519');
    const salt = crypto.randomBytes(16);
    const k1 = deriveKey(privateKey, salt);
    const k2 = deriveKey(privateKey, salt);
    // hkdfSync returns ArrayBuffer; wrap as Buffer for .equals()
    assert.ok(Buffer.from(k1).equals(Buffer.from(k2)));
    assert.equal(Buffer.from(k1).length, 32, 'AES-256 key must be 32 bytes');
  } finally { rmSync(env.tmpDir, { recursive: true, force: true }); }
});

test('fingerprint() is stable across re-reads', () => {
  const env = freshEnv();
  try {
    const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519');
    const f1 = fingerprint(publicKey);
    const f2 = fingerprint(publicKey);
    assert.equal(f1, f2);
    // Different key → different fingerprint
    const other = crypto.generateKeyPairSync('ed25519');
    const f3 = fingerprint(other.publicKey);
    assert.notEqual(f1, f3);
  } finally { rmSync(env.tmpDir, { recursive: true, force: true }); }
});

test('encrypt/decrypt roundtrip via deriveKey', () => {
  const env = freshEnv();
  try {
    const { privateKey } = crypto.generateKeyPairSync('ed25519');
    const salt = crypto.randomBytes(16);
    const key = deriveKey(privateKey, salt);
    const ct = encrypt('hello-secret', key);
    assert.equal(ct.v, 1);
    assert.ok(ct.iv && ct.tag && ct.ciphertext);
    const pt = decrypt(ct, key);
    assert.equal(pt, 'hello-secret');
  } finally { rmSync(env.tmpDir, { recursive: true, force: true }); }
});

test('decrypt with wrong key fails (AES-GCM auth tag mismatch)', () => {
  const env = freshEnv();
  try {
    const { privateKey } = crypto.generateKeyPairSync('ed25519');
    const salt = crypto.randomBytes(16);
    const key = deriveKey(privateKey, salt);
    const ct = encrypt('hello', key);
    const wrongKey = crypto.randomBytes(32);
    assert.throws(() => decrypt(ct, wrongKey));
  } finally { rmSync(env.tmpDir, { recursive: true, force: true }); }
});

test('host-key fingerprint mismatch throws (rotation detection)', async () => {
  const env = freshEnv();
  try {
    const store = new CredentialStore(env.hostKeyPath, env.credPath);
    await store.load();
    await store.set('fofa', 'abc');
    // Now replace the host-key with a new one
    const { privateKey: newPriv } = crypto.generateKeyPairSync('ed25519');
    writeFileSync(env.hostKeyPath, newPriv.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 });
    const store2 = new CredentialStore(env.hostKeyPath, env.credPath);
    await assert.rejects(async () => {
      await store2.load();
    }, /fingerprint mismatch/);
  } finally { rmSync(env.tmpDir, { recursive: true, force: true }); }
});

test('D2D_DATA_DIR overrides default path (cross-platform)', () => {
  process.env.D2D_DATA_DIR = '/custom/path';
  try {
    const p = defaultPaths();
    assert.equal(p.dataDir, '/custom/path');
  } finally { delete process.env.D2D_DATA_DIR; }
});

test('D2D_HOST_KEY overrides default host-key path', () => {
  process.env.D2D_HOST_KEY = '/custom/host-key';
  try {
    const p = defaultPaths();
    assert.equal(p.hostKeyPath, '/custom/host-key');
  } finally { delete process.env.D2D_HOST_KEY; }
});

test('resolve() falls back to env var when unset in store', async () => {
  const env = freshEnv();
  try {
    process.env.FOFA_TOKEN = 'env-fallback-key';
    try {
      const store = new CredentialStore(env.hostKeyPath, env.credPath);
      await store.load();
      const v = await store.resolve('fofa');
      assert.equal(v, 'env-fallback-key');
      // After set, store wins
      await store.set('fofa', 'store-key');
      const v2 = await store.resolve('fofa');
      assert.equal(v2, 'store-key');
    } finally { delete process.env.FOFA_TOKEN; }
  } finally { rmSync(env.tmpDir, { recursive: true, force: true }); }
});

test('ephemeral key: missing host-key generates in-memory key, warns', async () => {
  const env = freshEnv();
  try {
    rmSync(env.hostKeyPath); // remove so ephemeral kicks in
    const store = new CredentialStore(env.hostKeyPath, env.credPath);
    await store.load();
    assert.equal(store.isEphemeral, true);
    // Still works for the lifetime of the process
    await store.set('fofa', 'temp');
    const v = await store.get('fofa');
    assert.equal(v, 'temp');
  } finally { rmSync(env.tmpDir, { recursive: true, force: true }); }
});

test('set rejects unknown provider', async () => {
  const env = freshEnv();
  try {
    const store = new CredentialStore(env.hostKeyPath, env.credPath);
    await store.load();
    await assert.rejects(async () => {
      await store.set('not-a-provider' as any, 'x');
    }, /unknown provider/);
  } finally { rmSync(env.tmpDir, { recursive: true, force: true }); }
});

test('set rejects empty credential', async () => {
  const env = freshEnv();
  try {
    const store = new CredentialStore(env.hostKeyPath, env.credPath);
    await store.load();
    await assert.rejects(async () => {
      await store.set('fofa', '   ');
  }, /non-empty string/);
  } finally { rmSync(env.tmpDir, { recursive: true, force: true }); }
});

test('CLI: list shows 6 providers', async () => {
  const env = freshEnv();
  process.env.D2D_DATA_DIR = env.dataDir;
  try {
    const r = await runCli(['list']);
    assert.equal(r.code, 0);
    assert.match(r.stdout, /fofa/);
    assert.match(r.stdout, /hunter/);
    assert.match(r.stdout, /quake/);
    assert.match(r.stdout, /riskbird/);
    assert.match(r.stdout, /zoomeye/);
    assert.match(r.stdout, /0\.zone/);
  } finally {
    delete process.env.D2D_DATA_DIR;
    rmSync(env.tmpDir, { recursive: true, force: true });
  }
});

test('CLI: set then get roundtrip', async () => {
  const env = freshEnv();
  process.env.D2D_DATA_DIR = env.dataDir;
  try {
    const r1 = await runCli(['set', 'fofa', 'cli-key-abc']);
    assert.equal(r1.code, 0);
    const r2 = await runCli(['get', 'fofa']);
    assert.equal(r2.code, 0);
    assert.equal(r2.stdout, 'cli-key-abc');
  } finally {
    delete process.env.D2D_DATA_DIR;
    rmSync(env.tmpDir, { recursive: true, force: true });
  }
});

test('CLI: delete', async () => {
  const env = freshEnv();
  process.env.D2D_DATA_DIR = env.dataDir;
  try {
    await runCli(['set', 'hunter', 'hk']);
    const r1 = await runCli(['delete', 'hunter']);
    assert.equal(r1.code, 0);
    assert.match(r1.stdout, /deleted hunter/);
    const r2 = await runCli(['delete', 'hunter']);
    assert.match(r2.stdout, /was not set/);
  } finally {
    delete process.env.D2D_DATA_DIR;
    rmSync(env.tmpDir, { recursive: true, force: true });
  }
});

test('CLI: usage error on missing args', async () => {
  const r = await runCli(['set']);
  assert.equal(r.code, 2);
  assert.match(r.stderr, /usage/);
});