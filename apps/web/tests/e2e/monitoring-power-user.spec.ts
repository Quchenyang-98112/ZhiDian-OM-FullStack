import { expect, test } from '@playwright/test';
import {
  attachReactErrorWatcher,
  gotoAndWaitForHealth,
  mockBackendHealth,
  setupLocalStorage,
} from './e2e-setup';

/**
 * Regression for the reported "Power User Mode" crash on /monitoring: enabling
 * it lazy-mounts the detail panel, whose useMonitoringData selector returned a
 * fresh nested object every call, defeating useShallow → useSyncExternalStore
 * looped to React #185 ("Maximum update depth exceeded"), tearing down the route.
 *
 * This asserts the panel actually RENDERS (not just that it didn't hard-crash),
 * and — because React error boundaries swallow the error with no pageerror — it
 * also watches console.error for the #185 / boundary signature. It only has
 * teeth with animations enabled (VITE_E2E_ANIMATIONS=true); see main.tsx.
 */
test.describe('Monitoring — Power User Mode', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(setupLocalStorage);
    await mockBackendHealth(page);
  });

  test('enabling power user mode renders the detail panel without crashing', async ({ page }) => {
    const { pageErrors, reactErrors } = attachReactErrorWatcher(page);

    await gotoAndWaitForHealth(page, './monitoring');
    await expect(page.locator('#main-content')).toBeVisible();

    // Flip the power-user toggle (sr-only checkbox inside a label).
    await page.locator('#power-user-toggle').check({ force: true });

    // Success = the real panel content mounts. If it instead crashed, either an
    // error-boundary fallback shows (router-level "went wrong" or our panel
    // fallback) or the panel headings never appear — all caught below.
    const panelHeading = page.locator('#adapters-title, #load-chart-title');
    const panelFallback = page.getByRole('heading', { name: /panel unavailable/i });
    const routeFallback = page.getByRole('heading', { name: /went wrong/i });

    await expect(panelHeading.or(panelFallback).or(routeFallback).first()).toBeVisible({
      timeout: 20_000,
    });

    // The panel must have rendered — no boundary fallback, no React #185.
    await expect(panelFallback, 'panel-level error boundary fallback was shown').toBeHidden();
    await expect(routeFallback, 'route-level error boundary fallback was shown').toBeHidden();
    await expect(panelHeading.first(), 'detail panel did not render').toBeVisible();
    expect(
      reactErrors,
      `React render errors after enabling power user mode:\n${reactErrors.join('\n---\n')}`,
    ).toEqual([]);
    expect(pageErrors, `uncaught page errors:\n${pageErrors.join('\n---\n')}`).toEqual([]);
  });
});
