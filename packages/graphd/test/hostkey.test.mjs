// @wufufu770/d2d-graphd test - host-key management
import { test } from 'node:test';
import assert from 'node:assert';
import { ensureHostKey, computeFingerprint, defaultConfigDir } from '../lib/host-key.mjs';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

test('defaultConfigDir returns a path', () => {
  const dir = defaultConfigDir();
  assert.ok(typeof dir === 'string' && dir.length > 0);
});

test('ensureHostKey generates keypair', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'd2d-graphd-test-'));
  try {
    const { privPath, pubPath, fp } = await ensureHostKey(tmpDir);
    assert.ok(privPath.endsWith('host-key'));
    assert.ok(pubPath.endsWith('host-key.pub'));
    assert.match(fp, /^[a-f0-9]{64}$/);
    // File permissions
    const stat = fs.statSync(privPath);
    assert.equal(stat.mode & 0o777, 0o600, 'private key should be 0600');
    // Content
    assert.match(fs.readFileSync(privPath, 'utf8'), /PRIVATE KEY/);
    assert.match(fs.readFileSync(pubPath, 'utf8'), /PUBLIC KEY/);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('ensureHostKey is idempotent', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'd2d-graphd-test-'));
  try {
    const r1 = await ensureHostKey(tmpDir);
    const r2 = await ensureHostKey(tmpDir);
    assert.equal(r1.fp, r2.fp, 'same fingerprint on re-call');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('computeFingerprint returns 64 hex chars', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'd2d-graphd-test-'));
  try {
    const { pubPath } = await ensureHostKey(tmpDir);
    const fp = await computeFingerprint(pubPath);
    assert.match(fp, /^[a-f0-9]{64}$/);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('configDir with env override', () => {
  process.env.D2D_CONFIG_DIR = '/tmp/test-d2d-config';
  const dir = defaultConfigDir();
  assert.equal(dir, '/tmp/test-d2d-config');
  delete process.env.D2D_CONFIG_DIR;
});
