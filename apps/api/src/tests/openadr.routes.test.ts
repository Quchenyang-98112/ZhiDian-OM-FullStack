/**
 * OpenADR 3.1 proxy routes — demo mode (no VTN configured) + validation gates.
 */

import express from 'express';
import supertest from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const SECRET = 'nexus-hems-ci-fixture-jwt-signing-key-not-a-real-credential';

describe('OpenADR API routes (demo mode)', () => {
  const prevEnv = { ...process.env };

  let createOpenADRRoutes: typeof import('../routes/openadr.routes.js').createOpenADRRoutes;
  let signToken: typeof import('../jwt-utils.js').signToken;

  beforeAll(async () => {
    vi.resetModules();
    process.env.NODE_ENV = 'production';
    process.env.JWT_SECRET = SECRET;
    delete process.env.JWT_SECRET_NEW;
    delete process.env.OPENADR_VTN_URL;
    delete process.env.OPENADR_CLIENT_ID;
    delete process.env.OPENADR_CLIENT_SECRET;

    createOpenADRRoutes = (await import('../routes/openadr.routes.js')).createOpenADRRoutes;
    signToken = (await import('../jwt-utils.js')).signToken;
  }, 60_000);

  afterAll(() => {
    process.env = { ...prevEnv };
    vi.resetModules();
  });

  function buildApp() {
    const app = express();
    app.use(express.json());
    app.use(createOpenADRRoutes());
    return app;
  }

  async function bearer(scope: 'read' | 'readwrite' | 'admin' = 'read') {
    return signToken({ sub: 'ven', scope }, '1h');
  }

  it('rejects unauthenticated token request', async () => {
    await supertest(buildApp()).post('/api/openadr/token').expect(401);
  });

  it('rejects unauthenticated events fetch', async () => {
    await supertest(buildApp()).get('/api/openadr/events').expect(401);
  });

  it('rejects invalid eventId characters', async () => {
    await supertest(buildApp())
      .post('/api/openadr/events/not-valid!!!/acknowledge')
      .set('Authorization', `Bearer ${await bearer('readwrite')}`)
      .send({})
      .expect(400);
  });

  it('returns synthetic demo OAuth token when VTN is not configured', async () => {
    const res = await supertest(buildApp())
      .post('/api/openadr/token')
      .set('Authorization', `Bearer ${await bearer()}`)
      .expect(200);

    expect(res.body.access_token).toBe('nexus-openadr-demo-token');
    expect(res.body.token_type).toBe('Bearer');
    expect(res.body.expires_in).toBe(3600);
  });

  it('returns demo DR programs', async () => {
    const res = await supertest(buildApp())
      .get('/api/openadr/programs')
      .set('Authorization', `Bearer ${await bearer()}`)
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body[0].id).toBe('nexus-hems-program');
  });

  it('buffers webhook events in demo mode', async () => {
    const payload = { eventName: 'WebhookTest', programID: 'nexus-hems-program' };
    const post = await supertest(buildApp())
      .post('/api/openadr/webhook')
      .set('Authorization', `Bearer ${await bearer('readwrite')}`)
      .send(payload)
      .expect(202);

    expect(post.body.accepted).toBe(true);
    expect(post.body.note).toBe('demo-mode');

    const buffered = await supertest(buildApp())
      .get('/api/openadr/webhook/events')
      .set('Authorization', `Bearer ${await bearer()}`)
      .expect(200);

    expect(buffered.body).toEqual(expect.arrayContaining([payload]));
  });

  it('returns demo load-control events', async () => {
    const res = await supertest(buildApp())
      .get('/api/openadr/events?programId=test-program')
      .set('Authorization', `Bearer ${await bearer()}`)
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body[0].programID).toBe('test-program');
    expect(res.body[0].payloadDescriptors[0].payloadType).toBe('LOAD_CONTROL');
  });

  it('acknowledges events in demo mode', async () => {
    const res = await supertest(buildApp())
      .post('/api/openadr/events/demo-event-001/acknowledge')
      .set('Authorization', `Bearer ${await bearer('readwrite')}`)
      .send({ optType: 'optIn' })
      .expect(200);

    expect(res.body.acknowledged).toBe(true);
    expect(res.body.note).toBe('demo-mode');
  });

  it('rejects malformed eventId before demo ack', async () => {
    await supertest(buildApp())
      .post('/api/openadr/events/not%20valid/acknowledge')
      .set('Authorization', `Bearer ${await bearer('readwrite')}`)
      .send({})
      .expect(400);
  });

  it('accepts demo telemetry report submission', async () => {
    const res = await supertest(buildApp())
      .post('/api/openadr/reports')
      .set('Authorization', `Bearer ${await bearer('readwrite')}`)
      .send({ reportName: 'battery-flex', values: [{ ts: Date.now(), watts: 1200 }] })
      .expect(200);

    expect(res.body.id).toBe('demo-report-001');
    expect(res.body.note).toBe('demo-mode');
  });

  describe('READ_ONLY_MODE blocks mutating routes', () => {
    let originalReadOnly: string | undefined;

    beforeEach(() => {
      originalReadOnly = process.env.READ_ONLY_MODE;
      process.env.READ_ONLY_MODE = 'true';
    });

    afterEach(() => {
      if (originalReadOnly === undefined) delete process.env.READ_ONLY_MODE;
      else process.env.READ_ONLY_MODE = originalReadOnly;
    });

    it('blocks event acknowledge', async () => {
      const res = await supertest(buildApp())
        .post('/api/openadr/events/demo-event-001/acknowledge')
        .set('Authorization', `Bearer ${await bearer('readwrite')}`)
        .send({ optType: 'optIn' })
        .expect(403);
      expect(res.body.error).toMatch(/READ_ONLY_MODE/i);
    });

    it('blocks report submission', async () => {
      const res = await supertest(buildApp())
        .post('/api/openadr/reports')
        .set('Authorization', `Bearer ${await bearer('readwrite')}`)
        .send({ reportName: 'battery-flex', values: [{ ts: Date.now(), watts: 1200 }] })
        .expect(403);
      expect(res.body.error).toMatch(/READ_ONLY_MODE/i);
    });
  });
});
