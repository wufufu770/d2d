// @wufufu770/d2d-core — credentials.json encrypted store
//
// Stores 6 OSINT provider secrets at ~/.d2d-data/credentials.json (mode 0o600).
// Encryption: AES-256-GCM with a key derived via HKDF-SHA256 from the v0.2.0
// graphd Ed25519 host-key (private key PEM at ~/.config/d2d/host-key).
// Reuses the same host-key as #63 graphd — no new key material to manage.
//
// Each credential is a separate AES-GCM blob with a fresh 96-bit IV + auth tag.
// The host-key SHA-256 fingerprint is stored alongside so the user can detect
// key rotation (file unreadable after the host-key is regenerated).
//
// Cross-platform: D2D_DATA_DIR / D2D_HOST_KEY override paths; falls back to
// ~/.d2d-data and ~/.config/d2d/host-key (Linux/macOS) / %APPDATA%\d2d (Windows).

import {
  promises as fs,
  constants as fsConstants,
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  chmodSync,
  statSync,
} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';

export const PROVIDER_IDS = ['fofa', 'hunter', 'quake', 'riskbird', 'zoomeye', '0.zone'] as const;
export type ProviderId = (typeof PROVIDER_IDS)[number];

export const FILE_VERSION = 1 as const;
export const SALT = Buffer.from('d2d-osint-credentials-v1-salt', 'utf8'); // static salt (per-file random salt below)
export const HKDF_INFO = Buffer.from('d2d-credentials-aes256gcm-v1', 'utf8');
export const FILE_MODE = 0o600;
export const DIR_MODE = 0o700;

interface CredentialEntry {
  iv: string;         // base64 (12 bytes)
  tag: string;        // base64 (16 bytes)
  ciphertext: string; // base64
  v: 1;
}

interface CredentialsFile {
  version: typeof FILE_VERSION;
  createdAt: string;
  updatedAt: string;
  hostKeyFp: string;       // sha256 of public-key SPKI DER (hex)
  fileSalt: string;        // base64 (per-file random salt, mixed into HKDF)
  entries: Partial<Record<ProviderId, CredentialEntry>>;
}

export interface CredentialsPaths {
  hostKeyPath: string;
  dataDir: string;
  credPath: string;
}

