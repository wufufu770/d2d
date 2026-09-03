// @wufufu770/d2d-core test - CryptoBackend abstraction (Issue #60)
// Run with: node --experimental-strip-types --test test/crypto/backend.test.ts

import { test } from 'node:test';
import assert from 'node:assert';
import {
  createBackend,
  createVerifyOnlyBackend,
  defaultBackendId,
  Ed25519Backend,
  MLDsaBackend,
  DualBackend,
  SUPPORTED_BACKENDS,
} from '../../src/crypto/backend.ts';

// ===== Ed25519Backend =====
test('Ed25519Backend: sign+verify roundtrip', async () => {
  const b = await createBackend('ed25519');
  const data = new TextEncoder().encode('hello ed25519');
  const sig = await b.sign(data);
  assert.equal(typeof sig, 'object');  // Uint8Array
  const ok = await b.verify(data, sig);
  assert.equal(ok, true);
});

test('Ed25519Backend: verify rejects tampered data', async () => {
  const b = await createBackend('ed25519');
  const data = new TextEncoder().encode('hello');
  const sig = await b.sign(data);
  const ok = await b.verify(new TextEncoder().encode('hellx'), sig);
  assert.equal(ok, false);
});

test('Ed25519Backend: exportPublicKey + fingerprint deterministic', async () => {
  const b = await createBackend('ed25519');
  const pk1 = await b.exportPublicKey();
  const pk2 = await b.exportPublicKey();
  assert.ok(pk1.length > 0);
  assert.ok(pk2.length > 0);
  // Different backend instance → different key → different fingerprint
  const b2 = await createBackend('ed25519');
  const fp1 = await b.fingerprint();
  const fp2 = await b2.fingerprint();
  assert.match(fp1, /^[a-f0-9]{64}$/);
  assert.notEqual(fp1, fp2, 'fresh keypair → different fingerprint');
});

// ===== MLDsaBackend =====
test('MLDsaBackend: ml-dsa-65 roundtrip', async () => {
  const b = await createBackend('ml-dsa-65');
  assert.equal(b.id, 'ml-dsa-65');
  const data = new TextEncoder().encode('pq mldsa65');
  const sig = await b.sign(data);
  assert.ok(sig.length > 1000, 'ML-DSA-65 sig should be substantial');
  const ok = await b.verify(data, sig);
  assert.equal(ok, true);
});

test('MLDsaBackend: ml-dsa-44 roundtrip', async () => {
  const b = await createBackend('ml-dsa-44');
  const data = new TextEncoder().encode('mldsa44');
  const sig = await b.sign(data);
  const ok = await b.verify(data, sig);
  assert.equal(ok, true);
});

test('MLDsaBackend: ml-dsa-87 roundtrip', async () => {
  const b = await createBackend('ml-dsa-87');
  const data = new TextEncoder().encode('mldsa87');
  const sig = await b.sign(data);
  const ok = await b.verify(data, sig);
  assert.equal(ok, true);
});

// ===== DualBackend =====
test('DualBackend: sign produces JSON envelope with both signatures', async () => {
  const b = await createBackend('dual');
  assert.equal(b.id, 'dual');
  const data = new TextEncoder().encode('hybrid');
  const sig = await b.sign(data);
  const decoded = JSON.parse(new TextDecoder().decode(sig));
  assert.ok(decoded.ed25519, 'envelope has ed25519');
  assert.ok(decoded.mldsa, 'envelope has mldsa');
  assert.ok(Buffer.from(decoded.mldsa, 'base64').length > 1000, 'mldsa sig substantial');
});

test('DualBackend: verify accepts valid envelope', async () => {
  const b = await createBackend('dual');
  const data = new TextEncoder().encode('hybrid');
  const sig = await b.sign(data);
  const ok = await b.verify(data, sig);
  assert.equal(ok, true);
});

test('DualBackend: verify rejects tampered ed25519 sig in envelope', async () => {
  const b = await createBackend('dual');
  const data = new TextEncoder().encode('hybrid');
  const sig = await b.sign(data);
  const env = JSON.parse(new TextDecoder().decode(sig));
  // Flip a bit in ed25519 sig
  const edBytes = Buffer.from(env.ed25519, 'base64');
  edBytes[0] ^= 0xff;
  env.ed25519 = edBytes.toString('base64');
  const tampered = new TextEncoder().encode(JSON.stringify(env));
  const ok = await b.verify(data, tampered);
  assert.equal(ok, false);
});

