/**
 * Exec routes — JWT scope gates + whitelist validation.
 */

import express from 'express';
import supertest from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const SECRET = 'nexus-hems-ci-fixture-jwt-signing-key-not-a-real-credential';

describe('Exec API routes', () => {
  const prevEnv = { ...process.env };

  let createExecRoutes: typeof import('../routes/exec.routes.js').createExecRoutes;
  let signToken: typeof import('../jwt-utils.js').signToken;
  let invalidateExecConfigCache: typeof import('../services/ExecService.js').invalidateExecConfigCache;

  beforeAll(async () => {
    vi.resetModules();
    process.env.NODE_ENV = 'production';
    process.env.JWT_SECRET = SECRET;
    delete process.env.JWT_SECRET_NEW;
    process.env.EXEC_SCRIPTS_CONFIG = JSON.stringify({
      scripts: {
        read_meter: {
          command: 'node',
          commandArgs: [
            '-e',
            "console.log(JSON.stringify({readings:[{metric:'POWER_W',value:900,role:'pv'}]}))",
          ],
          allowedArgs: ['--device'],
          timeoutMs: 2000,
        },
      },
    });

    createExecRoutes = (await import('../routes/exec.routes.js')).createExecRoutes;
    signToken = (await import('../jwt-utils.js')).signToken;
    invalidateExecConfigCache = (await import('../services/ExecService.js'))
      .invalidateExecConfigCache;
    invalidateExecConfigCache();
  }, 60_000);

  afterAll(() => {
    process.env = { ...prevEnv };
    vi.resetModules();
  });

  function buildApp() {
    const app = express();
    app.use(express.json());
    app.use(createExecRoutes());
    return supertest(app);
  }

  it('rejects unauthenticated script list', async () => {
    await buildApp().get('/api/exec/scripts').expect(401);
  });

  it('lists whitelisted script IDs for read scope', async () => {
    const bearer = await signToken({ sub: 'reader', scope: 'read' }, '1h');
    const res = await buildApp()
      .get('/api/exec/scripts')
      .set('Authorization', `Bearer ${bearer}`)
      .expect(200);
    expect(res.body.scripts.map((s: { id: string }) => s.id)).toContain('read_meter');
  });

  it('runs a whitelisted poll script', async () => {
    const bearer = await signToken({ sub: 'reader', scope: 'read' }, '1h');
    const res = await buildApp()
      .get('/api/exec/run?scriptId=read_meter')
      .set('Authorization', `Bearer ${bearer}`)
      .expect(200);
    expect(res.body.readings[0].value).toBe(900);
  });

  it('rejects unknown scriptId with 403', async () => {
    const bearer = await signToken({ sub: 'reader', scope: 'read' }, '1h');
    await buildApp()
      .get('/api/exec/run?scriptId=evil_script')
      .set('Authorization', `Bearer ${bearer}`)
      .expect(403);
  });

  it('rejects command POST without readwrite scope', async () => {
    const bearer = await signToken({ sub: 'reader', scope: 'read' }, '1h');
    await buildApp()
      .post('/api/exec/command')
      .set('Authorization', `Bearer ${bearer}`)
      .send({ scriptId: 'read_meter', commandType: 'SET_RELAY', value: 1 })
      .expect(403);
  });

  describe('READ_ONLY_MODE blocks command POST', () => {
    let originalReadOnly: string | undefined;

    beforeEach(() => {
      originalReadOnly = process.env.READ_ONLY_MODE;
      process.env.READ_ONLY_MODE = 'true';
    });

    afterEach(() => {
      if (originalReadOnly === undefined) delete process.env.READ_ONLY_MODE;
      else process.env.READ_ONLY_MODE = originalReadOnly;
    });

    it('blocks command POST in read-only mode', async () => {
      const bearer = await signToken({ sub: 'admin', scope: 'readwrite' }, '1h');
      const res = await buildApp()
        .post('/api/exec/command')
        .set('Authorization', `Bearer ${bearer}`)
        .send({ scriptId: 'read_meter', commandType: 'SET_RELAY', value: 1 })
        .expect(403);
      expect(res.body.error).toMatch(/READ_ONLY_MODE/i);
    });
  });
});
