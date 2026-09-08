import { expect, test } from '@playwright/test';
import { attachPageErrorHandler, setupLocalStorage } from './e2e-setup';

/**
 * Regression guard for the reliable fixed header.
 *
 * The header previously computed to `position: relative` because
 * `.header-accent-line { position: relative }` overrode the Tailwind position
 * utility, so it scrolled out of view. It is now `position: fixed` with a
 * JS-measured `--header-height` reserving space in the content column.
 */
test.describe('Fixed app header', () => {
  test.beforeEach(async ({ page }) => {
    attachPageErrorHandler(page);
    await page.addInitScript(setupLocalStorage);
  });

  test('is position:fixed and stays pinned to the top on scroll', async ({ page }) => {
    await page.goto('./', { waitUntil: 'domcontentloaded' });

    const header = page.locator('header').first();
    await expect(header).toBeVisible();

    // Root-cause guard: the header must resolve to a fixed position.
    const position = await header.evaluate((el) => getComputedStyle(el).position);
    expect(position).toBe('fixed');

    // It starts flush with the top of the viewport.
    const before = await header.boundingBox();
    expect(before?.y ?? -1).toBeLessThanOrEqual(1);

    // After scrolling the document, a fixed header must not move upward.
    await page.evaluate(() => window.scrollTo(0, 1500));
    await page.waitForTimeout(150);

    const after = await header.boundingBox();
    expect(after?.y ?? -1).toBeLessThanOrEqual(1);
    await expect(header).toBeInViewport();

    // The content column reserves the header height (set by the ResizeObserver).
    const headerHeight = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--header-height').trim(),
    );
    expect(headerHeight).toMatch(/[1-9]/);
  });
});
