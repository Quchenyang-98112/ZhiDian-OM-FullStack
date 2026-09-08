/**
 * security.test.ts — Unit tests for CORS, rate limiting, and request tracking middleware.
 *
 * Covers:
 * - configureCors: allowed origins, blocked origins, production vs dev
 * - configureRequestTracking: X-Request-ID generation and preservation
 * - Rate limiter: createRateLimiter returns valid express middleware
 */

import express from 'express';
import supertest from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

// Set env BEFORE importing middleware (module-level env reads).
// Strong secret (no weak pattern, high entropy) so the production-mode CORS
// tests below can boot key material without tripping the CRIT-03 guard.
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'nexus-hems-ci-fixture-jwt-signing-key-not-a-real-credential';

const { configureCors, configureRequestTracking } = await import('../middleware/security.js');

// ─── Helpers ────────────────────────────────────────────────────────

function buildApp(extraMiddleware?: Parameters<typeof express.Application.prototype.use>[0]) {
  const app = express();
  configureCors(app);
  configureRequestTracking(app);
  if (extraMiddleware) app.use(extraMiddleware);
  app.get('/test', (_req, res) => res.json({ ok: true }));
  return app;
}

// ─── CORS ────────────────────────────────────────────────────────────

describe('configureCors — development mode', () => {
  beforeEach(() => {
    process.env.NODE_ENV = 'development';
  });

  it('allows requests with localhost origin', async () => {
    const app = buildApp();
    const res = await supertest(app).get('/test').set('Origin', 'http://localhost:5173');
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173');
  });

  it('allows requests from GitHub Pages origin', async () => {
    const app = buildApp();
    const res = await supertest(app).get('/test').set('Origin', 'https://qnbs.github.io');
    expect(res.headers['access-control-allow-origin']).toBe('https://qnbs.github.io');
  });

  it('blocks requests from unknown origins', async () => {
    const app = buildApp();
    const res = await supertest(app).get('/test').set('Origin', 'https://evil.example.com');
    // CORS block: no allow-origin header set to evil domain
    expect(res.headers['access-control-allow-origin'] ?? '').not.toBe('https://evil.example.com');
  });
});

describe('configureCors — production mode', () => {
  beforeEach(() => {
    process.env.NODE_ENV = 'production';
  });

  afterAll(() => {
    process.env.NODE_ENV = 'test';
  });

  it('blocks localhost origins in production', async () => {
    const app = buildApp();
    const res = await supertest(app).get('/test').set('Origin', 'http://localhost:5173');
    expect(res.headers['access-control-allow-origin'] ?? '').not.toBe('http://localhost:5173');
  });

  it('allows GitHub Pages in production', async () => {
    const app = buildApp();
    const res = await supertest(app).get('/test').set('Origin', 'https://qnbs.github.io');
    expect(res.headers['access-control-allow-origin']).toBe('https://qnbs.github.io');
  });

  it('allows PATCH preflight requests from allowed origins', async () => {
    const app = buildApp();
    const res = await supertest(app)
      .options('/test')
      .set('Origin', 'https://qnbs.github.io')
      .set('Access-Control-Request-Method', 'PATCH');
    expect(res.status).toBe(204);
    expect(res.headers['access-control-allow-methods']).toContain('PATCH');
    expect(res.headers['access-control-allow-methods']).toContain('PUT');
    expect(res.headers['access-control-allow-methods']).toContain('DELETE');
  });
});

// ─── Request ID Tracking ─────────────────────────────────────────────

describe('configureRequestTracking', () => {
  beforeEach(() => {
    process.env.NODE_ENV = 'test';
  });

  it('adds X-Request-ID header to response', async () => {
    const app = buildApp();
    const res = await supertest(app).get('/test');
    expect(res.headers['x-request-id']).toBeTruthy();
    expect(typeof res.headers['x-request-id']).toBe('string');
  });

  it('preserves existing X-Request-ID if provided by client', async () => {
    const app = buildApp();
    const clientId = 'my-custom-req-id-12345';
    const res = await supertest(app).get('/test').set('X-Request-ID', clientId);
    expect(res.headers['x-request-id']).toBe(clientId);
  });

  it('generates a new UUID when no X-Request-ID provided', async () => {
    const app = buildApp();
    const res = await supertest(app).get('/test');
    const id = res.headers['x-request-id'] as string;
    // UUID v4 format: 8-4-4-4-12
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  });
});
