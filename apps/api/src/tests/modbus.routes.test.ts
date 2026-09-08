/**
 * Modbus SunSpec REST proxy — GET /api/modbus/sunspec + POST /api/modbus/write
 */

import express from 'express';
import supertest from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const SECRET = 'nexus-hems-ci-fixture-jwt-signing-key-not-a-real-credential';

describe('Modbus SunSpec proxy API', () => {
  const prevEnv = { ...process.env };

  let createModbusRoutes: typeof import('../routes/modbus.routes.js').createModbusRoutes;
  let signToken: typeof import('../jwt-utils.js').signToken;

  beforeAll(async () => {
    vi.resetModules();
    process.env.NODE_ENV = 'production';
    process.env.JWT_SECRET = SECRET;
    delete process.env.JWT_SECRET_NEW;
    delete process.env.ADAPTER_MODE; // → effective mock mode
    delete process.env.ALLOW_LIVE_HARDWARE;

    createModbusRoutes = (await import('../routes/modbus.routes.js')).createModbusRoutes;
    signToken = (await import('../jwt-utils.js')).signToken;
  }, 60_000);

  afterAll(() => {
    process.env = { ...prevEnv };
    vi.resetModules();
  });

  function buildApp() {
    const app = express();
    app.use(express.json());
    app.use(createModbusRoutes());
    return supertest(app);
  }

  it('rejects unauthenticated reads', async () => {
    await buildApp().get('/api/modbus/sunspec?model=battery').expect(401);
  });

  it('returns SunSpec battery model fields', async () => {
    const bearer = await signToken({ sub: 'reader', scope: 'read' }, '1h');
    const res = await buildApp()
      .get('/api/modbus/sunspec?model=battery')
      .set('Authorization', `Bearer ${bearer}`)
      .expect(200);
    expect(res.body).toHaveProperty('W');
    expect(res.body).toHaveProperty('SoC');
    expect(res.body.W_SF).toBe(0);
  });

  it('returns each supported model with its key fields', async () => {
    const bearer = await signToken({ sub: 'reader', scope: 'read' }, '1h');
    const api = buildApp();
    const common = await api
      .get('/api/modbus/sunspec?model=common')
      .set('Authorization', `Bearer ${bearer}`)
      .expect(200);
    expect(common.body.Mn).toBe('Nexus-HEMS');
    const inverter = await api
      .get('/api/modbus/sunspec?model=inverter')
      .set('Authorization', `Bearer ${bearer}`)
      .expect(200);
    expect(Array.isArray(inverter.body.strings)).toBe(true);
    const meter = await api
      .get('/api/modbus/sunspec?model=meter')
      .set('Authorization', `Bearer ${bearer}`)
      .expect(200);
    expect(meter.body).toHaveProperty('W');
  });

  it('rejects an unknown model with 400', async () => {
    const bearer = await signToken({ sub: 'reader', scope: 'read' }, '1h');
    await buildApp()
      .get('/api/modbus/sunspec?model=bogus')
      .set('Authorization', `Bearer ${bearer}`)
      .expect(400);
  });

  it('accepts a valid write with readwrite scope', async () => {
    const bearer = await signToken({ sub: 'writer', scope: 'readwrite' }, '1h');
    const res = await buildApp()
      .post('/api/modbus/write')
      .set('Authorization', `Bearer ${bearer}`)
      .send({ register: 'WChaMax', value: 2000 })
      .expect(200);
    expect(res.body).toEqual({ ok: true, register: 'WChaMax', value: 2000 });
  });

  it('deduplicates POST /api/modbus/write retries via X-Idempotency-Key', async () => {
    const { clearIdempotencyCacheForTests } = await import('../data/idempotency-cache.js');
    clearIdempotencyCacheForTests();

    const bearer = await signToken({ sub: 'writer', scope: 'readwrite' }, '1h');
    const api = buildApp();
    const body = { register: 'WChaMax', value: 1500 };

    await api
      .post('/api/modbus/write')
      .set('Authorization', `Bearer ${bearer}`)
      .set('X-Idempotency-Key', 'modbus-retry-1')
      .send(body)
      .expect(200);

    const replay = await api
      .post('/api/modbus/write')
      .set('Authorization', `Bearer ${bearer}`)
      .set('X-Idempotency-Key', 'modbus-retry-1')
      .send({ register: 'WChaMax', value: 9999 })
      .expect(200);

    expect(replay.body).toEqual({ ok: true, register: 'WChaMax', value: 1500 });
  });

  it('rejects a write with read-only scope (403)', async () => {
    const bearer = await signToken({ sub: 'reader', scope: 'read' }, '1h');
    await buildApp()
      .post('/api/modbus/write')
      .set('Authorization', `Bearer ${bearer}`)
      .send({ register: 'WChaMax', value: 2000 })
      .expect(403);
  });

  it('rejects a write when READ_ONLY_MODE is active (403)', async () => {
    const originalReadOnly = process.env.READ_ONLY_MODE;
    process.env.READ_ONLY_MODE = 'true';
    try {
      const bearer = await signToken({ sub: 'writer', scope: 'readwrite' }, '1h');
      const res = await buildApp()
        .post('/api/modbus/write')
        .set('Authorization', `Bearer ${bearer}`)
        .send({ register: 'WChaMax', value: 2000 })
        .expect(403);
      expect(res.body).toEqual({
        error: 'READ_ONLY_MODE=true blocks all hardware control commands',
        readOnly: true,
      });
    } finally {
      if (originalReadOnly === undefined) delete process.env.READ_ONLY_MODE;
      else process.env.READ_ONLY_MODE = originalReadOnly;
    }
  });

  it('rejects an unknown register with 400', async () => {
    const bearer = await signToken({ sub: 'writer', scope: 'readwrite' }, '1h');
    await buildApp()
      .post('/api/modbus/write')
      .set('Authorization', `Bearer ${bearer}`)
      .send({ register: 'EvilReg', value: 1 })
      .expect(400);
  });

  it('rejects an out-of-range value with 400', async () => {
    const bearer = await signToken({ sub: 'writer', scope: 'readwrite' }, '1h');
    await buildApp()
      .post('/api/modbus/write')
      .set('Authorization', `Bearer ${bearer}`)
      .send({ register: 'WMaxLimPct', value: 250 })
      .expect(400);
  });
});
