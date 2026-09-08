/**
 * Unit tests for the requireNotReadOnly middleware.
 */

import express from 'express';
import supertest from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { requireNotReadOnly } from '../middleware/require-not-read-only.js';

describe('requireNotReadOnly middleware', () => {
  const prevEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.READ_ONLY_MODE;
  });

  afterEach(() => {
    process.env = { ...prevEnv };
  });

  function buildApp() {
    const app = express();
    app.use(express.json());
    app.post('/api/mutate', requireNotReadOnly, (_req, res) => {
      res.json({ ok: true });
    });
    return app;
  }

  it('allows requests when READ_ONLY_MODE is unset', async () => {
    const res = await supertest(buildApp()).post('/api/mutate').send({}).expect(200);
    expect(res.body.ok).toBe(true);
  });

  it('allows requests when READ_ONLY_MODE is false', async () => {
    process.env.READ_ONLY_MODE = 'false';
    const res = await supertest(buildApp()).post('/api/mutate').send({}).expect(200);
    expect(res.body.ok).toBe(true);
  });

  it('rejects requests when READ_ONLY_MODE is true', async () => {
    process.env.READ_ONLY_MODE = 'true';
    const res = await supertest(buildApp()).post('/api/mutate').send({}).expect(403);
    expect(res.body.error).toMatch(/READ_ONLY_MODE/i);
    expect(res.body.readOnly).toBe(true);
  });

  it('rejects requests when READ_ONLY_MODE has whitespace', async () => {
    process.env.READ_ONLY_MODE = '  true  ';
    const res = await supertest(buildApp()).post('/api/mutate').send({}).expect(403);
    expect(res.body.readOnly).toBe(true);
  });
});
