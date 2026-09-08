import { expect, test } from '@playwright/test';
import { attachPageErrorHandler, setupLocalStorage } from './e2e-setup';

test.describe('JWT auth settings', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(setupLocalStorage);
    attachPageErrorHandler(page);
  });

  test('exchanges API key for JWT and shows active token status', async ({ page }) => {
    await page.route('**/api/auth/token', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ token: 'e2e-test-jwt', expiresIn: '24h', scope: 'readwrite' }),
      });
    });

    await page.goto('./settings?tab=security', { waitUntil: 'domcontentloaded' });

    await page.locator('#api-auth-client-id').fill('hems-dashboard');
    await page.locator('#api-auth-api-key').fill('test-api-key');
    await page.getByRole('button', { name: /exchange for jwt|gegen jwt tauschen/i }).click();

    await expect(page.getByText(/jwt active|jwt im browser/i)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/readwrite/i)).toBeVisible();
  });

  test('surfaces invalid credentials error from token endpoint', async ({ page }) => {
    await page.route('**/api/auth/token', async (route) => {
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Invalid or missing API key' }),
      });
    });

    await page.goto('./settings?tab=security', { waitUntil: 'domcontentloaded' });

    await page.locator('#api-auth-client-id').fill('hems-dashboard');
    await page.locator('#api-auth-api-key').fill('bad-key');
    await page.getByRole('button', { name: /exchange for jwt|gegen jwt tauschen/i }).click();

    await expect(page.getByRole('alert')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/invalid api key|ungültig/i)).toBeVisible();
  });

  test('clears stored JWT from browser storage', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem(
        'nexus-hems-auth-token',
        JSON.stringify({ token: 'stored-jwt', scope: 'read', expiresAt: Date.now() + 60_000 }),
      );
    });

    await page.goto('./settings?tab=security', { waitUntil: 'domcontentloaded' });
    await expect(page.getByText(/jwt active|jwt im browser/i)).toBeVisible();

    await page.getByRole('button', { name: /clear token|token löschen/i }).click();
    await expect(page.getByText(/no jwt|kein jwt/i)).toBeVisible();
  });
});
