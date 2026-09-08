/**
 * POST /api/auth/rotate-key — production auth + admin scope (HIGH-07).
 */

import express from 'express';
import supertest from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const SECRET = 'nexus-hems-ci-fixture-jwt-signing-key-not-a-real-credential';

describe('POST /api/auth/rotate-key (production)', () => {
  const prevEnv = { ...process.env };

  let createAuthRoutes: typeof import('../routes/auth.routes.js').createAuthRoutes;
  let signToken: typeof import('../jwt-utils.js').signToken;

  beforeAll(async () => {
    vi.resetModules();
    process.env.NODE_ENV = 'production';
    process.env.JWT_SECRET = SECRET;
    delete process.env.JWT_SECRET_NEW;
    process.env.API_KEYS = 'prod-rotate-key';
    process.env.API_KEY_SCOPES = 'prod-rotate-key:admin';

    const routes = await import('../routes/auth.routes.js');
    const jwt = await import('../jwt-utils.js');
    createAuthRoutes = routes.createAuthRoutes;
    signToken = jwt.signToken;
  }, 60_000);

  afterAll(() => {
    process.env = { ...prevEnv };
    vi.resetModules();
  });

  function buildApp() {
    const app = express();
    app.use(express.json());
    app.use(createAuthRoutes());
    return supertest(app);
  }

  it('returns 403 for readwrite token', async () => {
    const rwToken = await signToken({ sub: 'rw', scope: 'readwrite' }, '1h');

    const res = await buildApp()
      .post('/api/auth/rotate-key')
      .set('Authorization', `Bearer ${rwToken}`);

    expect(res.status).toBe(403);
  });

  it('returns 200 with key metadata for admin token', async () => {
    const adminToken = await signToken({ sub: 'admin', scope: 'admin' }, '1h');

    const res = await buildApp()
      .post('/api/auth/rotate-key')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(typeof res.body.primaryKid).toBe('string');
    expect(res.body.dualKey).toBe(false);
    expect(res.body.reloadedAt).toBeDefined();
  });
});
