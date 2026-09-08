import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { attachPageErrorHandler, setupLocalStorage } from './e2e-setup';

async function gotoCertificatesTab(page: import('@playwright/test').Page) {
  await page.goto('./settings?tab=certificates', {
    waitUntil: 'domcontentloaded',
    timeout: 15_000,
  });
  await page.waitForSelector('#main-content h1', { timeout: 30_000 });
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
    { timeout: 15_000 },
  );
}

test.describe('EEBUS pairing & certificates', () => {
  test.beforeEach(async ({ page }) => {
    attachPageErrorHandler(page);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.addInitScript(setupLocalStorage);
  });

  test('EEBUS certificates tab renders trust store and import controls', async ({ page }) => {
    test.setTimeout(60_000);
    await gotoCertificatesTab(page);

    await expect(page.locator('#cert-mgmt-heading')).toBeVisible();
    const importCertButton = page.getByRole('button', {
      name: /Import Certificate|Zertifikat importieren/i,
    });
    await expect(importCertButton).toBeVisible();
    await expect(page.locator('#ship-trust-heading')).toBeVisible();

    await importCertButton.focus();
    await expect(importCertButton).toBeFocused();
  });

  test('EEBUS certificates tab is keyboard reachable from settings nav', async ({ page }) => {
    test.setTimeout(60_000);
    await page.goto('./settings', { waitUntil: 'domcontentloaded', timeout: 15_000 });
    await page.waitForSelector('#main-content h1', { timeout: 30_000 });

    const certsTab = page.getByRole('tab', { name: /eebus/i });
    await expect(certsTab).toBeVisible();
    await certsTab.focus();
    await certsTab.press('Enter');

    await expect(page).toHaveURL(/tab=certificates/);
    await expect(page.locator('#cert-mgmt-heading')).toBeVisible();
  });

  test('EEBUS certificates tab passes WCAG 2.2 AA axe scan', async ({ page }) => {
    test.setTimeout(60_000);
    await gotoCertificatesTab(page);

    const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze();

    expect(accessibilityScanResults.violations).toEqual([]);
  });
});
