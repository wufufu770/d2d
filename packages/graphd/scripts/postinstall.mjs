#!/usr/bin/env node
// @wuxufu770/d2d-graphd postinstall: install kuzu python dep + init host-key

import { execSync } from 'node:child_process';
import { ensureHostKey } from '../lib/host-key.mjs';

function checkPython() {
  try {
    const v = execSync('python3 --version', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return v.trim();
  } catch {
    return null;
  }
}

function checkKuzu() {
  try {
    execSync('python3 -c "import kuzu; print(kuzu.__version__)"', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function installKuzu() {
  console.log('[d2d-graphd] installing kuzu==0.11.3 via pip...');
  try {
    execSync('python3 -m pip install --quiet kuzu==0.11.3', { stdio: 'inherit' });
    console.log('[d2d-graphd] ✓ kuzu installed');
    return true;
  } catch (err) {
    console.warn('[d2d-graphd] pip install failed:', err.message.slice(0, 200));
    return false;
  }
}

(async () => {
  const py = checkPython();
  if (!py) {
    console.warn('[d2d-graphd] WARNING: python3 not found, skipping kuzu install');
    console.warn('[d2d-graphd] user must install kuzu manually: pip install kuzu==0.11.3');
  } else {
    console.log(`[d2d-graphd] found ${py}`);
    if (!checkKuzu()) {
      console.log('[d2d-graphd] kuzu not installed');
      installKuzu();
    } else {
      console.log('[d2d-graphd] ✓ kuzu already installed');
    }
  }

  // Always try to initialize host-key (idempotent)
  try {
    await ensureHostKey();
  } catch (err) {
    console.warn('[d2d-graphd] host-key init failed (non-fatal):', err.message);
  }

  console.log('[d2d-graphd] postinstall complete');
})();
