import { expect, test } from '@playwright/test';
import {
  attachPageErrorHandler,
  gotoAndWaitForHealth,
  mockBackendHealth,
  setupLocalStorage,
} from './e2e-setup';

test.describe('Adapter mode indicators', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(setupLocalStorage);
    attachPageErrorHandler(page);
  });

  test('shows simulation badge in header for mock mode', async ({ page }) => {
    await mockBackendHealth(page, { mode: 'mock', readOnly: false });
    await gotoAndWaitForHealth(page, './');

    await expect(page.getByText(/simulation|simuliert/i).first()).toBeVisible({
      timeout: 15_000,
    });
  });

  test('shows live hardware banner when backend reports live mode', async ({ page }) => {
    await mockBackendHealth(page, { mode: 'live', readOnly: false });
    await gotoAndWaitForHealth(page, './');

    await expect(page.getByRole('alert').getByText(/live hardware|live-hardware/i)).toBeVisible({
      timeout: 15_000,
    });
  });

  test('advanced settings card reflects mock vs live mode', async ({ page }) => {
    await mockBackendHealth(page, { mode: 'live', readOnly: false });
    await gotoAndWaitForHealth(page, './settings?tab=advanced');

    await expect(page.getByText(/adapter mode|adapter-modus/i)).toBeVisible();
    await expect(page.getByText(/live hardware|live-hardware/i).first()).toBeVisible();
    await expect(
      page.getByText(/controlling real equipment|echte geräte werden gesteuert/i),
    ).toBeVisible();
  });

  test('advanced settings card shows simulation mode for mock backend', async ({ page }) => {
    await mockBackendHealth(page, { mode: 'mock', readOnly: false });
    await gotoAndWaitForHealth(page, './settings?tab=advanced');

    await expect(page.getByText(/adapter mode|adapter-modus/i)).toBeVisible();
    await expect(page.getByText(/simulation|simuliert/i).first()).toBeVisible();
    await expect(
      page.getByText(
        /no real hardware|no hardware is controlled|keine echte hardware|keine hardware-steuerung/i,
      ),
    ).toBeVisible();
  });
});
