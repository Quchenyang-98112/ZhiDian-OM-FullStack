/**
 * Metrics routes — Prometheus text + JSON dashboard endpoint.
 */

import express from 'express';
import supertest from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { WebSocketServer } from 'ws';

const SECRET = 'nexus-hems-ci-fixture-jwt-signing-key-not-a-real-credential';

describe('Metrics API routes', () => {
  const prevEnv = { ...process.env };

  let createMetricsRoutes: typeof import('../routes/metrics.routes.js').createMetricsRoutes;
  let signToken: typeof import('../jwt-utils.js').signToken;
  let wss: WebSocketServer;

  beforeAll(async () => {
    vi.resetModules();
    process.env.NODE_ENV = 'production';
    process.env.JWT_SECRET = SECRET;
    delete process.env.JWT_SECRET_NEW;

    wss = new WebSocketServer({ noServer: true });
    createMetricsRoutes = (await import('../routes/metrics.routes.js')).createMetricsRoutes;
    signToken = (await import('../jwt-utils.js')).signToken;
  }, 60_000);

  afterAll(() => {
    wss.close();
    process.env = { ...prevEnv };
    vi.resetModules();
  });

  function buildApp() {
    const app = express();
    app.use(createMetricsRoutes(wss));
    return supertest(app);
  }

  it('rejects unauthenticated Prometheus scrape', async () => {
    await buildApp().get('/metrics').expect(401);
  });

  it('returns Prometheus text for authenticated scrape', async () => {
    const { recordAdapterConnection, publishAllAdapterMetrics } = await import(
      '../middleware/adapter-metrics.js'
    );
    recordAdapterConnection('test-inv', 'modbus-sunspec', 'connected');
    publishAllAdapterMetrics();

    const bearer = await signToken({ sub: 'ops', scope: 'read' }, '1h');
    const res = await buildApp()
      .get('/metrics')
      .set('Authorization', `Bearer ${bearer}`)
      .expect(200);
    expect(res.headers['content-type']).toMatch(/text\/plain/);
    expect(res.text).toContain('hems_adapter_connected');
  });

  it('returns JSON metric families for dashboard', async () => {
    const bearer = await signToken({ sub: 'ops', scope: 'read' }, '1h');
    const res = await buildApp()
      .get('/api/metrics/json')
      .set('Authorization', `Bearer ${bearer}`)
      .expect(200);
    expect(res.body).toHaveProperty('families');
    expect(res.body.health).toHaveProperty('uptime');
    expect(res.body.health).toHaveProperty('connections');
  });
});
