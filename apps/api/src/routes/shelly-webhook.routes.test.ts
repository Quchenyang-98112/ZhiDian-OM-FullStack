/**
 * Shelly webhook route tests — SSRF guard on source IP
 */

import type { Express } from 'express';
import express from 'express';
import supertest from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { shellyWebhookBus } from './shelly-webhook.routes.js';

vi.mock('../middleware/auth.js', () => ({
  requireJWT: (_req: unknown, _res: unknown, next: () => void) => next(),
  requireScope: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

const { createShellyWebhookRoutes } = await import('./shelly-webhook.routes.js');

describe('POST /api/shelly/webhook', () => {
  let app: Express;

  beforeEach(() => {
    app = express();
    app.set('trust proxy', true);
    app.use(express.json());
    app.use(createShellyWebhookRoutes());
  });

  afterEach(() => {
    shellyWebhookBus.removeAllListeners('update');
  });

  it('returns 200 but ignores payloads from public IPs', async () => {
    const emitted = vi.fn();
    shellyWebhookBus.on('update', emitted);

    await supertest(app)
      .post('/api/shelly/webhook')
      .set('X-Forwarded-For', '8.8.8.8')
      .send({
        src: 'shellyem3-AABBCC',
        method: 'NotifyStatus',
        params: { 'em:0': { total_act_power: 100 } },
      })
      .expect(200);

    expect(emitted).not.toHaveBeenCalled();
  });

  it('emits update events for private LAN source IPs', async () => {
    const emitted = vi.fn();
    shellyWebhookBus.on('update', emitted);

    await supertest(app)
      .post('/api/shelly/webhook')
      .set('X-Forwarded-For', '192.168.1.42')
      .send({
        src: 'shellyem3-AABBCC',
        method: 'NotifyStatus',
        params: { 'em:0': { total_act_power: 100 } },
      })
      .expect(200);

    expect(emitted).toHaveBeenCalledTimes(1);
    expect(emitted.mock.calls[0]?.[0]).toMatchObject({ src: 'shellyem3-AABBCC' });
  });
});
