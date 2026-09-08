#!/usr/bin/env tsx
/**
 * AUD-02 phase 2: inject Vite build nonce into tauri.conf.json before `tauri build`.
 *
 * Run from apps/web after `vite build --base /` (via tauri beforeBuildCommand).
 * Restores dev CSP is not automatic — run `git checkout src-tauri/tauri.conf.json` locally
 * if you need the dev baseline after a desktop production build.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildTauriProductionCsp,
  extractCspNonceFromIndexHtml,
  isTauriProductionCsp,
} from '../tauri-csp.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(__dirname, '..');
const indexPath = path.join(webRoot, 'dist', 'index.html');
const tauriConfPath = path.join(webRoot, 'src-tauri', 'tauri.conf.json');

function main(): void {
  const indexHtml = readFileSync(indexPath, 'utf8');
  const nonce = extractCspNonceFromIndexHtml(indexHtml);
  if (!nonce) {
    console.error(`[sync-tauri-csp] ERROR: no CSP nonce in ${indexPath}`);
    process.exit(1);
  }

  const productionCsp = buildTauriProductionCsp(nonce);
  if (!isTauriProductionCsp(productionCsp)) {
    console.error('[sync-tauri-csp] ERROR: generated CSP failed validation');
    process.exit(1);
  }

  const conf = JSON.parse(readFileSync(tauriConfPath, 'utf8')) as {
    app: { security: { csp: string } };
  };
  conf.app.security.csp = productionCsp;
  writeFileSync(tauriConfPath, `${JSON.stringify(conf, null, 2)}\n`, 'utf8');
  console.log(`[sync-tauri-csp] Patched tauri.conf.json CSP (nonce ${nonce.slice(0, 8)}…)`);
}

main();
