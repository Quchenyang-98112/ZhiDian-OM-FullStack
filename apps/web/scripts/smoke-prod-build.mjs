#!/usr/bin/env node
/**
 * Smoke-test the production build by loading it in a headless browser.
 *
 * This script is intentionally lightweight: it starts `vite preview` against the
 * already-built `dist/` folder, navigates to the app with Playwright, and fails
 * if React does not mount or if an uncaught runtime error occurs.
 *
 * Environment:
 *   - VITE_E2E_TESTING=true is recommended so the build matches CI conditions.
 *   - CI=true enables headless-shell Chromium selection.
 *
 * `vite preview` is the only server strategy: it respects the production base
 * path from vite.config.ts and is always available via the workspace devDeps, so
 * there is no hand-rolled static file server (which would be a path-traversal
 * sink for no benefit).
 */

import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(__dirname, '..');
const basePath = '/Nexus-HEMS-Dash/';
const host = '127.0.0.1';
const port = 4174;
const url = `http://${host}:${port}${basePath}`;

/**
 * Wait until the preview server responds with 200.
 */
async function waitForServer(target, timeoutMs = 60_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(target);
      if (res.status === 200) return;
    } catch {
      // not ready yet
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Preview server did not become ready within ${timeoutMs}ms`);
}

async function main() {
  let server;
  let browser;

  // Buffer the preview server's own output so a startup failure is diagnosable
  // (it is otherwise swallowed by the pipe).
  let serverOutput = '';

  try {
    // P2 / ADR-024: the production HTML shell must not ship dev-only localhost
    // WebSocket origins in its CSP connect-src (they are inert but unnecessary
    // attack surface for the hosted bundle). Fail fast before the browser run.
    const indexHtml = await readFile(path.join(webRoot, 'dist', 'index.html'), 'utf8');
    const connectSrc = indexHtml.match(/connect-src[^;]*/)?.[0] ?? '';
    if (/localhost|127\.0\.0\.1/.test(connectSrc)) {
      throw new Error(
        `Production index.html CSP connect-src contains localhost origins:\n${connectSrc}`,
      );
    }

    const styleSrc = indexHtml.match(/style-src[^;]*/)?.[0] ?? '';
    if (/unsafe-inline/.test(styleSrc)) {
      throw new Error(
        `Production index.html CSP style-src must not contain unsafe-inline (AUD-02):\n${styleSrc}`,
      );
    }
    if (!/'nonce-/.test(styleSrc)) {
      throw new Error(
        `Production index.html CSP style-src must include a build nonce (AUD-02):\n${styleSrc}`,
      );
    }

    // AUD-02 phase 2: Tauri desktop CSP must be nonce-aligned after sync-tauri-csp.
    const { buildTauriProductionCsp, extractCspNonceFromIndexHtml, isTauriProductionCsp } =
      await import('../tauri-csp.ts');
    const nonce = extractCspNonceFromIndexHtml(indexHtml);
    if (!nonce) {
      throw new Error('Production index.html missing CSP nonce for Tauri CSP sync (AUD-02)');
    }
    const tauriCsp = buildTauriProductionCsp(nonce);
    if (!isTauriProductionCsp(tauriCsp)) {
      throw new Error(`Tauri production CSP validation failed (AUD-02):\n${tauriCsp}`);
    }

    // vite preview respects the production base path baked into the build.
    // Bind explicitly to the IPv4 host we poll — vite's default `localhost`
    // can resolve to ::1 on CI runners, which an IPv4 fetch never reaches.
    server = spawn(
      'pnpm',
      ['exec', 'vite', 'preview', '--host', host, '--port', String(port), '--strictPort'],
      {
        cwd: webRoot,
        stdio: 'pipe',
        env: { ...process.env, NODE_ENV: 'production' },
      },
    );
    server.on('error', (err) => {
      throw new Error(`Failed to start preview server: ${err.message}`);
    });
    server.stdout.on('data', (d) => {
      serverOutput += d;
      if (process.env.SMOKE_DEBUG) process.stdout.write(d);
    });
    server.stderr.on('data', (d) => {
      serverOutput += d;
      if (process.env.SMOKE_DEBUG) process.stderr.write(d);
    });

    try {
      await waitForServer(url);
    } catch (err) {
      throw new Error(`${err.message}\n--- vite preview output ---\n${serverOutput.trim()}`);
    }

    // Only uncaught exceptions are fatal — they mean the production bundle
    // genuinely threw. console.error is collected for visibility but NOT failed
    // on: this smoke test serves static dist/ with no backend and a strict CSP
    // meta tag, so a backendless app legitimately logs CSP notices and failed
    // resource/API loads (502/404) that say nothing about whether the build is
    // broken. The mount assertion below is the real "did the app come up" gate.
    const fatalErrors = [];
    const consoleErrors = [];
    browser = await chromium.launch({
      headless: true,
      args: ['--disable-dev-shm-usage', '--disable-gpu', '--no-sandbox'],
    });
    const page = await browser.newPage();
    page.on('pageerror', (err) => fatalErrors.push(`pageerror: ${err.message}`));
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await page.goto(url, { waitUntil: 'networkidle', timeout: 30_000 });

    // Wait for React to mount. The root div should contain more than just the
    // raw HTML fallback (i.e., actual rendered application markup).
    const rootHasContent = await page.evaluate(() => {
      const root = document.getElementById('root');
      return root ? root.children.length > 0 : false;
    });
    if (!rootHasContent) {
      throw new Error('React did not mount: #root is empty after networkidle');
    }

    if (fatalErrors.length > 0) {
      throw new Error(`Uncaught runtime errors detected:\n${fatalErrors.join('\n')}`);
    }

    if (consoleErrors.length > 0) {
      console.log(
        `ℹ️  ${consoleErrors.length} non-fatal console error(s) (expected without a backend / under strict CSP):`,
      );
      for (const e of consoleErrors) console.log(`   - ${e}`);
    }

    console.log('✅ Production build smoke test passed');
  } finally {
    if (browser) await browser.close();
    if (server && typeof server.kill === 'function') {
      server.kill();
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
