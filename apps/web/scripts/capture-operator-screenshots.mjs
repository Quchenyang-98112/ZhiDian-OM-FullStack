#!/usr/bin/env node
/**
 * Capture operator guide screenshots (P3-01).
 *
 * Builds are expected beforehand:
 *   VITE_E2E_TESTING=true pnpm --filter @nexus-hems/web build
 *
 * Usage:
 *   node apps/web/scripts/capture-operator-screenshots.mjs
 *
 * Output: docs/images/operators/*.png (1280×800, ocean-dark)
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(webRoot, '../..');
const outputDir = path.join(repoRoot, 'docs/images/operators');
const basePath = '/Nexus-HEMS-Dash/';
const host = '127.0.0.1';
const port = 4176;
const baseURL = `http://${host}:${port}${basePath}`;

const VIEWPORT = { width: 1280, height: 800 };

const STORE_SEED = {
  state: {
    theme: 'ocean-dark',
    themePreference: 'ocean-dark',
    themeTransitionKey: 0,
    locale: 'en',
  },
  version: 0,
};

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

async function waitForAppReady(page) {
  await page.waitForSelector('#main-content h1', { timeout: 30_000 });
  await page.waitForFunction(
    () => {
      const html = document.documentElement;
      if (!html.dataset.theme) return false;
      const styles = getComputedStyle(html);
      return (
        styles.getPropertyValue('--color-text').trim() !== '' &&
        styles.getPropertyValue('--color-background').trim() !== ''
      );
    },
    undefined,
    { timeout: 15_000 },
  );
}

async function gotoRoute(page, route) {
  const url = route.startsWith('http') ? route : `${baseURL}${route.replace(/^\.\//, '')}`;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await waitForAppReady(page);
}

async function capture(page, filename) {
  const outPath = path.join(outputDir, filename);
  await page.screenshot({ path: outPath, fullPage: false });
  console.log(`  ✓ ${filename}`);
}

async function main() {
  if (!fs.existsSync(path.join(webRoot, 'dist/index.html'))) {
    console.error('Missing dist/ — run: VITE_E2E_TESTING=true pnpm --filter @nexus-hems/web build');
    process.exit(1);
  }

  fs.mkdirSync(outputDir, { recursive: true });

  let server;
  let browser;
  let serverOutput = '';

  try {
    server = spawn(
      'pnpm',
      ['exec', 'vite', 'preview', '--host', host, '--port', String(port), '--strictPort'],
      {
        cwd: webRoot,
        stdio: 'pipe',
        env: { ...process.env, NODE_ENV: 'production' },
      },
    );
    server.stdout.on('data', (d) => {
      serverOutput += d;
    });
    server.stderr.on('data', (d) => {
      serverOutput += d;
    });

    try {
      await waitForServer(baseURL);
    } catch (err) {
      throw new Error(`${err.message}\n--- vite preview output ---\n${serverOutput.trim()}`);
    }

    browser = await chromium.launch({
      headless: true,
      args: ['--disable-dev-shm-usage', '--disable-gpu', '--no-sandbox'],
    });
    const context = await browser.newContext({ viewport: VIEWPORT });
    const page = await context.newPage();

    await page.addInitScript((seed) => {
      localStorage.setItem('nexus-hems-store', JSON.stringify(seed));
    }, STORE_SEED);

    await page.emulateMedia({ reducedMotion: 'reduce' });

    console.log('Capturing operator screenshots…');

    // EEBUS certificates tab
    await gotoRoute(page, './settings?tab=certificates');
    await capture(page, 'eebus-certificates.png');

    // EEBUS import / pairing wizard dialog
    const importBtn = page.getByRole('button', {
      name: /Import Certificate|Zertifikat importieren/i,
    });
    await importBtn.click();
    await page.waitForSelector('[role="dialog"]', { timeout: 10_000 });
    await page.waitForTimeout(300);
    await capture(page, 'eebus-pairing-wizard.png');
    await page.keyboard.press('Escape');

    // Home Assistant contrib adapters (ha-ws-api + mqtt-broker card)
    await gotoRoute(page, './settings?tab=adapters');
    const loadAllBtn = page.getByRole('button', { name: /Load All Contrib|Alle Contrib/i });
    if (await loadAllBtn.isVisible()) {
      await loadAllBtn.click();
      await page.waitForTimeout(800);
    }
    const haCard = page.getByText(/Home Assistant MQTT/i).first();
    await haCard.scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    await capture(page, 'ha-ws-api-settings.png');

    // MQTT broker context — same adapters view scrolled to contrib section
    await capture(page, 'ha-mqtt-broker.png');

    // Heat pump hardware registry (Modbus profiles)
    await gotoRoute(page, './settings/hardware');
    const categorySelect = page.locator('#hw-category');
    if (await categorySelect.isVisible()) {
      await categorySelect.selectOption('heatpump');
      await page.waitForTimeout(400);
    }
    await capture(page, 'heatpump-modbus-settings.png');

    // Wallbox / EV devices panel
    await gotoRoute(page, './devices');
    const evFilter = page.getByRole('button', { name: /EV|Wallbox|Ladestation/i }).first();
    if (await evFilter.isVisible()) {
      await evFilter.click();
      await page.waitForTimeout(400);
    }
    await capture(page, 'wallbox-evcc-link.png');

    // MPPT / PV live energy flow
    await gotoRoute(page, './energy-flow');
    await page.waitForTimeout(600);
    await capture(page, 'mppt-modbus-live.png');

    // Grafana adapter-health equivalent (in-app Monitoring)
    await gotoRoute(page, './monitoring');
    const adapterHealth = page.getByText(/Adapter Health|Adapter-Zustand/i).first();
    if (await adapterHealth.isVisible()) {
      await adapterHealth.scrollIntoViewIfNeeded();
      await page.waitForTimeout(300);
    }
    await capture(page, 'grafana-adapter-health.png');

    console.log(`\nDone — ${outputDir}`);
  } finally {
    if (browser) await browser.close();
    if (server && typeof server.kill === 'function') server.kill();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
