// @wufufu770/d2d-core test - dual-track signing (Ed25519 + ML-DSA)
// Run with: node --experimental-strip-types --test test/crypto/dilithium.test.ts

import { test } from 'node:test';
import assert from 'node:assert';
import {
  generateKeyPair,
  sign,
  verify,
  exportPublicKey,
  importPublicKey,
  exportPrivateKey,
  importPrivateKey,
  dualSign,
  dualVerify,
} from '../../src/crypto/dilithium.ts';

// ===== Ed25519 =====
test('Ed25519: generate + sign + verify roundtrip', async () => {
  const kp = await generateKeyPair('ed25519');
  const data = new TextEncoder().encode('hello d2d');
  const sig = await sign('ed25519', kp.privateKey, data);
  assert.ok(sig.length > 0, 'signature must be non-empty');
  const ok = await verify('ed25519', kp.publicKey, sig, data);
  assert.equal(ok, true);
});

test('Ed25519: verify rejects tampered data', async () => {
  const kp = await generateKeyPair('ed25519');
  const data = new TextEncoder().encode('hello');
  const sig = await sign('ed25519', kp.privateKey, data);
  const tampered = new TextEncoder().encode('hellx');
  const ok = await verify('ed25519', kp.publicKey, sig, tampered);
  assert.equal(ok, false);
});

test('Ed25519: verify rejects wrong key', async () => {
  const kp1 = await generateKeyPair('ed25519');
  const kp2 = await generateKeyPair('ed25519');
  const data = new TextEncoder().encode('msg');
  const sig = await sign('ed25519', kp1.privateKey, data);
  const ok = await verify('ed25519', kp2.publicKey, sig, data);
  assert.equal(ok, false);
});

// ===== ML-DSA-65 =====
test('ML-DSA-65: generate + sign + verify roundtrip', async () => {
  const kp = await generateKeyPair('ml-dsa-65');
  const data = new TextEncoder().encode('post-quantum d2d');
  const sig = await sign('ml-dsa-65', kp.privateKey, data);
  assert.ok(sig.length > 0, 'signature must be non-empty');
  // ML-DSA-65 sigs are ~3KB
  assert.ok(sig.length > 1000, 'ML-DSA-65 signature should be substantial');
  const ok = await verify('ml-dsa-65', kp.publicKey, sig, data);
  assert.equal(ok, true);
});

test('ML-DSA-65: verify rejects tampered data', async () => {
  const kp = await generateKeyPair('ml-dsa-65');
  const data = new TextEncoder().encode('hello');
  const sig = await sign('ml-dsa-65', kp.privateKey, data);
  const tampered = new TextEncoder().encode('hellx');
  const ok = await verify('ml-dsa-65', kp.publicKey, sig, tampered);
  assert.equal(ok, false);
});

// ===== ML-DSA-44 + ML-DSA-87 =====
test('ML-DSA-44: roundtrip', async () => {
  const kp = await generateKeyPair('ml-dsa-44');
  const data = new TextEncoder().encode('mldsa44');
  const sig = await sign('ml-dsa-44', kp.privateKey, data);
  const ok = await verify('ml-dsa-44', kp.publicKey, sig, data);
  assert.equal(ok, true);
});

test('ML-DSA-87: roundtrip', async () => {
  const kp = await generateKeyPair('ml-dsa-87');
  const data = new TextEncoder().encode('mldsa87');
  const sig = await sign('ml-dsa-87', kp.privateKey, data);
  const ok = await verify('ml-dsa-87', kp.publicKey, sig, data);
  assert.equal(ok, true);
});

// ===== Cross-alg =====
test('Ed25519 signature fails verification under ML-DSA-65', async () => {
  const ed = await generateKeyPair('ed25519');
  const pq = await generateKeyPair('ml-dsa-65');
  const data = new TextEncoder().encode('msg');
  const edSig = await sign('ed25519', ed.privateKey, data);
  const ok = await verify('ml-dsa-65', pq.publicKey, edSig, data);
  assert.equal(ok, false, 'ed25519 sig must not verify as ML-DSA');
});

