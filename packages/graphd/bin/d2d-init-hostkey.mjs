#!/usr/bin/env node
// @wufufu770/d2d-graphd - generate Ed25519 host-key (idempotent)
import { ensureHostKey } from '../lib/host-key.mjs';

const configDir = process.env.D2D_CONFIG_DIR || undefined;

ensureHostKey(configDir).then(({ privPath, pubPath, fp }) => {
  console.log(`[d2d-graphd] ✓ host-key ready`);
  console.log(`  private: ${privPath}`);
  console.log(`  public:  ${pubPath}`);
  console.log(`  fingerprint: ${fp}`);
}).catch(err => {
  console.error(`[d2d-graphd] ERROR: ${err.message}`);
  process.exit(1);
});
