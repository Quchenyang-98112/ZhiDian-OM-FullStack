import { expect, test } from '@playwright/test';
import {
  attachPageErrorHandler,
  gotoAndWaitForHealth,
  mockBackendHealth,
  setupLocalStorage,
  setupMockBackendWebSocket,
} from './e2e-setup';

test.describe('Backend WebSocket live integration', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(setupLocalStorage);
    await page.addInitScript(setupMockBackendWebSocket);
    attachPageErrorHandler(page);
    await mockBackendHealth(page, { mode: 'live', readOnly: false });
  });

  test('shows connected Backend WS pill on monitoring page', async ({ page }) => {
    await gotoAndWaitForHealth(page, './monitoring');

    const backendWsPill = page.getByText(/backend ws|backend-ws/i);
    await expect(backendWsPill).toBeVisible({ timeout: 15_000 });
  });

  test('merges ENERGY_UPDATE frames into live KPIs on command hub', async ({ page }) => {
    await gotoAndWaitForHealth(page, './');

    await page.waitForFunction(() => {
      const mock = (
        window as { __mockBackendWs?: { onmessage: ((e: { data: string }) => void) | null } }
      ).__mockBackendWs;
      return mock?.onmessage != null;
    });

    await page.evaluate(() => {
      const mock = (
        window as { __mockBackendWs?: { onmessage: ((e: { data: string }) => void) | null } }
      ).__mockBackendWs;
      mock?.onmessage?.({
        data: JSON.stringify({
          type: 'ENERGY_UPDATE',
          data: {
            gridPower: 1200,
            pvPower: 3400,
            batteryPower: -800,
            houseLoad: 2600,
            batterySoC: 72,
            heatPumpPower: 900,
            evPower: 1100,
            gridVoltage: 230,
            batteryVoltage: 51.2,
            pvYieldToday: 18.5,
            priceCurrent: 0.284,
          },
        }),
      });
    });

    // mergeData is throttled to 250 ms before bridging to the app store
    await page.waitForTimeout(400);

    const pvMetric = page
      .locator('#main-content')
      .getByRole('link', { name: /pv generation|pv-erzeugung/i });
    await expect(pvMetric).toContainText(/3\.4\d*\s*kW/i, { timeout: 15_000 });
  });
});
