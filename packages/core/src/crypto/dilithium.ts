// @wufufu770/d2d-core — dual-track signing: Ed25519 (current) + ML-DSA (NIST PQC FIPS 204)
//
// ML-DSA is the NIST post-quantum signature standard (formerly CRYSTALS-Dilithium).
// Three parameter sets per FIPS 204:
//   ml-dsa-44 — 128-bit security, smaller signatures (~2KB), fastest
//   ml-dsa-65 — 192-bit security, balanced (recommended default)
//   ml-dsa-87 — 256-bit security, largest signatures (~4KB), slowest
//
// Available in Node 22+ via Web Crypto (`crypto.subtle`); the implementation
// is OpenSSL 3.5+'s ML-DSA backend. We surface a uniform API that lets callers
// pick the algorithm per signature.
//
// Why dual-track:
//   • Ed25519 stays as default — small signatures, fast, well-deployed
//   • ML-DSA ready for post-quantum — used selectively for high-value artifacts
//     (engagement signing, finding attribution, etc.) that must survive
//     quantum adversary timeline

import { webcrypto } from 'node:crypto';

const subtle = webcrypto.subtle;

// ===== Types =====
export type SigAlg = 'ed25519' | 'ml-dsa-44' | 'ml-dsa-65' | 'ml-dsa-87';

export interface KeyPair {
  alg: SigAlg;
  publicKey: webcrypto.CryptoKey;
  privateKey: webcrypto.CryptoKey;
  /** Extractable flag — must be true for export. */
  extractable: boolean;
}

export interface ExportableKeyPair extends KeyPair {
  publicKeyRaw: Uint8Array;
  privateKeyRaw?: Uint8Array;  // omitted unless explicitly requested
}

export interface GenerateOpts {
  extractable?: boolean;  // default false (only publicKey exportable by default)
  exportPrivate?: boolean;  // default false
}

// ===== Algorithm map =====
const ALG_MAP: Record<SigAlg, { name: string; namedCurve?: string }> = {
  'ed25519': { name: 'Ed25519' },
  'ml-dsa-44': { name: 'ML-DSA-44' },
  'ml-dsa-65': { name: 'ML-DSA-65' },
  'ml-dsa-87': { name: 'ML-DSA-87' },
};

const SUPPORTED: SigAlg[] = ['ed25519', 'ml-dsa-44', 'ml-dsa-65', 'ml-dsa-87'];

// ===== Key generation =====
export async function generateKeyPair(alg: SigAlg = 'ed25519', opts: GenerateOpts = {}): Promise<KeyPair> {
  if (!SUPPORTED.includes(alg)) {
    throw new Error(`unsupported signature algorithm: ${alg}`);
  }
  const algoDef = ALG_MAP[alg];
  const extractable = opts.extractable ?? false;
  let kp: webcrypto.CryptoKeyPair;
  try {
    kp = await subtle.generateKey({ name: algoDef.name, namedCurve: algoDef.namedCurve } as any, extractable, ['sign', 'verify']) as webcrypto.CryptoKeyPair;
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`failed to generate ${alg} keypair: ${msg}`);
  }
  return {
    alg,
    publicKey: kp.publicKey,
    privateKey: kp.privateKey,
    extractable,
  };
}

// ===== Sign / verify =====
export async function sign(alg: SigAlg, privateKey: webcrypto.CryptoKey, data: Uint8Array): Promise<Uint8Array> {
  if (!SUPPORTED.includes(alg)) {
    throw new Error(`unsupported signature algorithm: ${alg}`);
  }
  const sig = await subtle.sign({ name: ALG_MAP[alg].name } as any, privateKey, data as BufferSource);
  return new Uint8Array(sig);
}

export async function verify(alg: SigAlg, publicKey: webcrypto.CryptoKey, signature: Uint8Array, data: Uint8Array): Promise<boolean> {
  if (!SUPPORTED.includes(alg)) {
    throw new Error(`unsupported signature algorithm: ${alg}`);
  }
  try {
    return await subtle.verify({ name: ALG_MAP[alg].name } as any, publicKey, signature as BufferSource, data as BufferSource);
  } catch {
    return false; // malformed sig, wrong key type, etc. — not a "valid forgery"
  }
}

// ===== Key export / import =====
export async function exportPublicKey(publicKey: webcrypto.CryptoKey): Promise<Uint8Array> {
  const raw = await subtle.exportKey('spki', publicKey);
  return new Uint8Array(raw);
}

export async function importPublicKey(alg: SigAlg, raw: Uint8Array, opts: GenerateOpts = {}): Promise<webcrypto.CryptoKey> {
  if (!SUPPORTED.includes(alg)) {
    throw new Error(`unsupported signature algorithm: ${alg}`);
  }
  return await subtle.importKey(
    'spki',
    raw as BufferSource,
    { name: ALG_MAP[alg].name, namedCurve: ALG_MAP[alg].namedCurve } as any,
    opts.extractable ?? true,
    ['verify'],
  );
}

export async function exportPrivateKey(privateKey: webcrypto.CryptoKey): Promise<Uint8Array> {
  const raw = await subtle.exportKey('pkcs8', privateKey);
  return new Uint8Array(raw);
}

export async function importPrivateKey(alg: SigAlg, raw: Uint8Array, opts: GenerateOpts = {}): Promise<webcrypto.CryptoKey> {
  if (!SUPPORTED.includes(alg)) {
    throw new Error(`unsupported signature algorithm: ${alg}`);
  }
  return await subtle.importKey(
    'pkcs8',
    raw as BufferSource,
    { name: ALG_MAP[alg].name, namedCurve: ALG_MAP[alg].namedCurve } as any,
    opts.extractable ?? false,
    ['sign'],
  );
}

// ===== Utilities =====
/**
 * Dual-track: sign with both Ed25519 AND ML-DSA-65.
 * Returns { ed25519: sig, mldsa: sig } — both must verify.
 * Useful for transition period where verifier accepts both.
 */
export async function dualSign(data: Uint8Array, opts: GenerateOpts = {}): Promise<{
  ed25519: { publicKey: webcrypto.CryptoKey; signature: Uint8Array };
  mldsa: { publicKey: webcrypto.CryptoKey; signature: Uint8Array };
}> {
  const ed = await generateKeyPair('ed25519', opts);
  const pq = await generateKeyPair('ml-dsa-65', opts);
  return {
    ed25519: { publicKey: ed.publicKey, signature: await sign('ed25519', ed.privateKey, data) },
    mldsa: { publicKey: pq.publicKey, signature: await sign('ml-dsa-65', pq.privateKey, data) },
  };
}

/**
 * Verify dual-signature. Returns true only if both ed25519 and ML-DSA verify.
 */
export async function dualVerify(
  data: Uint8Array,
  ed: { publicKey: webcrypto.CryptoKey; signature: Uint8Array },
  pq: { publicKey: webcrypto.CryptoKey; signature: Uint8Array },
): Promise<boolean> {
  const [ok1, ok2] = await Promise.all([
    verify('ed25519', ed.publicKey, ed.signature, data),
    verify('ml-dsa-65', pq.publicKey, pq.signature, data),
  ]);
  return ok1 && ok2;
}

export { SUPPORTED, ALG_MAP };