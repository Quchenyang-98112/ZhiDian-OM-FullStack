/**
 * Grafana dashboard JSON API — JWT-protected provisioning helper.
 */

import express from 'express';
import supertest from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const SECRET = 'nexus-hems-ci-fixture-jwt-signing-key-not-a-real-credential';

describe('Grafana dashboard route', () => {
  const prevEnv = { ...process.env };

  let createGrafanaRoutes: typeof import('../routes/grafana.routes.js').createGrafanaRoutes;
  let signToken: typeof import('../jwt-utils.js').signToken;

  beforeAll(async () => {
    vi.resetModules();
    process.env.NODE_ENV = 'production';
    process.env.JWT_SECRET = SECRET;
    delete process.env.JWT_SECRET_NEW;

    createGrafanaRoutes = (await import('../routes/grafana.routes.js')).createGrafanaRoutes;
    signToken = (await import('../jwt-utils.js')).signToken;
  }, 60_000);

  afterAll(() => {
    process.env = { ...prevEnv };
    vi.resetModules();
  });

  function buildApp() {
    const app = express();
    app.use(createGrafanaRoutes());
    return supertest(app);
  }

  it('rejects unauthenticated dashboard export', async () => {
    await buildApp().get('/api/grafana/dashboard').expect(401);
  });

  it('returns embedded Grafana dashboard model for authenticated users', async () => {
    const bearer = await signToken({ sub: 'ops', scope: 'read' }, '1h');
    const res = await buildApp()
      .get('/api/grafana/dashboard')
      .set('Authorization', `Bearer ${bearer}`)
      .expect(200);

    expect(res.body.dashboard.uid).toBe('nexus-hems-overview');
    expect(res.body.dashboard.panels.length).toBeGreaterThan(0);
    expect(res.body.overwrite).toBe(true);
  });
});
