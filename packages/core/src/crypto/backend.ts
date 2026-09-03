// @wufufu770/d2d-core — CryptoBackend abstraction (Issue #60)
//
// Unified interface over Ed25519 / ML-DSA / dual-track signing so that
// callers can swap the active backend via config without touching signing code.
//
// Selection:
//   • D2D_CRYPTO_BACKEND env var: 'ed25519' | 'ml-dsa-44' | 'ml-dsa-65' | 'ml-dsa-87' | 'dual'
//   • Default: 'ed25519' (smallest, fastest, well-deployed)
//   • createBackend(id, opts) for explicit override
//
// Implementations:
//   • Ed25519Backend  — single Ed25519 signature
//   • MLDsaBackend    — single ML-DSA signature (44/65/87 selectable)
//   • DualBackend     — composes Ed25519Backend + MLDsaBackend; both must verify
//
// All backends expose:
//   • id (string)              — algorithm identifier
//   • sign(data) → sig         — produce signature bytes
//   • verify(data, sig) → bool — verify signature
//   • exportPublicKey() → raw  — SPKI bytes (for sharing with verifier)
//   • fingerprint() → hex      — sha256(public-key SPKI DER); stable identifier
//
// 0 npm deps. Uses dilithium.ts (Ed25519 + ML-DSA) + node:crypto for hashing.

import { createHash, webcrypto } from 'node:crypto';
import {
  generateKeyPair as genLowLevel,
  sign as lowSign,
  verify as lowVerify,
  exportPublicKey as lowExportPub,
  importPublicKey as lowImportPub,
  exportPrivateKey as lowExportPriv,
  importPrivateKey as lowImportPriv,
  type SigAlg,
} from './dilithium.ts';

// ===== Types =====
export type BackendId = 'ed25519' | 'ml-dsa-44' | 'ml-dsa-65' | 'ml-dsa-87' | 'dual';

export interface CryptoBackend {
  readonly id: BackendId;
  sign(data: Uint8Array): Promise<Uint8Array>;
  verify(data: Uint8Array, signature: Uint8Array): Promise<boolean>;
  exportPublicKey(): Promise<Uint8Array>;
  fingerprint(): Promise<string>;
  /** Internal — algorithm under the hood (helps diagnostics) */
  readonly algorithm: SigAlg;
}

export interface BackendOpts {
  /** Pre-loaded private key bytes (pkcs8). If absent, a fresh keypair is generated. */
  privateKeyRaw?: Uint8Array;
  /** Pre-loaded public key bytes (spki). Required when verifying-only. */
  publicKeyRaw?: Uint8Array;
  /** Generate extractable keys (needed for export). Default: false. */
  extractable?: boolean;
}

// ===== Helpers =====
async function sha256Hex(data: Uint8Array): Promise<string> {
  return createHash('sha256').update(data).digest('hex');
}

// ===== Ed25519 Backend =====
export class Ed25519Backend implements CryptoBackend {
  readonly id: BackendId = 'ed25519';
  readonly algorithm: SigAlg = 'ed25519';
  private priv: webcrypto.CryptoKey | null;
  private pub: webcrypto.CryptoKey;

  constructor(priv: webcrypto.CryptoKey | null, pub: webcrypto.CryptoKey) {
    this.priv = priv;
    this.pub = pub;
  }

  async sign(data: Uint8Array): Promise<Uint8Array> {
    if (!this.priv) throw new Error('verify-only backend cannot sign');
    return await lowSign('ed25519', this.priv, data);
  }
  async verify(data: Uint8Array, signature: Uint8Array): Promise<boolean> {
    return await lowVerify('ed25519', this.pub, signature, data);
  }
  async exportPublicKey(): Promise<Uint8Array> {
    return await lowExportPub(this.pub);
  }
  async fingerprint(): Promise<string> {
    const raw = await this.exportPublicKey();
    return await sha256Hex(raw);
  }
}

