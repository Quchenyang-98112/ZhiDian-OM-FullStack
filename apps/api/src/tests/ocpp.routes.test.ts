/**
 * ocpp.routes.test.ts — Integration tests for /api/ocpp/* routes.
 */

import express from 'express';
import supertest from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const SECRET = 'nexus-hems-ci-fixture-jwt-signing-key-not-a-real-credential';
const PEM_CERT = '-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----';
const PEM_KEY = '-----BEGIN PRIVATE KEY-----\nMIIE\n-----END PRIVATE KEY-----';

describe('OCPP API routes', () => {
  const prevEnv = { ...process.env };

  let createOcppRoutes: typeof import('../routes/ocpp.routes.js').createOcppRoutes;
  let signToken: typeof import('../jwt-utils.js').signToken;
  let ocppSessionStore: typeof import('../services/ocpp-session-store.js').ocppSessionStore;

  let readwriteToken: string;
  let readToken: string;

  beforeAll(async () => {
    vi.resetModules();
    process.env.NODE_ENV = 'production';
    process.env.JWT_SECRET = SECRET;
    delete process.env.JWT_SECRET_NEW;

    createOcppRoutes = (await import('../routes/ocpp.routes.js')).createOcppRoutes;
    signToken = (await import('../jwt-utils.js')).signToken;
    ocppSessionStore = (await import('../services/ocpp-session-store.js')).ocppSessionStore;

    readwriteToken = await signToken({ sub: 'writer', scope: 'readwrite' }, '1h');
    readToken = await signToken({ sub: 'reader', scope: 'read' }, '1h');
  }, 60_000);

  afterAll(() => {
    process.env = { ...prevEnv };
    vi.resetModules();
  });

  beforeEach(() => {
    ocppSessionStore.clearForTests();
  });

  function buildApp(): ReturnType<typeof supertest> {
    const app = express();
    app.use(express.json({ limit: '64kb' }));
    app.use(createOcppRoutes());
    return supertest(app);
  }

  describe('POST /api/ocpp/proxy-session', () => {
    const body = {
      host: '192.168.1.100',
      port: 9000,
      stationId: 'CP001',
      clientCert: PEM_CERT,
      clientKey: PEM_KEY,
    };

    it('issues a session id with readwrite JWT', async () => {
      const res = await buildApp()
        .post('/api/ocpp/proxy-session')
        .set('Authorization', `Bearer ${readwriteToken}`)
        .send(body);

      expect(res.status).toBe(200);
      expect(res.body.sessionId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      );
      expect(res.body.expiresIn).toBe(60);
    });

    it('rejects read-only scope', async () => {
      const res = await buildApp()
        .post('/api/ocpp/proxy-session')
        .set('Authorization', `Bearer ${readToken}`)
        .send(body);

      expect(res.status).toBe(403);
    });

    it('rejects public host (SSRF guard)', async () => {
      const res = await buildApp()
        .post('/api/ocpp/proxy-session')
        .set('Authorization', `Bearer ${readwriteToken}`)
        .send({ ...body, host: '8.8.8.8' });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/private/i);
    });

    it('rejects missing PEM material', async () => {
      const res = await buildApp()
        .post('/api/ocpp/proxy-session')
        .set('Authorization', `Bearer ${readwriteToken}`)
        .send({ ...body, clientKey: '' });

      expect(res.status).toBe(400);
    });

    it('requires JWT', async () => {
      const res = await buildApp().post('/api/ocpp/proxy-session').send(body);
      expect(res.status).toBe(401);
    });

    it('rejects when READ_ONLY_MODE is active', async () => {
      const originalReadOnly = process.env.READ_ONLY_MODE;
      process.env.READ_ONLY_MODE = 'true';
      try {
        const res = await buildApp()
          .post('/api/ocpp/proxy-session')
          .set('Authorization', `Bearer ${readwriteToken}`)
          .send(body);
        expect(res.status).toBe(403);
        expect(res.body.error).toMatch(/READ_ONLY_MODE/i);
      } finally {
        if (originalReadOnly === undefined) delete process.env.READ_ONLY_MODE;
        else process.env.READ_ONLY_MODE = originalReadOnly;
      }
    });
  });
});
