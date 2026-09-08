/**
 * History + command-audit routes — query validation and admin audit access.
 */

import express from 'express';
import supertest from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const SECRET = 'nexus-hems-ci-fixture-jwt-signing-key-not-a-real-credential';

describe('History API routes', () => {
  const prevEnv = { ...process.env };

  let createHistoryRoutes: typeof import('../routes/history.routes.js').createHistoryRoutes;
  let signToken: typeof import('../jwt-utils.js').signToken;

  beforeAll(async () => {
    vi.resetModules();
    process.env.NODE_ENV = 'production';
    process.env.JWT_SECRET = SECRET;
    delete process.env.JWT_SECRET_NEW;

    createHistoryRoutes = (await import('../routes/history.routes.js')).createHistoryRoutes;
    signToken = (await import('../jwt-utils.js')).signToken;
  }, 60_000);

  afterAll(() => {
    process.env = { ...prevEnv };
    vi.resetModules();
  });

  function buildApp() {
    const app = express();
    app.use('/api/v1', createHistoryRoutes());
    return supertest(app);
  }

  it('rejects history query with invalid metric identifier', async () => {
    const res = await buildApp()
      .get('/api/v1/history')
      .query({
        metric: 'DROP ME',
        from: '2026-01-01T00:00:00Z',
        to: '2026-01-02T00:00:00Z',
      })
      .expect(400);
    expect(res.body.error).toMatch(/Invalid query/i);
  });

  it('accepts valid history query shape (Influx may be unavailable in CI)', async () => {
    const res = await buildApp()
      .get('/api/v1/history')
      .query({
        metric: 'pv_power',
        from: '2026-01-01T00:00:00Z',
        to: '2026-01-02T00:00:00Z',
        granularity: '5m',
      })
      .expect(200);
    expect(res.body.metric).toBe('pv_power');
    expect(['influxdb', 'unavailable']).toContain(res.body.source);
  });

  it('requires admin scope for command-audit', async () => {
    const bearer = await signToken({ sub: 'reader', scope: 'read' }, '1h');
    await buildApp()
      .get('/api/v1/command-audit')
      .set('Authorization', `Bearer ${bearer}`)
      .expect(403);
  });

  it('returns command audit entries for admin scope', async () => {
    const bearer = await signToken({ sub: 'admin', scope: 'admin' }, '1h');
    const res = await buildApp()
      .get('/api/v1/command-audit?limit=10')
      .set('Authorization', `Bearer ${bearer}`)
      .expect(200);
    expect(res.body).toHaveProperty('entries');
    expect(res.body.count).toBeGreaterThanOrEqual(0);
  });
});
