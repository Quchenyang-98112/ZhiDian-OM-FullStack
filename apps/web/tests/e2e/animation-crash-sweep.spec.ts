import { expect, test } from '@playwright/test';
import {
  attachReactErrorWatcher,
  gotoAndWaitForHealth,
  mockBackendHealth,
  setupLocalStorage,
} from './e2e-setup';

/**
 * Animation crash sweep — exposes latent animation-gated render loops (e.g. a
 * recharts <ResponsiveContainer> looping to React #185 "Maximum update depth"
 * when mounted inside a height:0 → auto reveal).
 *
 * This spec only has teeth when the build runs WITH animations, i.e. built with
 * `VITE_E2E_ANIMATIONS=true` (see main.tsx) or without VITE_E2E_TESTING at all.
 * Under the default animation-skipping E2E build it still passes, but cannot
 * catch this bug class — that gap is exactly what masked the monitoring crash.
 *
 * For each route it: loads the page, expands every disclosure and flips every
 * checkbox (the reveal vectors that mount heavy/chart subtrees into animating
 * containers), and asserts the app-level ErrorBoundary fallback never appears
 * and no uncaught page error fired.
 */
const ROUTES = [
  './',
  './energy-flow',
  './devices',
  './optimization-ai',
  './tariffs',
  './analytics',
  './monitoring',
  './settings',
];

test.describe('Animation crash sweep', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(setupLocalStorage);
    await mockBackendHealth(page);
  });

  for (const route of ROUTES) {
    test(`${route} loads and reveals panels without crashing`, async ({ page }) => {
      // Watches uncaught page errors AND React render errors — the latter are
      // swallowed by error boundaries (no pageerror), so a contained #185 loop
      // caught by a section boundary is only visible via console.error.
      const { pageErrors, reactErrors } = attachReactErrorWatcher(page);

      const wentWrong = page.getByRole('heading', { name: /went wrong/i });

      await gotoAndWaitForHealth(page, route);
      await expect(page.locator('#main-content')).toBeVisible();
      await expect(wentWrong, `error boundary on load of ${route}`).toBeHidden();

      // Progressively expand disclosures. Each click flips aria-expanded to
      // "true", so it drops out of the set — always click the first remaining
      // collapsed one, capped to avoid runaway loops.
      for (let i = 0; i < 30; i++) {
        const next = page.locator('button[aria-expanded="false"]').first();
        if (!(await next.isVisible().catch(() => false))) break;
        await next.click().catch(() => {});
        await page.waitForTimeout(150);
        if (await wentWrong.isVisible().catch(() => false)) break;
      }

      // Flip visible unchecked toggles (e.g. Monitoring power-user mode) that
      // reveal lazily-mounted, animated panels. Always check the FIRST remaining
      // unchecked box: checking one removes it from the `:not(:checked)` set, so
      // an index-based walk would skip the shrinking set. Capped for safety.
      for (let i = 0; i < 30; i++) {
        const nextCheckbox = page.locator('input[type="checkbox"]:not(:checked)').first();
        if (!(await nextCheckbox.isVisible().catch(() => false))) break;
        await nextCheckbox.check({ force: true }).catch(() => {});
        await page.waitForTimeout(200);
        if (await wentWrong.isVisible().catch(() => false)) break;
      }

      await expect(wentWrong, `error boundary after revealing panels on ${route}`).toBeHidden();
      expect(
        pageErrors,
        `uncaught page errors on ${route}:\n${pageErrors.join('\n---\n')}`,
      ).toEqual([]);
      expect(
        reactErrors,
        `React render errors (e.g. #185) on ${route}:\n${reactErrors.join('\n---\n')}`,
      ).toEqual([]);
    });
  }
});
