/**
 * EEBUS REST routes — pairing, trust store, revocation policy.
 */

import express, { type Express } from 'express';
import supertest from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { setEebusRevocationConfig } from '../config/eebus-revocation.js';

const SECRET = 'nexus-hems-ci-fixture-jwt-signing-key-not-a-real-credential';
const SKI = 'a'.repeat(40);

const listDevices = vi.fn();
const getDevice = vi.fn();
const removeDevice = vi.fn();
const upsertDevice = vi.fn();
const getHandshakeState = vi.fn();
const initiateHandshake = vi.fn();
const submitPin = vi.fn();
const terminateSession = vi.fn();

vi.mock('../services/EEBusTrustStore.js', () => ({
  listDevices,
  getDevice,
  removeDevice,
  upsertDevice,
}));

vi.mock('../services/ShipHandshakeService.js', () => ({
  getHandshakeState,
  initiateHandshake,
  submitPin,
  terminateSession,
}));

describe('EEBUS API routes', () => {
  const prevEnv = { ...process.env };

  let createEebusRoutes: typeof import('../routes/eebus.routes.js').createEebusRoutes;
  let signToken: typeof import('../jwt-utils.js').signToken;
  let app: Express;

  beforeAll(async () => {
    vi.resetModules();
    process.env.NODE_ENV = 'production';
    process.env.JWT_SECRET = SECRET;
    delete process.env.JWT_SECRET_NEW;

    createEebusRoutes = (await import('../routes/eebus.routes.js')).createEebusRoutes;
    signToken = (await import('../jwt-utils.js')).signToken;
  }, 60_000);

  afterAll(() => {
    process.env = { ...prevEnv };
    vi.resetModules();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    listDevices.mockResolvedValue([]);
    getDevice.mockResolvedValue(undefined);
    removeDevice.mockResolvedValue(false);
    upsertDevice.mockResolvedValue(undefined);
    getHandshakeState.mockReturnValue(undefined);
    initiateHandshake.mockResolvedValue(undefined);
    submitPin.mockReturnValue(false);
    terminateSession.mockReturnValue(undefined);

    app = express();
    app.use(express.json());
    app.use(createEebusRoutes());
  });

  afterEach(() => {
    setEebusRevocationConfig({ mode: 'off' });
  });

  function api() {
    return supertest(app);
  }

  async function adminToken() {
    return signToken({ sub: 'admin', scope: 'admin' }, '1h');
  }

  async function readToken() {
    return signToken({ sub: 'reader', scope: 'read' }, '1h');
  }

  it('rejects unauthenticated discover', async () => {
    await api().get('/api/eebus/discover').expect(401);
  });

  it('lists discovered devices with trusted flag', async () => {
    listDevices.mockResolvedValue([{ ski: SKI }]);
    const bearer = await readToken();

    await api()
      .post('/api/eebus/discover/register')
      .set('Authorization', `Bearer ${await adminToken()}`)
      .send({ ski: SKI, host: '192.168.1.50', brand: 'Viessmann' })
      .expect(201);

    const res = await api()
      .get('/api/eebus/discover')
      .set('Authorization', `Bearer ${bearer}`)
      .expect(200);

    expect(res.body).toHaveLength(1);
    expect(res.body[0].trusted).toBe(true);
    expect(res.body[0].host).toBe('192.168.1.50');
  });

  it('rejects pair without admin scope', async () => {
    const bearer = await readToken();
    await api()
      .post('/api/eebus/pair')
      .set('Authorization', `Bearer ${bearer}`)
      .send({ ski: SKI })
      .expect(403);
  });

  it('rejects pair with invalid body', async () => {
    const bearer = await adminToken();
    await api()
      .post('/api/eebus/pair')
      .set('Authorization', `Bearer ${bearer}`)
      .send({})
      .expect(400);
  });

  it('rejects pair for unknown SKI', async () => {
    const bearer = await adminToken();
    const res = await api()
      .post('/api/eebus/pair')
      .set('Authorization', `Bearer ${bearer}`)
      .send({ ski: SKI })
      .expect(404);
    expect(res.body.error).toMatch(/Unknown SKI/i);
  });

  it('rejects pair to public host (SSRF guard)', async () => {
    const bearer = await adminToken();
    await api()
      .post('/api/eebus/discover/register')
      .set('Authorization', `Bearer ${bearer}`)
      .send({ ski: SKI, host: '8.8.8.8' })
      .expect(201);

    const res = await api()
      .post('/api/eebus/pair')
      .set('Authorization', `Bearer ${bearer}`)
      .send({ ski: SKI })
      .expect(403);
    expect(res.body.error).toMatch(/private/i);
  });

  it('initiates pair for private host', async () => {
    const bearer = await adminToken();
    await api()
      .post('/api/eebus/discover/register')
      .set('Authorization', `Bearer ${bearer}`)
      .send({ ski: SKI, host: '192.168.1.55', port: 4712 })
      .expect(201);

    getHandshakeState.mockReturnValue({ state: 'tls_connecting', ski: SKI });

    const res = await api()
      .post('/api/eebus/pair')
      .set('Authorization', `Bearer ${bearer}`)
      .send({ ski: SKI })
      .expect(202);

    expect(initiateHandshake).toHaveBeenCalledWith(SKI, '192.168.1.55', 4712);
    expect(res.body.status).toBe('tls_connecting');
  });

  it('returns already connected when handshake is active', async () => {
    getHandshakeState.mockReturnValue({ state: 'connected', ski: SKI });
    const bearer = await adminToken();
    const res = await api()
      .post('/api/eebus/pair')
      .set('Authorization', `Bearer ${bearer}`)
      .send({ ski: SKI })
      .expect(200);
    expect(res.body.status).toBe('connected');
  });

  it('submits PIN when handshake awaits pin', async () => {
    submitPin.mockReturnValue(true);
    const bearer = await adminToken();
    const res = await api()
      .post('/api/eebus/pair/pin')
      .set('Authorization', `Bearer ${bearer}`)
      .send({ ski: SKI, pin: '12345' })
      .expect(202);
    expect(res.body.status).toBe('pin_submitted');
  });

  it('returns pair status from active handshake', async () => {
    getHandshakeState.mockReturnValue({
      state: 'pin_required',
      ski: SKI,
      message: 'Enter PIN',
      pinHint: '****',
    });
    const bearer = await readToken();
    const res = await api()
      .get(`/api/eebus/pair/status/${SKI}`)
      .set('Authorization', `Bearer ${bearer}`)
      .expect(200);
    expect(res.body.status).toBe('pin_required');
  });

  it('returns pair status from trust store when no session', async () => {
    getHandshakeState.mockReturnValue(undefined);
    getDevice.mockResolvedValue({
      ski: SKI,
      hostname: '192.168.1.50',
      port: 4712,
      status: 'trusted',
    });
    const bearer = await readToken();
    const res = await api()
      .get(`/api/eebus/pair/status/${SKI}`)
      .set('Authorization', `Bearer ${bearer}`)
      .expect(200);
    expect(res.body.status).toBe('connected');
  });

  it('lists trust store devices', async () => {
    listDevices.mockResolvedValue([
      {
        ski: SKI,
        hostname: '192.168.1.50',
        port: 4712,
        brand: 'Test',
        model: 'HP',
        deviceType: 'heatpump',
        status: 'trusted',
        trustedAt: 1,
        lastConnectedAt: 2,
      },
    ]);
    const bearer = await readToken();
    const res = await api()
      .get('/api/eebus/trust')
      .set('Authorization', `Bearer ${bearer}`)
      .expect(200);
    expect(res.body[0].ski).toBe(SKI);
  });

  it('removes device from trust store', async () => {
    removeDevice.mockResolvedValue(true);
    const bearer = await adminToken();
    await api()
      .delete(`/api/eebus/trust/${SKI}`)
      .set('Authorization', `Bearer ${bearer}`)
      .expect(204);
    expect(terminateSession).toHaveBeenCalledWith(SKI);
  });

  it('reads and updates TLS revocation config', async () => {
    const bearer = await adminToken();
    const getRes = await api()
      .get('/api/eebus/tls/revocation')
      .set('Authorization', `Bearer ${bearer}`)
      .expect(200);
    expect(getRes.body.mode).toBe('off');

    const putRes = await api()
      .put('/api/eebus/tls/revocation')
      .set('Authorization', `Bearer ${bearer}`)
      .send({ mode: 'crl', crlUrl: 'https://example.test/crl.pem' })
      .expect(200);
    expect(putRes.body.mode).toBe('crl');
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

    it('blocks pair', async () => {
      const bearer = await adminToken();
      const res = await api()
        .post('/api/eebus/pair')
        .set('Authorization', `Bearer ${bearer}`)
        .send({ ski: SKI })
        .expect(403);
      expect(res.body.error).toMatch(/READ_ONLY_MODE/i);
    });

    it('blocks pair/pin', async () => {
      const bearer = await adminToken();
      const res = await api()
        .post('/api/eebus/pair/pin')
        .set('Authorization', `Bearer ${bearer}`)
        .send({ ski: SKI, pin: '12345' })
        .expect(403);
      expect(res.body.error).toMatch(/READ_ONLY_MODE/i);
    });

    it('blocks discover/register', async () => {
      const bearer = await adminToken();
      const res = await api()
        .post('/api/eebus/discover/register')
        .set('Authorization', `Bearer ${bearer}`)
        .send({ ski: SKI, host: '192.168.1.50' })
        .expect(403);
      expect(res.body.error).toMatch(/READ_ONLY_MODE/i);
    });

    it('blocks trust removal', async () => {
      const bearer = await adminToken();
      const res = await api()
        .delete(`/api/eebus/trust/${SKI}`)
        .set('Authorization', `Bearer ${bearer}`)
        .expect(403);
      expect(res.body.error).toMatch(/READ_ONLY_MODE/i);
    });

    it('blocks TLS revocation update', async () => {
      const bearer = await adminToken();
      const res = await api()
        .put('/api/eebus/tls/revocation')
        .set('Authorization', `Bearer ${bearer}`)
        .send({ mode: 'crl', crlUrl: 'https://example.test/crl.pem' })
        .expect(403);
      expect(res.body.error).toMatch(/READ_ONLY_MODE/i);
    });
  });

  it('rejects discover/register with an invalid body', async () => {
    const bearer = await adminToken();
    const res = await api()
      .post('/api/eebus/discover/register')
      .set('Authorization', `Bearer ${bearer}`)
      .send({ ski: 'short', host: '192.168.1.50', port: 80_000 })
      .expect(400);
    expect(res.body.errors).toBeInstanceOf(Array);
  });
});
