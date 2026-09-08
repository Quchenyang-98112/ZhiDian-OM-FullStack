import { expect, test } from '@playwright/test';
import {
  attachPageErrorHandler,
  seedE2eAuthToken,
  seedSyncConflictState,
  setupLocalStorage,
} from './e2e-setup';

test.describe('Offline sync conflict resolution', () => {
  test.beforeEach(async ({ page }) => {
    attachPageErrorHandler(page);
    await page.addInitScript(setupLocalStorage);
    await page.addInitScript(seedE2eAuthToken);
  });

  test('shows conflict banner and resolves with server version', async ({ page }) => {
    await page.route('**/api/sync/version', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ version: 200 }),
      });
    });

    await page.route('**/api/sync/diff?since=10', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          version: 200,
          changes: [
            {
              key: 'compactMode',
              value: true,
              updatedAt: Date.now(),
              category: 'userPreferences',
              version: 200,
            },
          ],
        }),
      });
    });

    await page.goto('./');
    await expect(page.locator('#main-content h1').first()).toBeVisible({ timeout: 15_000 });

    await page.evaluate(seedSyncConflictState);

    const conflictBanner = page
      .getByRole('alert')
      .filter({ hasText: /sync conflict|sync-konflikt/i });
    await expect(conflictBanner).toBeVisible({ timeout: 5_000 });

    await page.getByRole('button', { name: /view details|details anzeigen/i }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(
      page.getByText(/settings sync conflict|einstellungs-sync-konflikt/i),
    ).toBeVisible();

    await page
      .getByRole('button', { name: /accept server version|server-version übernehmen/i })
      .click();

    await expect(conflictBanner).toBeHidden({ timeout: 5_000 });
    await expect(page.getByRole('dialog')).toBeHidden();
  });

  test('keeps local version and dismisses conflict after forced replay', async ({ page }) => {
    await page.route('**/api/sync/version', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ version: 200 }),
      });
    });

    await page.route('**/api/settings', async (route) => {
      if (route.request().method() !== 'PUT') {
        await route.continue();
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, version: 201, applied: ['compactMode'] }),
      });
    });

    await page.goto('./');
    await expect(page.locator('#main-content h1').first()).toBeVisible({ timeout: 15_000 });

    await page.evaluate(async () => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open('nexus-hems-dash');
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error ?? new Error('indexedDB open failed'));
      });

      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(['syncState', 'offlineActions'], 'readwrite');
        tx.objectStore('syncState').put({
          key: 'settings',
          lastSyncedAt: Date.now() - 60_000,
          serverVersion: '10',
          localRevision: 0,
          hasConflict: true,
          updatedAt: Date.now(),
        });
        tx.objectStore('offlineActions').add({
          type: 'settings',
          payload: { compactMode: true },
          timestamp: Date.now(),
          retries: 0,
          status: 'pending',
          idempotencyKey: 'settings-e2e-local-wins',
        });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error ?? new Error('seed failed'));
      });

      db.close();
      window.dispatchEvent(
        new CustomEvent('nexus-hems-sync-conflict', { detail: { domain: 'settings' } }),
      );
    });

    const conflictBanner = page
      .getByRole('alert')
      .filter({ hasText: /sync conflict|sync-konflikt/i });
    await expect(conflictBanner).toBeVisible({ timeout: 5_000 });

    await page.getByRole('button', { name: /view details|details anzeigen/i }).click();

    const settingsPut = page.waitForResponse(
      (res) => res.url().includes('/api/settings') && res.request().method() === 'PUT',
    );
    await page.getByRole('button', { name: /keep my version|meine version behalten/i }).click();
    await settingsPut;

    await expect(conflictBanner).toBeHidden({ timeout: 10_000 });
  });
});
