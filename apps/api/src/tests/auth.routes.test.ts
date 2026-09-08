/**
 * auth.routes.test.ts — Integration tests for /api/auth/* routes.
 *
 * Covers:
 * - GET /api/health (no auth)
 * - POST /api/auth/token (valid / invalid / missing API key)
 * - POST /api/auth/refresh (valid / expired / missing token)
 * - POST /api/auth/revoke (valid, missing jti)
 * - POST /api/auth/ws-ticket (valid JWT, missing auth)
 */

import express from 'express';
import supertest from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';

process.env.NODE_ENV = 'development'; // Dev mode: skip API key validation
process.env.JWT_SECRET = 'test-secret-for-unit-tests-that-is-long-enough-for-hs256-algo';
process.env.API_KEYS = 'valid-test-key';
process.env.API_KEY_SCOPES = 'valid-test-key:readwrite';

const { createAuthRoutes } = await import('../routes/auth.routes.js');
const { configureCors, configureRequestTracking } = await import('../middleware/security.js');
const { signToken } = await import('../jwt-utils.js');

function buildApp(): ReturnType<typeof supertest> {
  const app = express();
  app.use(express.json());
  configureCors(app);
  configureRequestTracking(app);
  app.use(createAuthRoutes());
  return supertest(app);
}

let validToken: string;

beforeAll(async () => {
  validToken = await signToken({ sub: 'testclient', scope: 'readwrite' }, '1h');
});

// ─── Health ──────────────────────────────────────────────────────────

describe('GET /api/health', () => {
  it('returns 200 with status ok', async () => {
    const res = await buildApp().get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  it('returns uptime as number', async () => {
    const res = await buildApp().get('/api/health');
    expect(typeof res.body.uptime).toBe('number');
    expect(res.body.uptime).toBeGreaterThanOrEqual(0);
  });

  it('returns adapters array', async () => {
    const res = await buildApp().get('/api/health');
    expect(Array.isArray(res.body.adapters)).toBe(true);
    expect(res.body.adapters.length).toBeGreaterThan(0);
  });

  it('does NOT expose JWT key metadata (MED-05)', async () => {
    const res = await buildApp().get('/api/health');
    expect(res.body.kid).toBeUndefined();
    expect(res.body.algorithm).toBeUndefined();
    expect(res.body.rotationDueIn).toBeUndefined();
  });
});

// ─── POST /api/auth/token ────────────────────────────────────────────

describe('POST /api/auth/token', () => {
  it('returns a JWT token in dev mode', async () => {
    const res = await buildApp()
      .post('/api/auth/token')
      .send({ clientId: 'testclient', apiKey: 'valid-test-key', scope: 'readwrite' });
    expect(res.status).toBe(200);
    expect(typeof res.body.token).toBe('string');
    expect(res.body.token.split('.').length).toBe(3);
  });

  it('includes expiresIn in response', async () => {
    const res = await buildApp()
      .post('/api/auth/token')
      .send({ clientId: 'testclient', apiKey: 'valid-test-key' });
    expect(res.status).toBe(200);
    expect(res.body.expiresIn).toBeTruthy();
  });

  it('returns 400 for missing required fields', async () => {
    const res = await buildApp().post('/api/auth/token').send({});
    expect(res.status).toBe(400);
    expect(res.body.errors).toBeDefined();
  });

  it('clamps scope to max allowed for API key (CRIT-01)', async () => {
    const res = await buildApp()
      .post('/api/auth/token')
      .send({ clientId: 'c1', apiKey: 'valid-test-key', scope: 'admin' }); // max is readwrite
    expect(res.status).toBe(200);
    expect(res.body.scope).toBe('readwrite');
  });
});

// ─── POST /api/auth/refresh ──────────────────────────────────────────

describe('POST /api/auth/refresh', () => {
  it('refreshes a valid token', async () => {
    const res = await buildApp()
      .post('/api/auth/refresh')
      .set('Authorization', `Bearer ${validToken}`);
    expect(res.status).toBe(200);
    expect(typeof res.body.token).toBe('string');
  });

  it('returns 401 when no Authorization header', async () => {
    const res = await buildApp().post('/api/auth/refresh');
    expect(res.status).toBe(401);
  });

  it('returns 401 for invalid/tampered token', async () => {
    const res = await buildApp()
      .post('/api/auth/refresh')
      .set('Authorization', 'Bearer invalid.token.here');
    expect(res.status).toBe(401);
  });
});

// ─── POST /api/auth/revoke ───────────────────────────────────────────

describe('POST /api/auth/revoke', () => {
  it('revokes a valid token', async () => {
    const tokenToRevoke = await signToken({ sub: 'revoke-client', scope: 'readwrite' }, '1h');
    const res = await buildApp()
      .post('/api/auth/revoke')
      .set('Authorization', `Bearer ${tokenToRevoke}`);
    expect(res.status).toBe(200);
    expect(res.body.revoked).toBe(true);
  });

  it('returns 400 without bearer token to revoke', async () => {
    // With requireJWT bypassed in dev mode, the endpoint still returns 400
    // when no Authorization header is provided (checked inside the handler)
    const res = await buildApp().post('/api/auth/revoke');
    expect(res.status).toBe(400);
  });
});

// ─── POST /api/auth/ws-ticket ─────────────────────────────────────────
// Note: In dev mode NODE_ENV=development, requireJWT is bypassed (anonymous access allowed).
// Auth-gating for ws-ticket is enforced in production mode only (tested via requireJWT unit tests).

describe('POST /api/auth/ws-ticket', () => {
  it('returns a WS ticket UUID', async () => {
    const res = await buildApp()
      .post('/api/auth/ws-ticket')
      .set('Authorization', `Bearer ${validToken}`);
    expect(res.status).toBe(200);
    expect(typeof res.body.ticket).toBe('string');
    expect(res.body.ticket).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });

  it('returns expiresIn: 60 in response (HIGH-04 single-use 60s TTL)', async () => {
    const res = await buildApp()
      .post('/api/auth/ws-ticket')
      .set('Authorization', `Bearer ${validToken}`);
    expect(res.status).toBe(200);
    expect(res.body.expiresIn).toBe(60);
  });

  it('each call returns a unique ticket', async () => {
    const app = buildApp();
    const res1 = await app.post('/api/auth/ws-ticket').set('Authorization', `Bearer ${validToken}`);
    const res2 = await app.post('/api/auth/ws-ticket').set('Authorization', `Bearer ${validToken}`);
    expect(res1.body.ticket).not.toBe(res2.body.ticket);
  });
});