export function defaultPaths(): CredentialsPaths {
  const hostKeyPath = process.env.D2D_HOST_KEY
    ?? (process.platform === 'win32'
      ? path.join(process.env.APPDATA || os.homedir(), 'd2d', 'host-key')
      : path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'), 'd2d', 'host-key'));
  const dataDir = process.env.D2D_DATA_DIR ?? path.join(os.homedir(), '.d2d-data');
  return {
    hostKeyPath,
    dataDir,
    credPath: path.join(dataDir, 'credentials.json'),
  };
}

// ===== Key loading =====
interface HostKey {
  priv: crypto.KeyObject;
  pub: crypto.KeyObject;
  fp: string;
  ephemeral: boolean;  // true if generated for this process (not persisted)
  path: string;
}

/**
 * Load the Ed25519 host-key from disk. If missing, generate an ephemeral key
 * (decryptable only in this process — callers should warn the user).
 */
export function loadHostKey(hostKeyPath: string = defaultPaths().hostKeyPath): HostKey {
  if (existsSync(hostKeyPath)) {
    const pem = readFileSync(hostKeyPath, 'utf8');
    const priv = crypto.createPrivateKey(pem);
    const pub = crypto.createPublicKey(priv);
    const fp = fingerprint(pub);
    return { priv, pub, fp, ephemeral: false, path: hostKeyPath };
  }
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519');
  return { priv: privateKey, pub: publicKey, fp: fingerprint(publicKey), ephemeral: true, path: hostKeyPath };
}

/** SHA-256 of SPKI DER — hex string. */
export function fingerprint(pub: crypto.KeyObject): string {
  const der = pub.export({ type: 'spki', format: 'der' });
  return crypto.createHash('sha256').update(der).digest('hex');
}

/**
 * Derive AES-256-GCM key via HKDF-SHA256:
 *   IKM   = SPKI DER of host public key (deterministic from host-key)
 *   salt  = fileSalt (random per credentials.json)
 *   info  = "d2d-credentials-aes256gcm-v1"
 *   L     = 32 bytes
 */
export function deriveKey(priv: crypto.KeyObject, fileSalt: Buffer): Buffer {
  const pub = crypto.createPublicKey(priv);
  const ikm = pub.export({ type: 'spki', format: 'der' });
  // hkdfSync returns ArrayBuffer; wrap as Buffer so AES key handles uniformly.
  const raw = crypto.hkdfSync('sha256', Buffer.from(ikm), fileSalt, HKDF_INFO, 32);
  return Buffer.from(raw);
}

// ===== Encrypt / decrypt =====
export function encrypt(plaintext: string, key: Buffer): CredentialEntry {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return {
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    ciphertext: ct.toString('base64'),
    v: 1,
  };
}

export function decrypt(entry: CredentialEntry, key: Buffer): string {
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(entry.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(entry.tag, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(entry.ciphertext, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}

// ===== Store =====
export class CredentialStore {
  private hostKey: HostKey;
  private fileSalt: Buffer;
  private aesKey: Buffer;
  private data: CredentialsFile;
  private dirty = false;
  private credPath: string;

  constructor(hostKeyPath?: string, credPath?: string) {
    const paths = defaultPaths();
    this.credPath = credPath ?? paths.credPath;
    this.hostKey = loadHostKey(hostKeyPath ?? paths.hostKeyPath);
    // fileSalt starts as a fresh 16-byte random — overwritten if existing file has one
    this.fileSalt = crypto.randomBytes(16);
    this.aesKey = deriveKey(this.hostKey.priv, this.fileSalt);
    this.data = {
      version: FILE_VERSION,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      hostKeyFp: this.hostKey.fp,
      fileSalt: this.fileSalt.toString('base64'),
      entries: {},
    };
  }

  /** True if the host key was generated for this process (not loaded from disk). */
  get isEphemeral(): boolean { return this.hostKey.ephemeral; }
  get hostKeyPath(): string { return this.hostKey.path; }
  get hostKeyFingerprint(): string { return this.hostKey.fp; }
  get dataPath(): string { return this.credPath; }

  /** Load existing credentials.json from disk (no-op if missing). */
  async load(): Promise<void> {
    let raw: string;
    try {
      raw = await fs.readFile(this.credPath, 'utf8');
    } catch (e: unknown) {
      const code = (e as NodeJS.ErrnoException)?.code;
      if (code === 'ENOENT') return; // first run — start fresh
      throw e;
    }
    const parsed = JSON.parse(raw) as CredentialsFile;
    if (parsed.version !== FILE_VERSION) {
      throw new Error(`unsupported credentials.json version: ${parsed.version}`);
    }
    if (parsed.hostKeyFp !== this.hostKey.fp) {
      throw new Error(`host-key fingerprint mismatch (file: ${parsed.hostKeyFp.slice(0, 12)}…, current: ${this.hostKey.fp.slice(0, 12)}…)`);
    }
    // Re-derive key with the file's own salt (overrides our initial random)
    this.fileSalt = Buffer.from(parsed.fileSalt, 'base64');
    this.aesKey = deriveKey(this.hostKey.priv, this.fileSalt);
    this.data = parsed;
  }

  /** Persist to disk (mode 0o600). Creates parent dir if missing. */
  async save(): Promise<void> {
    this.data.updatedAt = new Date().toISOString();
    mkdirSync(path.dirname(this.credPath), { recursive: true, mode: DIR_MODE });
    // Write atomically: write to temp, then rename
    const tmp = `${this.credPath}.tmp`;
    writeFileSync(tmp, JSON.stringify(this.data, null, 2), { mode: FILE_MODE });
    try {
      const { rename } = await import('node:fs/promises');
      await rename(tmp, this.credPath);
    } catch (e) {
      // Fallback: direct write (Windows rename can fail across drives)
      writeFileSync(this.credPath, JSON.stringify(this.data, null, 2), { mode: FILE_MODE });
      try { await fs.unlink(tmp); } catch { /* best-effort */ }
    }
    // Enforce mode (umask can mask the writeFile mode)
    try { chmodSync(this.credPath, FILE_MODE); } catch { /* windows */ }
    this.dirty = false;
  }

  /** Encrypt + store a credential for one provider. Auto-saves. */
  async set(provider: ProviderId, value: string): Promise<void> {
    if (!PROVIDER_IDS.includes(provider)) {
      throw new Error(`unknown provider: ${provider}`);
    }
    if (typeof value !== 'string' || value.trim() === '') {
      throw new Error('credential must be a non-empty string');
    }
    this.data.entries[provider] = encrypt(value.trim(), this.aesKey);
    this.dirty = true;
    await this.save();
  }

  /** Decrypt + return a stored credential, or null if unset. */
  async get(provider: ProviderId): Promise<string | null> {
    const entry = this.data.entries[provider];
    if (!entry) return null;
    try {
      return decrypt(entry, this.aesKey);
    } catch {
      return null; // wrong key → null (caller should check fingerprint)
    }
  }

  /** Delete a credential. Returns true if it existed. */
  async delete(provider: ProviderId): Promise<boolean> {
    if (!(provider in this.data.entries)) return false;
    delete this.data.entries[provider];
    this.dirty = true;
    await this.save();
    return true;
  }

  /** List all providers with their set/unset status (no secrets returned). */
  async list(): Promise<Array<{ provider: ProviderId; set: boolean }>> {
    return PROVIDER_IDS.map((p) => ({
      provider: p,
      set: p in this.data.entries,
    }));
  }

  /** Resolve a provider's credential, falling back to env var if unset. */
  async resolve(provider: ProviderId): Promise<string | null> {
    const fromStore = await this.get(provider);
    if (fromStore !== null) return fromStore;
    // Env fallback: <PROVIDER>_TOKEN or similar
    const envName = `${provider.toUpperCase().replace(/\./g, '')}_TOKEN`;
    return process.env[envName] ?? null;
  }
}

// ===== CLI =====
/**
 * CLI entry point. args: ['set'|'get'|'list'|'delete', ...]
 */
export async function runCli(args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  const [cmd, ...rest] = args;
  const store = new CredentialStore();
  await store.load();

  if (cmd === 'set') {
    const provider = rest[0] as ProviderId;
    const value = rest[1];
    if (!provider || !value) {
      return { code: 2, stdout: '', stderr: 'usage: d2d credentials set <provider> <value>' };
    }
    if (store.isEphemeral) {
      return { code: 3, stdout: '', stderr: 'warning: no host-key found at ' + store.hostKeyPath + '; using ephemeral key (set will NOT survive across processes). Run `d2d init` first.' };
    }
    await store.set(provider, value);
    return { code: 0, stdout: `set ${provider} (fingerprint: ${store.hostKeyFingerprint.slice(0, 12)}…)`, stderr: '' };
  }
  if (cmd === 'get') {
    const provider = rest[0] as ProviderId;
    if (!provider) return { code: 2, stdout: '', stderr: 'usage: d2d credentials get <provider>' };
    const v = await store.get(provider);
    return v === null
      ? { code: 0, stdout: '(unset)', stderr: '' }
      : { code: 0, stdout: v, stderr: '' };
  }
  if (cmd === 'delete') {
    const provider = rest[0] as ProviderId;
    if (!provider) return { code: 2, stdout: '', stderr: 'usage: d2d credentials delete <provider>' };
    const ok = await store.delete(provider);
    return { code: 0, stdout: ok ? `deleted ${provider}` : `${provider} was not set`, stderr: '' };
  }
  if (cmd === 'list' || cmd === undefined) {
    const rows = await store.list();
    const out = ['provider     set', '-----------  ----'];
    for (const r of rows) out.push(`${r.provider.padEnd(11)}  ${r.set ? 'yes' : 'no'}`);
    if (store.isEphemeral) {
      out.push('', '(ephemeral host-key — values will not survive across processes)');
    }
    return { code: 0, stdout: out.join('\n'), stderr: '' };
  }
  return { code: 2, stdout: '', stderr: `unknown command: ${cmd}` };
}

// Re-export for tests
export { fsConstants };