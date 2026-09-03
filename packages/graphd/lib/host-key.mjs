// @wufufu770/d2d-graphd - Ed25519 host-key management
import { generateKeyPairSync, createPrivateKey, createPublicKey, createHash, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync, readFileSync, chmodSync, renameSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

function defaultConfigDir() {
  if (process.env.D2D_CONFIG_DIR) return path.resolve(process.env.D2D_CONFIG_DIR);
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', 'd2d');
  }
  if (process.platform === 'win32') {
    return path.join(process.env.APPDATA || os.homedir(), 'd2d');
  }
  return path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'), 'd2d');
}

async function ensureHostKey(configDir) {
  const dir = configDir || defaultConfigDir();
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const privPath = path.join(dir, 'host-key');
  const pubPath = path.join(dir, 'host-key.pub');
  const fpPath = path.join(dir, 'host-key.fp');
  const tokenPath = path.join(dir, 'host-token');

  // Idempotent: skip if already exists
  if (existsSync(privPath) && existsSync(pubPath)) {
    const fp = existsSync(fpPath)
      ? readFileSync(fpPath, 'utf8').trim()
      : await computeFingerprint(pubPath);
    return { privPath, pubPath, fp };
  }

  // Generate Ed25519 keypair
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const privPem = privateKey.export({ type: 'pkcs8', format: 'pem' });
  const pubPem = publicKey.export({ type: 'spki', format: 'pem' });

  // Atomic write (temp + rename)
  const privTmp = privPath + '.tmp.' + process.pid;
  const pubTmp = pubPath + '.tmp.' + process.pid;
  writeFileSync(privTmp, privPem, { mode: 0o600 });
  writeFileSync(pubTmp, pubPem, { mode: 0o644 });
  renameSync(privTmp, privPath);
  renameSync(pubTmp, pubPath);
  chmodSync(privPath, 0o600);
  chmodSync(pubPath, 0o644);

  // Write fingerprint
  const fp = await computeFingerprint(pubPath);
  writeFileSync(fpPath, fp + '\n', { mode: 0o644 });

  // Compatibility: legacy host-token
  if (!existsSync(tokenPath)) {
    const tok = randomBytes(32).toString('hex');
    writeFileSync(tokenPath, tok, { mode: 0o600 });
  }

  return { privPath, pubPath, fp };
}

async function computeFingerprint(pubPath) {
  const pem = readFileSync(pubPath);
  const der = createPublicKey(pem).export({ type: 'spki', format: 'der' });
  return createHash('sha256').update(der).digest('hex');
}

export { ensureHostKey, computeFingerprint, defaultConfigDir };
