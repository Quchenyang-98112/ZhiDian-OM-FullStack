/**
 * HIGH-07 — Dual JWT secrets (JWT_SECRET + JWT_SECRET_NEW) without restart.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const SECRET_A = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'; // 40 chars
const SECRET_B = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'; // 40 chars

beforeEach(() => {
  process.env.NODE_ENV = 'test';
  delete process.env.REDIS_URL;
});

afterEach(() => {
  vi.resetModules();
  delete process.env.JWT_SECRET;
  delete process.env.JWT_SECRET_NEW;
  delete process.env.JWT_SECRET_NEW_FILE;
});

describe('reloadJwtKeysFromEnv dual-key', () => {
  it('verifies tokens signed with JWT_SECRET after JWT_SECRET_NEW becomes primary', async () => {
    process.env.JWT_SECRET = SECRET_A;
    delete process.env.JWT_SECRET_NEW;

    const jwt = await import('../jwt-utils.js');
    jwt.initKeys();
    const tokenBeforeRotate = await jwt.signToken({ sub: 'before', scope: 'readwrite' }, '1h');

    process.env.JWT_SECRET_NEW = SECRET_B;
    jwt.reloadJwtKeysFromEnv();

    const verifiedOld = await jwt.verifyToken(tokenBeforeRotate);
    expect(verifiedOld.sub).toBe('before');

    const tokenAfter = await jwt.signToken({ sub: 'after', scope: 'read' }, '1h');
    const verifiedNew = await jwt.verifyToken(tokenAfter);
    expect(verifiedNew.sub).toBe('after');
  });

  it('throws when JWT_SECRET_NEW is set without JWT_SECRET', async () => {
    process.env.NODE_ENV = 'production';
    delete process.env.JWT_SECRET;
    process.env.JWT_SECRET_NEW = SECRET_B;

    const jwt = await import('../jwt-utils.js');
    expect(() => jwt.reloadJwtKeysFromEnv()).toThrow(/JWT_SECRET/);
  });
});
