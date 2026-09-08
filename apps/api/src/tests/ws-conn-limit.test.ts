/**
 * ws-conn-limit.test.ts — HIGH-06: per-IP WebSocket connection cap shared across
 * the energy stream and the OCPP/EEBUS relay proxies.
 *
 * Verifies (a) the primitive's acquire/release/env-override behavior and (b) that
 * the OCPP proxy handler rejects the (N+1)th connection from one IP with 4429
 * while under-cap connections are NOT rejected for that reason.
 */

import type { IncomingMessage } from 'node:http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WebSocket } from 'ws';

// Deterministic auth: the OCPP handler should pass the scope gate and then fall
// through to the (missing) session check, so the only 4429 close is the cap.
vi.mock('../middleware/auth.js', () => ({
  authenticateWS: vi.fn(async () => ({
    clientId: 'test',
    scope: 'readwrite',
    authenticated: true,
    connectedAt: Date.now(),
  })),
}));

const {
  tryAcquireConnection,
  releaseConnection,
  getMaxConnectionsPerIP,
  getWSClientIP,
  _resetConnectionCounts,
} = await import('../ws/ws-conn-limit.js');
const { handleOcppProxyConnection } = await import('../ws/ocpp-proxy.ws.js');

function fakeWs(): { ws: WebSocket; close: ReturnType<typeof vi.fn> } {
  const close = vi.fn();
  const ws = { close, once: vi.fn(), on: vi.fn(), readyState: 1 } as unknown as WebSocket;
  return { ws, close };
}

function fakeReq(ip: string): IncomingMessage {
  return {
    url: '/ws/ocpp',
    headers: { host: 'localhost' },
    socket: { remoteAddress: ip },
  } as unknown as IncomingMessage;
}

describe('ws-conn-limit primitive', () => {
  beforeEach(() => {
    _resetConnectionCounts();
    delete process.env.WS_MAX_CONNECTIONS_PER_IP;
  });

  it('defaults the cap to 10 and honors a valid env override', () => {
    expect(getMaxConnectionsPerIP()).toBe(10);
    process.env.WS_MAX_CONNECTIONS_PER_IP = '3';
    expect(getMaxConnectionsPerIP()).toBe(3);
    process.env.WS_MAX_CONNECTIONS_PER_IP = 'garbage';
    expect(getMaxConnectionsPerIP()).toBe(10);
  });

  it('acquires up to the cap then rejects, and release frees a slot', () => {
    process.env.WS_MAX_CONNECTIONS_PER_IP = '2';
    expect(tryAcquireConnection('9.9.9.9')).toBe(true);
    expect(tryAcquireConnection('9.9.9.9')).toBe(true);
    expect(tryAcquireConnection('9.9.9.9')).toBe(false); // at cap
    releaseConnection('9.9.9.9');
    expect(tryAcquireConnection('9.9.9.9')).toBe(true); // slot freed
  });

  it('tracks IPs independently', () => {
    process.env.WS_MAX_CONNECTIONS_PER_IP = '1';
    expect(tryAcquireConnection('1.1.1.1')).toBe(true);
    expect(tryAcquireConnection('1.1.1.1')).toBe(false);
    expect(tryAcquireConnection('2.2.2.2')).toBe(true); // different IP unaffected
  });

  it('resolves client IP from the socket address', () => {
    expect(getWSClientIP(fakeReq('4.3.2.1'))).toBe('4.3.2.1');
  });
});

describe('OCPP proxy handler honors the per-IP cap (HIGH-06)', () => {
  beforeEach(() => {
    _resetConnectionCounts();
    process.env.WS_MAX_CONNECTIONS_PER_IP = '3';
  });

  afterEach(() => {
    delete process.env.WS_MAX_CONNECTIONS_PER_IP;
    vi.clearAllMocks();
  });

  it('rejects the (N+1)th connection from one IP with 4429; under-cap are not', async () => {
    const ip = '5.5.5.5';
    const underCap: ReturnType<typeof fakeWs>[] = [];

    // Fill the cap (3). These fall through to the missing-session check (4400),
    // never releasing because the fake ws does not emit 'close'.
    for (let i = 0; i < 3; i++) {
      const c = fakeWs();
      underCap.push(c);
      await handleOcppProxyConnection(c.ws, fakeReq(ip), true);
    }
    for (const c of underCap) {
      const codes = c.close.mock.calls.map((call) => call[0]);
      expect(codes).not.toContain(4429);
      expect(codes).toContain(4400); // rejected for missing session, not the cap
    }

    // The 4th connection from the same IP is rejected by the cap.
    const overCap = fakeWs();
    await handleOcppProxyConnection(overCap.ws, fakeReq(ip), true);
    expect(overCap.close).toHaveBeenCalledWith(4429, expect.stringMatching(/too many/i));

    // A different IP is still accepted (falls through to 4400, not 4429).
    const otherIp = fakeWs();
    await handleOcppProxyConnection(otherIp.ws, fakeReq('6.6.6.6'), true);
    const otherCodes = otherIp.close.mock.calls.map((call) => call[0]);
    expect(otherCodes).not.toContain(4429);
  });
});
