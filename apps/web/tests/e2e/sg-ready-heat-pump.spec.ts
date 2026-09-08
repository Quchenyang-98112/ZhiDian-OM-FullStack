import { expect, test } from '@playwright/test';
import {
  attachPageErrorHandler,
  gotoAndWaitForHealth,
  mockBackendHealth,
  setupLocalStorage,
} from './e2e-setup';

test.describe('SG Ready heat pump UI', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(setupLocalStorage);
    attachPageErrorHandler(page);
    await mockBackendHealth(page);
  });

  test('devices page shows SG Ready mode selector on heat pump detail', async ({ page }) => {
    await gotoAndWaitForHealth(page, './devices');

    const heatPumpHeader = page.getByRole('button', { name: /heat pump|wärmepumpe/i }).first();
    await expect(heatPumpHeader).toBeVisible({ timeout: 15_000 });
    await heatPumpHeader.click();

    const openDetails = page.getByRole('button', {
      name: /open full details|vollständige details/i,
    });
    await expect(openDetails).toBeVisible({ timeout: 10_000 });
    await openDetails.click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 10_000 });
    await expect(
      dialog.getByRole('heading', { name: /heat pump sg ready|wärmepumpe sg ready/i }),
    ).toBeVisible({ timeout: 10_000 });
    await expect(dialog.getByRole('radiogroup')).toBeVisible();
  });
});