// ===== ML-DSA Backend =====
export class MLDsaBackend implements CryptoBackend {
  readonly id: BackendId;
  readonly algorithm: SigAlg;
  private priv: webcrypto.CryptoKey | null;
  private pub: webcrypto.CryptoKey;

  constructor(alg: 'ml-dsa-44' | 'ml-dsa-65' | 'ml-dsa-87', priv: webcrypto.CryptoKey | null, pub: webcrypto.CryptoKey) {
    this.algorithm = alg;
    this.id = alg;
    this.priv = priv;
    this.pub = pub;
  }

  async sign(data: Uint8Array): Promise<Uint8Array> {
    if (!this.priv) throw new Error('verify-only backend cannot sign');
    return await lowSign(this.algorithm, this.priv, data);
  }
  async verify(data: Uint8Array, signature: Uint8Array): Promise<boolean> {
    return await lowVerify(this.algorithm, this.pub, signature, data);
  }
  async exportPublicKey(): Promise<Uint8Array> {
    return await lowExportPub(this.pub);
  }
  async fingerprint(): Promise<string> {
    const raw = await this.exportPublicKey();
    return await sha256Hex(raw);
  }
}

// ===== Dual Backend =====
/**
 * Wraps two backends (Ed25519 + ML-DSA-65). sign() emits a JSON envelope
 * `{ ed25519: "...", mldsa: "..." }` with both signatures base64-encoded.
 * verify() requires both to validate.
 *
 * Wire format: `{"ed25519":"<base64>","mldsa":"<base64>"}` — JSON, ~3.5KB total.
 * Migration: old verifiers accepting only ed25519 must update to parse the JSON.
 */
export class DualBackend implements CryptoBackend {
  readonly id: BackendId = 'dual';
  readonly algorithm: SigAlg = 'ed25519'; // primary for diagnostics
  private ed: Ed25519Backend;
  private pq: MLDsaBackend;

  constructor(ed: Ed25519Backend, pq: MLDsaBackend) {
    this.ed = ed;
    this.pq = pq;
  }

  async sign(data: Uint8Array): Promise<Uint8Array> {
    const edSig = await this.ed.sign(data);
    const pqSig = await this.pq.sign(data);
    const env = {
      ed25519: Buffer.from(edSig).toString('base64'),
      mldsa: Buffer.from(pqSig).toString('base64'),
    };
    return new TextEncoder().encode(JSON.stringify(env));
  }

  async verify(data: Uint8Array, signature: Uint8Array): Promise<boolean> {
    let env: { ed25519?: string; mldsa?: string };
    try {
      env = JSON.parse(new TextDecoder().decode(signature));
    } catch {
      return false;
    }
    if (!env.ed25519 || !env.mldsa) return false;
    const edOk = await this.ed.verify(data, Buffer.from(env.ed25519, 'base64'));
    if (!edOk) return false;
    return await this.pq.verify(data, Buffer.from(env.mldsa, 'base64'));
  }

  async exportPublicKey(): Promise<Uint8Array> {
    // Emit a JSON envelope so the dual public key is recoverable
    const edPub = await this.ed.exportPublicKey();
    const pqPub = await this.pq.exportPublicKey();
    const env = {
      ed25519: Buffer.from(edPub).toString('base64'),
      mldsa: Buffer.from(pqPub).toString('base64'),
    };
    return new TextEncoder().encode(JSON.stringify(env));
  }

  async fingerprint(): Promise<string> {
    const raw = await this.exportPublicKey();
    return await sha256Hex(raw);
  }
}

// ===== Factory =====
const SUPPORTED_BACKENDS: BackendId[] = ['ed25519', 'ml-dsa-44', 'ml-dsa-65', 'ml-dsa-87', 'dual'];

export function defaultBackendId(): BackendId {
  const env = process.env.D2D_CRYPTO_BACKEND ?? 'ed25519';
  return (SUPPORTED_BACKENDS as string[]).includes(env) ? (env as BackendId) : 'ed25519';
}

