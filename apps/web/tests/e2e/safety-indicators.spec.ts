import { expect, test } from '@playwright/test';
import { attachPageErrorHandler, setupLocalStorage } from './e2e-setup';

test.describe('Safety indicators', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(setupLocalStorage);
    attachPageErrorHandler(page);
  });

  test('shows read-only banner when backend health reports readOnly', async ({ page }) => {
    await page.route('**/api/health', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          status: 'healthy',
          mode: 'mock',
          readOnly: true,
          adapters: [],
        }),
      });
    });

    const healthResponse = page.waitForResponse((res) => res.url().includes('/api/health'));
    await page.goto('./', { waitUntil: 'domcontentloaded' });
    await healthResponse;
    await expect(page.getByText(/read-only|Nur-Lese/i)).toBeVisible({ timeout: 15_000 });
  });

  test('shows simulation badge when backend reports mock mode', async ({ page }) => {
    await page.route('**/api/health', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          status: 'healthy',
          mode: 'mock',
          readOnly: false,
          adapters: [],
        }),
      });
    });

    await page.goto('./', { waitUntil: 'domcontentloaded' });
    await expect(page.getByText(/simulation|simuliert/i).first()).toBeVisible({
      timeout: 15_000,
    });
  });

  test('shows live banner when backend reports live mode', async ({ page }) => {
    await page.route('**/api/health', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          status: 'healthy',
          mode: 'live',
          readOnly: false,
          adapters: [],
        }),
      });
    });

    await page.goto('./', { waitUntil: 'domcontentloaded' });
    await expect(page.getByText(/live hardware|live-hardware|LIVE/i).first()).toBeVisible({
      timeout: 15_000,
    });
  });
});
