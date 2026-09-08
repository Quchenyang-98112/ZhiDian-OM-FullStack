import { expect, test } from '@playwright/test';
import {
  attachPageErrorHandler,
  gotoAndWaitForHealth,
  mockBackendHealth,
  setupLocalStorage,
} from './e2e-setup';

test.describe('Read-only command rejection', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(setupLocalStorage);
    attachPageErrorHandler(page);
    await mockBackendHealth(page, { readOnly: true });
  });

  test('rejects device quick action with toast when backend is read-only', async ({ page }) => {
    await gotoAndWaitForHealth(page, './devices');

    await page
      .getByRole('button', { name: /all lights off|alle lichter aus/i })
      .first()
      .click();

    const rejectionToast = page.getByText(/command rejected|befehl abgelehnt/i);
    await expect(rejectionToast).toBeVisible({ timeout: 10_000 });
    await expect(rejectionToast).toContainText(/read-only|nur-lese/i);
  });

  test('shows read-only banner on settings adapters tab', async ({ page }) => {
    await gotoAndWaitForHealth(page, './settings?tab=adapters');

    await expect(page.getByText(/read-only|nur-lese/i).first()).toBeVisible({
      timeout: 15_000,
    });
  });
});
