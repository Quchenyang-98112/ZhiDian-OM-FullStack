/**
 * OCPP WebSocket proxy — connection guards and relay delegation.
 */

import type { IncomingMessage } from 'http';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WebSocket } from 'ws';

const consume = vi.fn();
const attachOcppProxyRelay = vi.fn();

vi.mock('../services/ocpp-session-store.js', () => ({
  ocppSessionStore: { consume },
}));

vi.mock('../services/OcppProxyRelay.js', () => ({
  attachOcppProxyRelay,
}));

vi.mock('../middleware/auth.js', () => ({
  authenticateWS: vi.fn().mockResolvedValue({ clientId: 'test', scope: 'readwrite' }),
}));

vi.mock('../services/ws-ticket-store.js', () => ({
  wsTicketStore: {},
}));

const PEM_CERT = '-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----';
const PEM_KEY = '-----BEGIN PRIVATE KEY-----\nMIIE\n-----END PRIVATE KEY-----';

function mockReq(url: string): IncomingMessage {
  return { url, headers: { host: 'localhost:3000' } } as IncomingMessage;
}

function mockWs(): WebSocket & { closeCode?: number; closeReason?: string } {
  const ws = {
    closeCode: undefined,
    closeReason: undefined,
    close(code: number, reason: string) {
      this.closeCode = code;
      this.closeReason = reason;
    },
    // Real ws exposes once(); the per-IP limiter registers a 'close' listener.
    once() {
      return this;
    },
  };
  return ws as WebSocket & { closeCode?: number; closeReason?: string };
}

describe('handleOcppProxyConnection', () => {
  beforeEach(() => {
    consume.mockReset();
    attachOcppProxyRelay.mockReset();
  });

  it('requires readwrite scope when auth is enforced', async () => {
    const { authenticateWS } = await import('../middleware/auth.js');
    vi.mocked(authenticateWS).mockResolvedValueOnce({ clientId: 'reader', scope: 'read' });

    const { handleOcppProxyConnection } = await import('../ws/ocpp-proxy.ws.js');
    const ws = mockWs();
    await handleOcppProxyConnection(ws, mockReq('/ws/ocpp?session=abc'), true);

    expect(ws.closeCode).toBe(4003);
  });

  it('rejects missing session id', async () => {
    const { handleOcppProxyConnection } = await import('../ws/ocpp-proxy.ws.js');
    const ws = mockWs();
    await handleOcppProxyConnection(ws, mockReq('/ws/ocpp'), false);
    expect(ws.closeCode).toBe(4400);
  });

  it('rejects expired or unknown session', async () => {
    consume.mockResolvedValueOnce(null);
    const { handleOcppProxyConnection } = await import('../ws/ocpp-proxy.ws.js');
    const ws = mockWs();
    await handleOcppProxyConnection(ws, mockReq('/ws/ocpp?session=missing'), false);
    expect(ws.closeCode).toBe(4401);
  });

  it('rejects public host from session (SSRF guard)', async () => {
    consume.mockResolvedValueOnce({
      host: '8.8.8.8',
      port: 9000,
      stationId: 'CP1',
      clientCert: PEM_CERT,
      clientKey: PEM_KEY,
      clientId: 'test',
      expiresAt: Date.now() + 60_000,
    });
    const { handleOcppProxyConnection } = await import('../ws/ocpp-proxy.ws.js');
    const ws = mockWs();
    await handleOcppProxyConnection(ws, mockReq('/ws/ocpp?session=s1'), false);
    expect(ws.closeCode).toBe(4403);
  });

  it('rejects when READ_ONLY_MODE is active', async () => {
    const originalReadOnly = process.env.READ_ONLY_MODE;
    process.env.READ_ONLY_MODE = 'true';
    try {
      const { handleOcppProxyConnection } = await import('../ws/ocpp-proxy.ws.js');
      const ws = mockWs();
      await handleOcppProxyConnection(ws, mockReq('/ws/ocpp?session=s1'), false);
      expect(ws.closeCode).toBe(4403);
      expect(attachOcppProxyRelay).not.toHaveBeenCalled();
    } finally {
      if (originalReadOnly === undefined) delete process.env.READ_ONLY_MODE;
      else process.env.READ_ONLY_MODE = originalReadOnly;
    }
  });

  it('attaches relay for valid private session', async () => {
    consume.mockResolvedValueOnce({
      host: '192.168.1.50',
      port: 9000,
      stationId: 'CP1',
      clientCert: PEM_CERT,
      clientKey: PEM_KEY,
      clientId: 'test',
      expiresAt: Date.now() + 60_000,
    });
    attachOcppProxyRelay.mockResolvedValueOnce('ok');

    const { handleOcppProxyConnection } = await import('../ws/ocpp-proxy.ws.js');
    const ws = mockWs();
    await handleOcppProxyConnection(ws, mockReq('/ws/ocpp?session=s1'), false);

    expect(attachOcppProxyRelay).toHaveBeenCalled();
  });

  it('closes when relay fails', async () => {
    consume.mockResolvedValueOnce({
      host: '192.168.1.50',
      port: 9000,
      stationId: 'CP1',
      clientCert: PEM_CERT,
      clientKey: PEM_KEY,
      clientId: 'test',
      expiresAt: Date.now() + 60_000,
    });
    attachOcppProxyRelay.mockResolvedValueOnce('failed');

    const { handleOcppProxyConnection } = await import('../ws/ocpp-proxy.ws.js');
    const ws = mockWs();
    await handleOcppProxyConnection(ws, mockReq('/ws/ocpp?session=s1'), false);
    expect(ws.closeCode).toBe(1011);
  });
});
