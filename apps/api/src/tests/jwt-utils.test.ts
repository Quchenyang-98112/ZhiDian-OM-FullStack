/**
 * jwt-utils.test.ts — Unit tests for JWT signing, verification, and revocation.
 *
 * Covers:
 * - signToken / verifyToken round-trip
 * - Token claims: sub, scope, jti, iss, aud, exp
 * - JTI revocation (in-memory fallback path — no Redis in unit tests)
 * - Scope clamping
 * - Expired token rejection
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

// Ensure unit tests use in-memory JTI store (no Redis connection)
process.env.NODE_ENV = 'test';
delete process.env.REDIS_URL;
process.env.JWT_SECRET = 'test-secret-for-unit-tests-that-is-long-enough-for-hs256-algo';

// Import AFTER env is set
const { signToken, verifyToken, revokeToken, JWT_ISSUER, JWT_AUDIENCE } = await import(
  '../jwt-utils.js'
);
const { clampScope, API_KEY_SCOPE_MAP } = await import('../middleware/auth.js');

// ─── signToken / verifyToken ─────────────────────────────────────────

describe('signToken + verifyToken', () => {
  it('signs and verifies a valid token', async () => {
    const token = await signToken({ sub: 'user1', scope: 'readwrite' }, '1h');
    const payload = await verifyToken(token);
    expect(payload.sub).toBe('user1');
    expect(payload.scope).toBe('readwrite');
  });

  it('sets iss and aud claims correctly', async () => {
    const token = await signToken({ sub: 'user2', scope: 'read' }, '1h');
    const payload = await verifyToken(token);
    expect(payload.iss).toBe(JWT_ISSUER);
    expect(payload.aud).toBe(JWT_AUDIENCE);
  });

  it('includes jti claim', async () => {
    const token = await signToken({ sub: 'user3', scope: 'admin' }, '1h');
    const payload = await verifyToken(token);
    expect(typeof payload.jti).toBe('string');
    expect(payload.jti!.length).toBeGreaterThan(0);
  });

  it('rejects a token with wrong signature', async () => {
    const token = await signToken({ sub: 'user4', scope: 'read' }, '1h');
    const tampered = `${token.slice(0, -4)}XXXX`;
    await expect(verifyToken(tampered)).rejects.toThrow();
  });

  it('rejects an expired token', async () => {
    // Sign with 1 second expiry and use a past timestamp trick
    // jose minimum is 1s — sign, then travel time or just check error type
    const token = await signToken({ sub: 'user5', scope: 'read' }, '1s');
    await new Promise((r) => setTimeout(r, 1100));
    await expect(verifyToken(token)).rejects.toThrow();
  });

  it('includes all standard claims', async () => {
    const token = await signToken({ sub: 'user6', scope: 'readwrite' }, '1h');
    const payload = await verifyToken(token);
    expect(payload.iat).toBeDefined();
    expect(payload.exp).toBeDefined();
    expect(payload.exp!).toBeGreaterThan(payload.iat!);
  });
});

// ─── JTI Revocation ─────────────────────────────────────────────────

describe('revokeToken', () => {
  it('rejects a revoked token', async () => {
    const token = await signToken({ sub: 'user-revoke', scope: 'read' }, '1h');
    const payload = await verifyToken(token);

    // Revoke the JTI
    await revokeToken(payload.jti!, payload.exp! * 1000);

    // Revoked tokens should fail verification
    await expect(verifyToken(token)).rejects.toThrow();
  });

  it('accepts a non-revoked token', async () => {
    const token = await signToken({ sub: 'user-ok', scope: 'readwrite' }, '1h');
    const payload = await verifyToken(token);
    // Not revoked — should succeed
    expect(payload.sub).toBe('user-ok');
  });
});

// ─── clampScope ─────────────────────────────────────────────────────

describe('clampScope', () => {
  // API_KEY_SCOPE_MAP is a module-level constant built at load time.
  // Populate it directly for test isolation.
  beforeEach(() => {
    API_KEY_SCOPE_MAP.set('readkey', 'read');
    API_KEY_SCOPE_MAP.set('rwkey', 'readwrite');
    API_KEY_SCOPE_MAP.set('adminkey', 'admin');
  });

  afterEach(() => {
    API_KEY_SCOPE_MAP.delete('readkey');
    API_KEY_SCOPE_MAP.delete('rwkey');
    API_KEY_SCOPE_MAP.delete('adminkey');
  });

  it('clamps admin request to readwrite for rwkey', () => {
    const clamped = clampScope('admin', 'rwkey');
    expect(clamped).toBe('readwrite');
  });

  it('allows exact scope for readwrite key', () => {
    const clamped = clampScope('readwrite', 'rwkey');
    expect(clamped).toBe('readwrite');
  });

  it('allows lower scope for any key', () => {
    const clamped = clampScope('read', 'adminkey');
    expect(clamped).toBe('read');
  });

  it('clamps admin request to read for readkey', () => {
    const clamped = clampScope('admin', 'readkey');
    expect(clamped).toBe('read');
  });

  it('defaults to readwrite when no scope mapping exists for key', () => {
    const clamped = clampScope('admin', 'unknownkey');
    expect(clamped).toBe('readwrite');
  });

  it('defaults to readwrite when no scope requested', () => {
    const clamped = clampScope(undefined, 'adminkey');
    expect(clamped).toBe('readwrite');
  });
});