// ===== Export / Import =====
test('exportPublicKey + importPublicKey: roundtrip', async () => {
  const kp = await generateKeyPair('ed25519', { extractable: true });
  const raw = await exportPublicKey(kp.publicKey);
  assert.ok(raw.length > 0);
  const imported = await importPublicKey('ed25519', raw);
  // Should verify the original signature
  const data = new TextEncoder().encode('verify-after-import');
  const sig = await sign('ed25519', kp.privateKey, data);
  const ok = await verify('ed25519', imported, sig, data);
  assert.equal(ok, true);
});

test('exportPublicKey: works regardless of extractable (public key is always exportable)', async () => {
  const kp = await generateKeyPair('ed25519');  // extractable=false default
  const raw = await exportPublicKey(kp.publicKey);
  assert.ok(raw.length > 0, 'public key export should succeed even when extractable=false');
});

test('exportPrivateKey: not extractable by default → throws', async () => {
  const kp = await generateKeyPair('ed25519');  // extractable=false default
  await assert.rejects(async () => exportPrivateKey(kp.privateKey));
});

test('exportPrivateKey + importPrivateKey: roundtrip', async () => {
  const kp = await generateKeyPair('ed25519', { extractable: true, exportPrivate: true });
  const raw = await exportPrivateKey(kp.privateKey);
  const imported = await importPrivateKey('ed25519', raw, { extractable: true });
  const data = new TextEncoder().encode('sign-after-import');
  const sig = await sign('ed25519', imported, data);
  const ok = await verify('ed25519', kp.publicKey, sig, data);
  assert.equal(ok, true);
});

// ===== Dual sign =====
test('dualSign: produces both signatures + both verify', async () => {
  const data = new TextEncoder().encode('hybrid');
  const { ed25519, mldsa } = await dualSign(data, { extractable: false });
  assert.ok(ed25519.signature.length > 0);
  assert.ok(mldsa.signature.length > 1000, 'ML-DSA sig should be substantial');
  const ok = await dualVerify(data, ed25519, mldsa);
  assert.equal(ok, true);
});

test('dualVerify: rejects when ed25519 sig is tampered', async () => {
  const data = new TextEncoder().encode('hybrid');
  const { ed25519, mldsa } = await dualSign(data, { extractable: false });
  // Tamper with ed25519 signature (flip a byte)
  const tampered = new Uint8Array(ed25519.signature);
  tampered[0] ^= 0xff;
  const ok = await dualVerify(data, { ...ed25519, signature: tampered }, mldsa);
  assert.equal(ok, false);
});

test('dualVerify: rejects when ML-DSA sig is tampered', async () => {
  const data = new TextEncoder().encode('hybrid');
  const { ed25519, mldsa } = await dualSign(data, { extractable: false });
  const tampered = new Uint8Array(mldsa.signature);
  tampered[0] ^= 0xff;
  const ok = await dualVerify(data, ed25519, { ...mldsa, signature: tampered });
  assert.equal(ok, false);
});

// ===== Errors =====
test('unsupported algorithm throws', async () => {
  await assert.rejects(async () => generateKeyPair('ml-dsa-99' as any), /unsupported/);
  const kp = await generateKeyPair('ed25519');
  await assert.rejects(async () => sign('ml-dsa-99' as any, kp.privateKey, new Uint8Array()), /unsupported/);
  await assert.rejects(async () => verify('ml-dsa-99' as any, kp.publicKey, new Uint8Array(), new Uint8Array()), /unsupported/);
});

test('verify returns false for malformed signature (does not throw)', async () => {
  const kp = await generateKeyPair('ed25519');
  const ok = await verify('ed25519', kp.publicKey, new Uint8Array([1, 2, 3]), new Uint8Array([4, 5, 6]));
  assert.equal(ok, false);
});