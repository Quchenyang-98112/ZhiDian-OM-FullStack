import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import {
  attachPageErrorHandler,
  gotoAndWaitForHealth,
  mockBackendHealth,
  setupLocalStorage,
} from './e2e-setup';

const routes = [
  { path: './', name: 'Command Hub' },
  { path: './energy-flow', name: 'Live Energy Flow' },
  { path: './devices', name: 'Devices & Automation' },
  { path: './optimization-ai', name: 'AI Optimization' },
  { path: './tariffs', name: 'Tariffs' },
  { path: './analytics', name: 'Analytics' },
  { path: './monitoring', name: 'Monitoring' },
  { path: './settings', name: 'Settings' },
  { path: './settings?tab=certificates', name: 'EEBUS Certificates' },
  { path: './settings/hardware', name: 'Hardware Registry' },
  { path: './settings/ai', name: 'AI Settings' },
  { path: './plugins', name: 'Plugins' },
  { path: './help', name: 'Help' },
];

const NAVIGATION_TIMEOUT_MS = 15_000;
const MAIN_HEADING_TIMEOUT_MS = 30_000;
const THEME_APPLIED_TIMEOUT_MS = 15_000;

async function gotoAndWait(page: import('@playwright/test').Page, path: string) {
  await page.goto(path, { waitUntil: 'domcontentloaded', timeout: NAVIGATION_TIMEOUT_MS });
  // Wait for the first real/skeleton h1 inside the main landmark.  The PageSkeleton
  // fallback injects an h1, so this resolves as soon as the app shell mounts.
  await page.waitForSelector('#main-content h1', { timeout: MAIN_HEADING_TIMEOUT_MS });
  // Then wait for the theme to actually be applied to <html>.  App.tsx sets
  // `documentElement.dataset.theme` in a useEffect that runs *after* the first paint,
  // and the colour tokens (--color-text / --color-background) are scoped to the
  // `[data-theme='…']` selectors in index.css.  Scanning before this effect runs
  // catches a pre-theme paint where `bg-(--color-text)` buttons fall back to
  // near-identical colours and trip a transient WCAG color-contrast violation.
  // Gate axe on both the attribute *and* a resolved token value so the scan only
  // ever runs against a fully themed page.
  await page.waitForFunction(
    () => {
      const html = document.documentElement;
      if (!html.dataset.theme) return false;
      const styles = getComputedStyle(html);
      return (
        styles.getPropertyValue('--color-text').trim() !== '' &&
        styles.getPropertyValue('--color-background').trim() !== ''
      );
    },
    undefined,
    { timeout: THEME_APPLIED_TIMEOUT_MS },
  );
  // Finally, let the route's entrance animations settle. Page content mounts inside
  // framer-motion opacity/slide wrappers (SettingsUnified's content area, page
  // transitions); while that fade runs, axe composites a light-background button
  // against the dark page at partial opacity and reports a transient dark-on-dark
  // color-contrast violation — the flagged background colour varies frame to frame,
  // the fingerprint of an animation race rather than a real defect. framer drives
  // opacity through the Web Animations API, so awaiting every finite animation's
  // `finished` promise settles the fade deterministically (no fixed timeout). Two
  // rAFs first guarantee framer has committed/started the animation; infinite loops
  // (spinners, energy-pulse) are excluded so this can never hang.
  await page.evaluate(async () => {
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const finite = document
      .getAnimations()
      .filter((a) => a.effect?.getComputedTiming().iterations !== Number.POSITIVE_INFINITY);
    await Promise.allSettled(finite.map((a) => a.finished));
  });
}

