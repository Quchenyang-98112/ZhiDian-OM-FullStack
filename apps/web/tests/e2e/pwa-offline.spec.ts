import { expect, test } from '@playwright/test';
import { attachPageErrorHandler, setupLocalStorage } from './e2e-setup';

test.describe('PWA & Offline Behavior', () => {
  test.beforeEach(async ({ page }) => {
    attachPageErrorHandler(page);
    await page.addInitScript(setupLocalStorage);
  });

  test('should load the app and show main heading', async ({ page }) => {
    await page.goto('./');
    await expect(page.locator('#main-content h1').first()).toBeVisible({ timeout: 15_000 });
  });

  test('should have service worker API available', async ({ page }) => {
    await page.goto('./');
    await page.waitForSelector('#main-content h1', { timeout: 15_000 });

    const swAvailable = await page.evaluate(() => 'serviceWorker' in navigator);
    expect(swAvailable).toBe(true);
  });

  test('should show offline banner when network goes offline', async ({ page, context }) => {
    await page.goto('./');
    await page.waitForSelector('#main-content h1', { timeout: 15_000 });

    // Go offline
    await context.setOffline(true);
    await page.evaluate(() => window.dispatchEvent(new Event('offline')));

    // Check for the offline banner (role="alert")
    const banner = page.locator('[role="alert"]');
    await expect(banner.first()).toBeVisible({ timeout: 5_000 });

    // Go back online
    await context.setOffline(false);
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
  });

  test('should have a manifest.json link', async ({ page }) => {
    await page.goto('./');
    const manifest = page.locator('link[rel="manifest"]');
    await expect(manifest).toHaveAttribute('href', /manifest\.json/);
  });

  test('should have theme-color meta tag', async ({ page }) => {
    await page.goto('./');
    const themeColor = page.locator('meta[name="theme-color"]');
    await expect(themeColor).toHaveAttribute('content', /#[0-9a-fA-F]+/);
  });

  test('should have apple-touch-icon', async ({ page }) => {
    await page.goto('./');
    const icon = page.locator('link[rel="apple-touch-icon"]');
    await expect(icon).toHaveAttribute('href', /apple-touch-icon\.png/);
  });
});

test.describe('Error Recovery', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(setupLocalStorage);
  });

  test('should show 404 page for unknown routes', async ({ page }) => {
    await page.goto('./this-page-does-not-exist-xyz');
    await expect(page.locator('text=/404|not found|nicht gefunden/i')).toBeVisible({
      timeout: 15_000,
    });
  });

  test('should have a home link on 404 page', async ({ page }) => {
    await page.goto('./unknown-route');
    await page.waitForSelector('text=/404|not found|nicht gefunden/i', { timeout: 15_000 });
    const homeLink = page.locator('a[href="/"]').or(page.locator('a[href*="Nexus-HEMS-Dash"]'));
    await expect(homeLink.first()).toBeVisible();
  });
});

test.describe('Performance', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(setupLocalStorage);
  });

  test('should load the first contentful paint within reasonable time', async ({ page }) => {
    const start = Date.now();
    await page.goto('./');
    await page.waitForSelector('#main-content h1');
    const fcp = Date.now() - start;
    // Should render within 10 seconds (generous for CI)
    expect(fcp).toBeLessThan(10_000);
  });

  test('should lazy-load route chunks', async ({ page }) => {
    const requests: string[] = [];
    page.on('request', (req) => {
      const url = req.url();
      if (/\.(js|ts|tsx|mjs)(\?|$)/.test(url)) {
        requests.push(url);
      }
    });

    await page.goto('./');
    await page.waitForSelector('#main-content h1', { timeout: 15_000 });
    const homeRequestCount = requests.length;

    // Navigate to Settings — should trigger additional chunk loads
    await page.goto('./settings');
    await page.waitForSelector('#main-content h1', { timeout: 15_000 });

    // At least one new chunk loaded for settings
    expect(requests.length).toBeGreaterThan(homeRequestCount);
  });
});
