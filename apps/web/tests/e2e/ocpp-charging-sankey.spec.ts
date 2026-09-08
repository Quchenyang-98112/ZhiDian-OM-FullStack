/**
 * E2E: Simulates an OCPP Charging Session and verifies the Sankey
 * energy-flow diagram updates in real time.
 *
 * Uses the dev-mode window.__NEXUS_STORE__ handle (Zustand) to inject
 * energy data as if an OCPP adapter pushed TransactionEvent updates.
 *
 * Flow:
 *   1. Navigate to /energy-flow → demo data shows EV inflow = 3700 W
 *   2. Inject "charging started" (11 kW) → total EV inflow = 11000 W
 *   3. Inject "charging update" (22 kW) → total EV inflow = 22000 W
 *   4. Inject "charging ended" (0 W) → EV inflow rows disappear
 */

import { expect, test } from '@playwright/test';
import {
  attachPageErrorHandler,
  gotoAndWaitForHealth,
  mockBackendHealth,
  setupLocalStorage,
} from './e2e-setup';

type DevStoreHandle = {
  getState(): {
    setConnected(connected: boolean): void;
    setEnergyData(data: Record<string, number>): void;
  };
};

/** Helper: call setEnergyData + setConnected on the Zustand store */
async function setStoreEnergy(
  page: import('@playwright/test').Page,
  data: Record<string, number>,
  connected = true,
) {
  await page.evaluate(
    ({ d, c }) => {
      const store = (window as Window & { __NEXUS_STORE__?: DevStoreHandle }).__NEXUS_STORE__;
      if (!store) throw new Error('__NEXUS_STORE__ not exposed – is DEV mode active?');
      store.getState().setConnected(c);
      store.getState().setEnergyData(d);
    },
    { d: data, c: connected },
  );
}

async function expectEvInflowPower(page: import('@playwright/test').Page, expectedWatts: number) {
  await expect
    .poll(async () => {
      const rows = page.locator('table.sr-only tr[data-sankey-target="ev"]');
      const count = await rows.count();
      if (expectedWatts === 0) return count;

      let total = 0;
      for (let i = 0; i < count; i++) {
        const text = await rows.nth(i).locator('td').nth(2).textContent();
        total += Number.parseInt(text?.trim() ?? '0', 10);
      }
      return total;
    })
    .toBe(expectedWatts);
}

test.describe('OCPP Charging Session → Sankey Update', () => {
  test.beforeEach(async ({ page }) => {
    attachPageErrorHandler(page);
    await page.addInitScript(setupLocalStorage);
    await mockBackendHealth(page);
  });

  test('Sankey updates on EV charging start / update / stop', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await gotoAndWaitForHealth(page, './energy-flow');
    await page.waitForSelector('svg[role="img"]', { timeout: 15_000 });

    const sankeyTable = page.locator('table.sr-only');
    await expect(sankeyTable).toBeAttached({ timeout: 10_000 });

    // ── 1. Demo data — EV inflow = 3700 W ─────────────────────────
    await expectEvInflowPower(page, 3700);

    // ── 2. OCPP TransactionEvent Started — 11 kW ────────────────────
    await setStoreEnergy(page, {
      pvPower: 5000,
      gridPower: 9180,
      batteryPower: 0,
      houseLoad: 3180,
      batterySoC: 72,
      heatPumpPower: 0,
      evPower: 11000,
      gridVoltage: 230,
      batteryVoltage: 51.2,
      pvYieldToday: 15.3,
      priceCurrent: 0.28,
    });
    await expectEvInflowPower(page, 11000);

    // ── 3. OCPP MeterValues Update — 22 kW ────────────────────────
    await setStoreEnergy(page, { evPower: 22000, gridPower: 20180 });
    await expectEvInflowPower(page, 22000);

    // ── 4. OCPP TransactionEvent Ended — EV = 0 W ─────────────────
    await setStoreEnergy(page, { evPower: 0, gridPower: 180 });
    await expectEvInflowPower(page, 0);
  });
});
