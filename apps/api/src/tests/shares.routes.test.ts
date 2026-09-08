/**
 * MED-06 — POST /api/shares + POST /api/shares/:id/redeem
 */

import express from 'express';
import supertest from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const SECRET = 'nexus-hems-ci-fixture-jwt-signing-key-not-a-real-credential';

describe('Dashboard shares API', () => {
  const prevEnv = { ...process.env };

  let createSharesRoutes: typeof import('../routes/shares.routes.js').createSharesRoutes;
  let signToken: typeof import('../jwt-utils.js').signToken;

  beforeAll(async () => {
    vi.resetModules();
    process.env.NODE_ENV = 'production';
    process.env.JWT_SECRET = SECRET;
    delete process.env.JWT_SECRET_NEW;
    process.env.API_KEYS = 'share-test-key';
    process.env.API_KEY_SCOPES = 'share-test-key:readwrite';

    const routes = await import('../routes/shares.routes.js');
    routes.shareTicketStore.clearForTests();
    const jwt = await import('../jwt-utils.js');
    createSharesRoutes = routes.createSharesRoutes;
    signToken = jwt.signToken;
  }, 60_000);

  afterAll(() => {
    process.env = { ...prevEnv };
    vi.resetModules();
  });

  function buildApp() {
    const app = express();
    app.use(express.json());
    app.use(createSharesRoutes());
    return supertest(app);
  }

  it('creates and redeems a single-use share', async () => {
    const bearer = await signToken({ sub: 'owner-1', scope: 'readwrite' }, '1h');

    const createRes = await buildApp()
      .post('/api/shares')
      .set('Authorization', `Bearer ${bearer}`)
      .send({ name: 'Test Board', permissions: 'view' });

    expect(createRes.status).toBe(200);
    const { shareId, redeemToken } = createRes.body as {
      shareId: string;
      redeemToken: string;
    };
    expect(typeof shareId).toBe('string');
    expect(typeof redeemToken).toBe('string');

    const redeemRes = await buildApp()
      .post(`/api/shares/${shareId}/redeem`)
      .send({ token: redeemToken });

    expect(redeemRes.status).toBe(200);
    expect(redeemRes.body.name).toBe('Test Board');

    const second = await buildApp()
      .post(`/api/shares/${shareId}/redeem`)
      .send({ token: redeemToken });
    expect(second.status).toBe(404);
  });

  it('rejects wrong redeem token', async () => {
    const bearer = await signToken({ sub: 'owner-2', scope: 'readwrite' }, '1h');
    const createRes = await buildApp()
      .post('/api/shares')
      .set('Authorization', `Bearer ${bearer}`)
      .send({ name: 'X', permissions: 'admin' });

    const { shareId } = createRes.body as { shareId: string };

    const bad = await buildApp()
      .post(`/api/shares/${shareId}/redeem`)
      .send({ token: '0'.repeat(64) });
    expect(bad.status).toBe(401);
  });
});
