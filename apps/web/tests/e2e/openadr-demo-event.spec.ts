import { expect, test } from '@playwright/test';
import {
  attachPageErrorHandler,
  gotoAndWaitForHealth,
  mockBackendHealth,
  setupLocalStorage,
} from './e2e-setup';

test.describe('OpenADR demo events', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(setupLocalStorage);
    attachPageErrorHandler(page);
    await mockBackendHealth(page);

    await page.route('**/api/openadr/token', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          access_token: 'demo-token',
          token_type: 'Bearer',
          expires_in: 3600,
        }),
      });
    });

    await page.route('**/api/openadr/programs', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          { id: 'nexus-hems-program', programName: 'Nexus HEMS Demo Program' },
        ]),
      });
    });

    await page.route('**/api/openadr/events*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: 'demo-event-001',
            eventName: 'DemoLoadControl',
            programID: 'nexus-hems-program',
            payloadDescriptors: [{ payloadType: 'LOAD_CONTROL' }],
            intervals: [
              {
                id: 0,
                payloads: [
                  { type: 'EV_MAX_POWER_W', values: [4140] },
                  { type: 'HVAC_MAX_POWER_W', values: [2000] },
                ],
              },
            ],
          },
        ]),
      });
    });
  });

  test('OpenADR programs and events API respond in demo mode', async ({ page }) => {
    await gotoAndWaitForHealth(page, './');

    const programs = await page.evaluate(async () => {
      const res = await fetch('/api/openadr/programs', {
        headers: { Authorization: 'Bearer demo' },
      });
      return res.json();
    });

    expect(Array.isArray(programs)).toBe(true);
    expect(programs[0]?.id).toBe('nexus-hems-program');

    const events = await page.evaluate(async () => {
      const res = await fetch('/api/openadr/events?programId=nexus-hems-program', {
        headers: { Authorization: 'Bearer demo' },
      });
      return res.json();
    });

    expect(events[0]?.payloadDescriptors?.[0]?.payloadType).toBe('LOAD_CONTROL');
  });
});
