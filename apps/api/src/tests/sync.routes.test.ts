import express from 'express';
import supertest from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { clearIdempotencyCacheForTests } from '../data/idempotency-cache.js';
import { resetServerSettingsForTests } from '../data/settings-store.js';
import { resetSyncDiffForTests } from '../data/sync-diff-store.js';
import { resetSyncVersionForTests } from '../data/sync-version-store.js';

const SECRET = 'nexus-hems-ci-fixture-jwt-signing-key-not-a-real-credential';

describe('sync routes', () => {
  const prevEnv = { ...process.env };

  let createSyncRoutes: typeof import('../routes/sync.routes.js').createSyncRoutes;
  let signToken: typeof import('../jwt-utils.js').signToken;
  let applySettingsPatch: typeof import('../data/settings-store.js').applySettingsPatch;

  beforeAll(async () => {
    vi.resetModules();
    process.env.NODE_ENV = 'production';
    process.env.JWT_SECRET = SECRET;
    delete process.env.JWT_SECRET_NEW;

    resetSyncVersionForTests(42);
    createSyncRoutes = (await import('../routes/sync.routes.js')).createSyncRoutes;
    signToken = (await import('../jwt-utils.js')).signToken;
    applySettingsPatch = (await import('../data/settings-store.js')).applySettingsPatch;
  }, 60_000);

  afterEach(() => {
    resetServerSettingsForTests();
    resetSyncDiffForTests();
    resetSyncVersionForTests(42);
    clearIdempotencyCacheForTests();
  });

  afterAll(() => {
    process.env = { ...prevEnv };
    vi.resetModules();
  });

  function buildApp() {
    const app = express();
    app.use(express.json());
    app.use(createSyncRoutes());
    return supertest(app);
  }

  it('GET /api/sync/version rejects unauthenticated requests', async () => {
    await buildApp().get('/api/sync/version').expect(401);
  });

  it('GET /api/sync/version returns the current sync version for authenticated clients', async () => {
    const bearer = await signToken({ sub: 'reader', scope: 'read' }, '1h');
    const res = await buildApp()
      .get('/api/sync/version')
      .set('Authorization', `Bearer ${bearer}`)
      .expect(200);

    expect(typeof res.body.version).toBe('number');
  });

  it('GET /api/sync/diff returns changes since the given version', async () => {
    await applySettingsPatch({ animations: false });
    const since = 42;
    await applySettingsPatch({ victronIp: '10.0.0.9' });

    const bearer = await signToken({ sub: 'reader', scope: 'read' }, '1h');
    const res = await buildApp()
      .get('/api/sync/diff')
      .query({ since })
      .set('Authorization', `Bearer ${bearer}`)
      .expect(200);

    expect(res.body.changes.length).toBeGreaterThanOrEqual(2);
    expect(res.body.version).toBeGreaterThan(since);
  });

  it('PUT /api/settings requires readwrite scope', async () => {
    const readBearer = await signToken({ sub: 'reader', scope: 'read' }, '1h');
    await buildApp()
      .put('/api/settings')
      .set('Authorization', `Bearer ${readBearer}`)
      .send({ compactMode: true })
      .expect(403);
  });

  it('PUT /api/settings applies patch and returns version', async () => {
    const bearer = await signToken({ sub: 'writer', scope: 'readwrite' }, '1h');
    const res = await buildApp()
      .put('/api/settings')
      .set('Authorization', `Bearer ${bearer}`)
      .send({ glowEffects: false, updatedAt: 9000 })
      .expect(200);

    expect(res.body.ok).toBe(true);
    expect(res.body.applied).toContain('glowEffects');
    expect(typeof res.body.version).toBe('number');
  });

  it('PUT /api/settings rejects an empty patch', async () => {
    const bearer = await signToken({ sub: 'writer', scope: 'readwrite' }, '1h');
    await buildApp()
      .put('/api/settings')
      .set('Authorization', `Bearer ${bearer}`)
      .send({ updatedAt: 1 })
      .expect(400);
  });

  it('GET /api/sync/diff rejects invalid since values', async () => {
    const bearer = await signToken({ sub: 'reader', scope: 'read' }, '1h');
    await buildApp()
      .get('/api/sync/diff')
      .query({ since: 'not-a-number' })
      .set('Authorization', `Bearer ${bearer}`)
      .expect(400);
  });

  it('PUT /api/settings deduplicates via X-Idempotency-Key', async () => {
    const bearer = await signToken({ sub: 'writer', scope: 'readwrite' }, '1h');
    const agent = buildApp();
    const headers = {
      Authorization: `Bearer ${bearer}`,
      'X-Idempotency-Key': 'settings-put-dedupe',
    };

    const first = await agent
      .put('/api/settings')
      .set(headers)
      .send({ compactMode: true })
      .expect(200);
    const second = await agent
      .put('/api/settings')
      .set(headers)
      .send({ compactMode: true })
      .expect(200);

    expect(second.body).toEqual(first.body);
  });
});