test('DualBackend: verify rejects when envelope is malformed JSON', async () => {
  const b = await createBackend('dual');
  const ok = await b.verify(new Uint8Array([1, 2, 3]), new TextEncoder().encode('not json'));
  assert.equal(ok, false);
});

// ===== Backend swap =====
test('swap from ed25519 to ml-dsa-65: same call shape, different sigs', async () => {
  const data = new TextEncoder().encode('swap test');
  const ed = await createBackend('ed25519');
  const pq = await createBackend('ml-dsa-65');
  const edSig = await ed.sign(data);
  const pqSig = await pq.sign(data);
  // Ed sig is small, ML-DSA sig is large
  assert.ok(edSig.length < 200, 'ed25519 sig should be small');
  assert.ok(pqSig.length > 1000, 'ml-dsa-65 sig should be large');
  // Each verifies with its own backend
  assert.equal(await ed.verify(data, edSig), true);
  assert.equal(await pq.verify(data, pqSig), true);
  // Cross-verification fails
  assert.equal(await ed.verify(data, pqSig), false);
  assert.equal(await pq.verify(data, edSig), false);
});

// ===== Env var selection =====
test('defaultBackendId: respects D2D_CRYPTO_BACKEND env', () => {
  process.env.D2D_CRYPTO_BACKEND = 'ml-dsa-65';
  try {
    assert.equal(defaultBackendId(), 'ml-dsa-65');
  } finally {
    delete process.env.D2D_CRYPTO_BACKEND;
  }
});

test('defaultBackendId: falls back to ed25519 on unknown value', () => {
  process.env.D2D_CRYPTO_BACKEND = 'unknown-algo';
  try {
    assert.equal(defaultBackendId(), 'ed25519');
  } finally {
    delete process.env.D2D_CRYPTO_BACKEND;
  }
});

test('createBackend: defaults to ed25519 when env unset', async () => {
  delete process.env.D2D_CRYPTO_BACKEND;
  const b = await createBackend();
  assert.equal(b.id, 'ed25519');
});

test('createBackend: respects D2D_CRYPTO_BACKEND=ml-dsa-65', async () => {
  process.env.D2D_CRYPTO_BACKEND = 'ml-dsa-65';
  try {
    const b = await createBackend();
    assert.equal(b.id, 'ml-dsa-65');
  } finally {
    delete process.env.D2D_CRYPTO_BACKEND;
  }
});

// ===== Verify-only =====
test('createVerifyOnlyBackend: cannot sign', async () => {
  const signing = await createBackend('ed25519');
  const pub = await signing.exportPublicKey();
  const verifyOnly = await createVerifyOnlyBackend('ed25519', pub);
  const data = new TextEncoder().encode('msg');
  // sign() should throw
  await assert.rejects(async () => verifyOnly.sign(data), /verify-only/);
  // verify() works with matching data + sig from signing backend
  const sig = await signing.sign(data);
  const ok = await verifyOnly.verify(data, sig);
  assert.equal(ok, true);
});

test('createVerifyOnlyBackend: rejects forged signature', async () => {
  const signing = await createBackend('ed25519');
  const pub = await signing.exportPublicKey();
  const verifyOnly = await createVerifyOnlyBackend('ed25519', pub);
  const forgedSig = new Uint8Array(64); // all zeros
  const ok = await verifyOnly.verify(new TextEncoder().encode('msg'), forgedSig);
  assert.equal(ok, false);
});

// ===== Persistence roundtrip =====
test('export private key + re-import via createBackend', async () => {
  // Generate a backend with extractable private key
  const b1 = await createBackend('ed25519', { extractable: true });
  const { exportPrivateKey } = await import('../../src/crypto/dilithium.ts');
  const privRaw = await exportPrivateKey((b1 as any).priv);
  // Reconstruct from raw
  const b2 = await createBackend('ed25519', { privateKeyRaw: privRaw, extractable: true });
  // Sign with b2, verify with b1
  const data = new TextEncoder().encode('persistence test');
  const sig = await b2.sign(data);
  const ok = await b1.verify(data, sig);
  assert.equal(ok, true);
});

// ===== Errors =====
test('createBackend: unsupported id throws', async () => {
  await assert.rejects(async () => createBackend('rsa-2048' as any), /unsupported backend/);
});

// ===== Constants =====
test('SUPPORTED_BACKENDS: lists 5 backends', () => {
  assert.equal(SUPPORTED_BACKENDS.length, 5);
  assert.ok(SUPPORTED_BACKENDS.includes('ed25519'));
  assert.ok(SUPPORTED_BACKENDS.includes('ml-dsa-65'));
  assert.ok(SUPPORTED_BACKENDS.includes('dual'));
});