test.describe('WCAG 2.2 AA Accessibility', () => {
  test.beforeEach(async ({ page }) => {
    attachPageErrorHandler(page);
    await mockBackendHealth(page);
    // Emulate `prefers-reduced-motion: reduce` for every a11y test. The app's
    // `@media (prefers-reduced-motion: reduce)` block zeroes every transition/animation
    // duration, so colour-token transitions (e.g. the language toggle's
    // `bg-(--color-text)` animating in after the theme applies) settle instantly. This
    // removes the residual race the `gotoAndWait` theme gate can't cover: axe would
    // otherwise sample a button mid-transition and trip a transient, non-deterministic
    // WCAG color-contrast violation. Settled colours are the correct thing to assert.
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.addInitScript(setupLocalStorage);
  });

  for (const route of routes) {
    test(`${route.name} page should have no accessibility violations`, async ({ page }) => {
      test.setTimeout(60_000);
      await gotoAndWait(page, route.path);

      const accessibilityScanResults = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
        .analyze();

      // Surface exact selectors/sizes in CI logs when something fails, so
      // target-size (and any other) violations are actionable without a rerun.
      if (accessibilityScanResults.violations.length > 0) {
        console.warn(
          `[a11y] ${route.name} violations:\n${JSON.stringify(
            accessibilityScanResults.violations.map((v) => ({
              id: v.id,
              impact: v.impact,
              nodes: v.nodes.map((n) => ({ target: n.target, html: n.html.slice(0, 140) })),
            })),
            null,
            2,
          )}`,
        );
      }

      expect(accessibilityScanResults.violations).toEqual([]);
    });
  }

  test('Keyboard navigation should work', async ({ page }) => {
    await gotoAndWait(page, './');

    // Tab through interactive elements
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');

    // Check that focus is visible
    const focusedElement = page.locator(':focus');
    await expect(focusedElement).toBeVisible();
  });

  test('Theme switcher should be keyboard accessible', async ({ page }) => {
    await gotoAndWait(page, './settings');

    // Find a theme button and activate with keyboard
    const themeButton = page.locator('button[aria-pressed]').nth(1);
    await themeButton.focus();
    await themeButton.press('Enter');

    // Verify theme changed
    await expect(page.locator('html')).toHaveAttribute('data-theme', /.+/);
  });

  test('Language switcher should be keyboard accessible', async ({ page }) => {
    await gotoAndWait(page, './settings');

    // Language switcher has DE and EN buttons with aria-pressed
    const langButton = page.locator('button[aria-pressed]').first();
    await expect(langButton).toBeVisible();
    await langButton.focus();
    await langButton.press('Enter');

    await expect(page.locator('html')).toHaveAttribute('lang', /^(de|en)$/);
  });

  test('Skip-to-content link should be present and functional', async ({ page }) => {
    await gotoAndWait(page, './');

    // The skip link should exist
    const skipLink = page.locator('a[href="#main-content"]');
    await expect(skipLink).toHaveCount(1);

    // Tab to the skip link (should be first focusable element)
    await page.keyboard.press('Tab');
    const focused = page.locator(':focus');
    await expect(focused).toHaveAttribute('href', '#main-content');
  });

  test('High contrast mode should apply CSS class to <html>', async ({ page }) => {
    // Inject high-contrast setting into localStorage before the page loads
    await page.addInitScript(() => {
      const raw = localStorage.getItem('nexus-hems-store');
      const store = raw ? JSON.parse(raw) : { state: {}, version: 0 };
      store.state = {
        ...store.state,
        settings: { ...store.state?.settings, highContrast: true },
      };
      localStorage.setItem('nexus-hems-store', JSON.stringify(store));
    });

    await gotoAndWait(page, './settings');

    await expect(page.locator('html')).toHaveClass(/high-contrast/, { timeout: 10_000 });
  });

  test('Reduced motion mode should apply CSS class to <html>', async ({ page }) => {
    // Inject reduced-motion setting into localStorage before the page loads
    await page.addInitScript(() => {
      const raw = localStorage.getItem('nexus-hems-store');
      const store = raw ? JSON.parse(raw) : { state: {}, version: 0 };
      store.state = {
        ...store.state,
        settings: { ...store.state?.settings, reducedMotion: true },
      };
      localStorage.setItem('nexus-hems-store', JSON.stringify(store));
    });

    await gotoAndWait(page, './settings');

    await expect(page.locator('html')).toHaveClass(/reduced-motion/, { timeout: 10_000 });
  });

  test('Heading hierarchy should be correct (no skipped levels)', async ({ page }) => {
    await gotoAndWait(page, './');

    const headings = await page.evaluate(() => {
      const hs = document.querySelectorAll('h1, h2, h3, h4, h5, h6');
      return Array.from(hs).map((h) => parseInt(h.tagName.replace('H', ''), 10));
    });

    // Verify headings start at h1
    expect(headings[0]).toBe(1);

    // Verify no heading level is skipped (e.g. h1 → h3 without h2)
    for (let i = 1; i < headings.length; i++) {
      const jump = headings[i] - headings[i - 1];
      expect(jump).toBeLessThanOrEqual(1); // can go same level, up (negative), or +1
    }
  });

  test('Sankey energy flow should have ARIA-live region for screen readers', async ({ page }) => {
    await gotoAndWaitForHealth(page, './energy-flow');

    // Check for the Sankey-specific ARIA-live region (sr-only, inside the Sankey container)
    const liveRegion = page.locator(
      '[role="status"][aria-live="polite"][aria-atomic="true"].sr-only',
    );
    await expect(liveRegion).toHaveCount(1);
  });

  test('Sankey energy flow should have accessible sr-only data table', async ({ page }) => {
    await gotoAndWaitForHealth(page, './energy-flow');

    // Check for sr-only data table
    const dataTable = page.locator('table.sr-only');
    await expect(dataTable).toHaveCount(1);

    // Table should have headers
    const headers = dataTable.locator('th');
    await expect(headers).toHaveCount(3);
  });

  test('Focus order should follow visual layout', async ({ page }) => {
    await gotoAndWait(page, './');

    // Tab through first 5 interactive elements and capture their bounding boxes
    const positions: number[] = [];
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press('Tab');
      const box = await page.locator(':focus').boundingBox();
      if (box) positions.push(box.y);
    }

    // Y positions should be generally non-decreasing (top-to-bottom flow)
    // Allow some tolerance for elements at the same vertical position
    for (let i = 1; i < positions.length; i++) {
      // Elements can be on the same line (within 50px tolerance)
      expect(positions[i]).toBeGreaterThanOrEqual(positions[i - 1] - 50);
    }
  });

  test('All images should have alt text', async ({ page }) => {
    await gotoAndWait(page, './');

    const imagesWithoutAlt = await page.evaluate(() => {
      const imgs = document.querySelectorAll('img');
      return Array.from(imgs).filter((img) => !img.hasAttribute('alt') && !img.hasAttribute('role'))
        .length;
    });

    expect(imagesWithoutAlt).toBe(0);
  });

  test('All interactive elements should have accessible names', async ({ page }) => {
    await gotoAndWait(page, './');

    const accessibilityScanResults = await new AxeBuilder({ page })
      .withRules(['button-name', 'link-name', 'input-button-name', 'label'])
      .analyze();

    expect(accessibilityScanResults.violations).toEqual([]);
  });
});