/**
 * Create a CryptoBackend by id. If `privateKeyRaw` / `publicKeyRaw` are
 * provided, they're imported instead of generating fresh keys (useful for
 * restoring from persistence).
 */
export async function createBackend(id: BackendId = defaultBackendId(), opts: BackendOpts = {}): Promise<CryptoBackend> {
  if (!SUPPORTED_BACKENDS.includes(id)) {
    throw new Error(`unsupported backend: ${id} (supported: ${SUPPORTED_BACKENDS.join(', ')})`);
  }
  const extractable = opts.extractable ?? (opts.privateKeyRaw !== undefined || opts.publicKeyRaw !== undefined);

  if (id === 'dual') {
    // For dual, both keys are needed for signing — generate fresh keypairs
    // unless caller explicitly provides both raw keys.
    let edKp, pqKp;
    if (opts.privateKeyRaw && opts.publicKeyRaw) {
      edKp = { privateKey: await lowImportPriv('ed25519', opts.privateKeyRaw, { extractable }), publicKey: await lowImportPub('ed25519', opts.publicKeyRaw) };
      pqKp = { privateKey: await lowImportPriv('ml-dsa-65', opts.privateKeyRaw, { extractable }), publicKey: await lowImportPub('ml-dsa-65', opts.publicKeyRaw) };
    } else {
      edKp = await genLowLevel('ed25519', { extractable });
      pqKp = await genLowLevel('ml-dsa-65', { extractable });
    }
    const ed = new Ed25519Backend(edKp.privateKey, edKp.publicKey);
    const pq = new MLDsaBackend('ml-dsa-65', pqKp.privateKey, pqKp.publicKey);
    return new DualBackend(ed, pq);
  }

  if (id === 'ed25519') {
    if (opts.privateKeyRaw) {
      const priv = await lowImportPriv('ed25519', opts.privateKeyRaw, { extractable });
      const pub = opts.publicKeyRaw
        ? await lowImportPub('ed25519', opts.publicKeyRaw)
        : priv; // Web Crypto can derive public from private; but it's separate — keep separate
      return new Ed25519Backend(priv, pub as webcrypto.CryptoKey);
    }
    const kp = await genLowLevel('ed25519', { extractable });
    return new Ed25519Backend(kp.privateKey, kp.publicKey);
  }

  // ml-dsa-44 / 65 / 87
  const alg = id;
  if (opts.privateKeyRaw) {
    const priv = await lowImportPriv(alg, opts.privateKeyRaw, { extractable });
    const pub = opts.publicKeyRaw
      ? await lowImportPub(alg, opts.publicKeyRaw)
      : priv;
    return new MLDsaBackend(alg, priv, pub as webcrypto.CryptoKey);
  }
  const kp = await genLowLevel(alg, { extractable });
  return new MLDsaBackend(alg, kp.privateKey, kp.publicKey);
}

/**
 * Reconstruct a backend from public key bytes only (verify-only mode).
 * Used by verifiers that don't have access to the private key.
 * sign() on the returned backend will throw.
 */
export async function createVerifyOnlyBackend(id: BackendId, publicKeyRaw: Uint8Array): Promise<CryptoBackend> {
  if (id === 'dual') {
    const env = JSON.parse(new TextDecoder().decode(publicKeyRaw)) as { ed25519: string; mldsa: string };
    const edPub = await lowImportPub('ed25519', Buffer.from(env.ed25519, 'base64'));
    const pqPub = await lowImportPub('ml-dsa-65', Buffer.from(env.mldsa, 'base64'));
    const ed = new Ed25519Backend(null, edPub);
    const pq = new MLDsaBackend('ml-dsa-65', null, pqPub);
    return new DualBackend(ed, pq);
  }
  if (id === 'ed25519') {
    const pub = await lowImportPub('ed25519', publicKeyRaw);
    return new Ed25519Backend(null, pub);
  }
  const pub = await lowImportPub(id, publicKeyRaw);
  return new MLDsaBackend(id, null, pub);
}

export { SUPPORTED_BACKENDS };