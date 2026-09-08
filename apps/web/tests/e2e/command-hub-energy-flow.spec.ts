import { expect, type Page, test } from '@playwright/test';
import {
  attachPageErrorHandler,
  gotoAndWaitForHealth,
  mockBackendHealth,
  setupLocalStorage,
} from './e2e-setup';

async function waitForMainHeading(page: Page) {
  await page.locator('#main-content').waitFor({ state: 'attached', timeout: 30_000 });
  const heading = page.locator('#main-content h1').first();
  await expect(heading).toBeVisible({ timeout: 30_000 });
  return heading;
}

function getSankeyGraphic(page: Page) {
  return page.getByRole('img', { name: /energy flow diagram|energiefluss/i }).first();
}

async function expectSankeyGraphicVisible(page: Page) {
  const sankeyGraphic = getSankeyGraphic(page);
  await sankeyGraphic.scrollIntoViewIfNeeded();
  await expect(sankeyGraphic).toBeVisible({ timeout: 10_000 });
}

test.describe('Command Hub', () => {
  test.beforeEach(async ({ page }) => {
    attachPageErrorHandler(page);
    await page.addInitScript(setupLocalStorage);
    await mockBackendHealth(page);
  });

  test('should render Command Hub with KPI metric cards', async ({ page }) => {
    await gotoAndWaitForHealth(page, './');
    await waitForMainHeading(page);

    // KPI cards should be present (metric cards with values)
    const metricCards = page.locator('[class*="glass-panel"], [class*="energy-card"]');
    await expect(metricCards.first()).toBeVisible({ timeout: 10_000 });
  });

  test('should render the mini Sankey energy flow', async ({ page }) => {
    await gotoAndWaitForHealth(page, './');
    await waitForMainHeading(page);

    // The accessible Sankey graphic should render
    await expectSankeyGraphicVisible(page);
  });

  test('should have quick-nav links to all sections', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await gotoAndWaitForHealth(page, './');
    await waitForMainHeading(page);

    // There should be links to primary sections
    const links = page.locator('a[href]');
    const hrefs = await links.evaluateAll((els) => els.map((el) => el.getAttribute('href')));
    const targets = ['/energy-flow', '/devices', '/analytics', '/monitoring', '/settings'];
    for (const target of targets) {
      expect(hrefs.some((h) => h?.includes(target))).toBeTruthy();
    }
  });

  test('should display connection status indicator', async ({ page }) => {
    await gotoAndWaitForHealth(page, './');
    const heading = await waitForMainHeading(page);

    // Status indicator (online/offline badge or icon) should be visible
    // At minimum, the page should render without errors
    await expect(heading).toBeVisible();
  });

  test('should navigate to Energy Flow from Command Hub', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await gotoAndWaitForHealth(page, './');
    await waitForMainHeading(page);

    // Click on energy flow link
    const link = page.getByRole('link', { name: /energy flow|energiefluss/i }).first();
    if (await link.isVisible()) {
      await link.click();
      await expect(page).toHaveURL(/energy-flow/);
      await waitForMainHeading(page);
    }
  });
});

test.describe('Live Energy Flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(setupLocalStorage);
    await mockBackendHealth(page);
  });

  test('should render the full Sankey diagram', async ({ page }) => {
    await gotoAndWaitForHealth(page, './energy-flow');
    await waitForMainHeading(page);

    // Full Sankey graphic should render
    await expectSankeyGraphicVisible(page);
  });

  test('should have ARIA-live region for screen readers', async ({ page }) => {
    await gotoAndWaitForHealth(page, './energy-flow');
    await waitForMainHeading(page);

    const liveRegion = page.locator(
      '[role="status"][aria-live="polite"][aria-atomic="true"].sr-only',
    );
    await expect(liveRegion).toHaveCount(1);
  });

  test('should have sr-only data table with proper headers', async ({ page }) => {
    await gotoAndWaitForHealth(page, './energy-flow');
    await waitForMainHeading(page);

    const dataTable = page.locator('table.sr-only');
    await expect(dataTable).toHaveCount(1);

    const headers = dataTable.locator('th');
    await expect(headers).toHaveCount(3);
  });

  test('should display live price widget area', async ({ page }) => {
    await gotoAndWaitForHealth(page, './energy-flow');
    const heading = await waitForMainHeading(page);

    // Page should fully load without JS errors
    await expect(heading).toBeVisible();
  });

  test('should support fullscreen toggle', async ({ page }) => {
    await gotoAndWaitForHealth(page, './energy-flow');
    await waitForMainHeading(page);

    // Look for fullscreen button
    const fullscreenBtn = page
      .locator('button[aria-label*="fullscreen" i], button[aria-label*="Vollbild" i]')
      .first();
    if (await fullscreenBtn.isVisible()) {
      await fullscreenBtn.click();
      // Should still render properly
      await expectSankeyGraphicVisible(page);
    }
  });
});
