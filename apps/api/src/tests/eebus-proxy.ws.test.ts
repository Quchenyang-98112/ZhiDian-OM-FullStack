/**
 * EEBUS SHIP WebSocket proxy — connection guards and relay delegation.
 */

import type { IncomingMessage } from 'http';
import { describe, expect, it, vi } from 'vitest';
import type { WebSocket } from 'ws';

const getDevice = vi.fn();
const attachClientRelay = vi.fn();

vi.mock('../services/EEBusTrustStore.js', () => ({
  getDevice,
}));

vi.mock('../services/ShipHandshakeService.js', () => ({
  attachClientRelay,
}));

vi.mock('../middleware/auth.js', () => ({
  authenticateWS: vi.fn().mockResolvedValue({ clientId: 'test', scope: 'readwrite' }),
}));

vi.mock('../services/ws-ticket-store.js', () => ({
  wsTicketStore: {},
}));

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

describe('handleEebusProxyConnection', () => {
  it('requires readwrite scope when auth is enforced', async () => {
    const { authenticateWS } = await import('../middleware/auth.js');
    vi.mocked(authenticateWS).mockResolvedValueOnce({ clientId: 'reader', scope: 'read' });

    const { handleEebusProxyConnection } = await import('../ws/eebus-proxy.ws.js');
    const ws = mockWs();
    await handleEebusProxyConnection(ws, mockReq('/ws/eebus?ski=abc&host=192.168.1.5'), true);

    expect(ws.closeCode).toBe(4003);
  });

  it('rejects missing SKI', async () => {
    const { handleEebusProxyConnection } = await import('../ws/eebus-proxy.ws.js');
    const ws = mockWs();
    await handleEebusProxyConnection(ws, mockReq('/ws/eebus?host=192.168.1.5'), false);
    expect(ws.closeCode).toBe(4400);
  });

  it('rejects public host (SSRF guard)', async () => {
    const { handleEebusProxyConnection } = await import('../ws/eebus-proxy.ws.js');
    const ws = mockWs();
    await handleEebusProxyConnection(
      ws,
      mockReq(`/ws/eebus?ski=${'a'.repeat(40)}&host=8.8.8.8`),
      false,
    );
    expect(ws.closeCode).toBe(4403);
  });

  it('rejects when READ_ONLY_MODE is active', async () => {
    const originalReadOnly = process.env.READ_ONLY_MODE;
    process.env.READ_ONLY_MODE = 'true';
    try {
      const { handleEebusProxyConnection } = await import('../ws/eebus-proxy.ws.js');
      const ws = mockWs();
      await handleEebusProxyConnection(
        ws,
        mockReq(`/ws/eebus?ski=${'a'.repeat(40)}&host=192.168.1.5`),
        false,
      );
      expect(ws.closeCode).toBe(4403);
      expect(attachClientRelay).not.toHaveBeenCalled();
    } finally {
      if (originalReadOnly === undefined) delete process.env.READ_ONLY_MODE;
      else process.env.READ_ONLY_MODE = originalReadOnly;
    }
  });

  it('resolves host from trust store and attaches relay', async () => {
    getDevice.mockResolvedValueOnce({
      ski: 'a'.repeat(40),
      hostname: '192.168.1.77',
      port: 4712,
      status: 'trusted',
      trustedAt: 1,
    });
    attachClientRelay.mockResolvedValueOnce('ok');

    const { handleEebusProxyConnection } = await import('../ws/eebus-proxy.ws.js');
    const ws = mockWs();
    await handleEebusProxyConnection(ws, mockReq(`/ws/eebus?ski=${'a'.repeat(40)}`), false);

    expect(getDevice).toHaveBeenCalled();
    expect(attachClientRelay).toHaveBeenCalledWith('a'.repeat(40), '192.168.1.77', 4712, ws);
  });

  it('rejects unknown host without trust entry', async () => {
    getDevice.mockResolvedValueOnce(null);
    const { handleEebusProxyConnection } = await import('../ws/eebus-proxy.ws.js');
    const ws = mockWs();
    await handleEebusProxyConnection(ws, mockReq(`/ws/eebus?ski=${'a'.repeat(40)}`), false);
    expect(ws.closeCode).toBe(4404);
  });

  it('rejects invalid port', async () => {
    const { handleEebusProxyConnection } = await import('../ws/eebus-proxy.ws.js');
    const ws = mockWs();
    await handleEebusProxyConnection(
      ws,
      mockReq(`/ws/eebus?ski=${'a'.repeat(40)}&host=192.168.1.1&port=70000`),
      false,
    );
    expect(ws.closeCode).toBe(4400);
  });

  it('signals PIN required from relay result', async () => {
    attachClientRelay.mockResolvedValueOnce('pin_required');
    const { handleEebusProxyConnection } = await import('../ws/eebus-proxy.ws.js');
    const ws = mockWs();
    await handleEebusProxyConnection(
      ws,
      mockReq(`/ws/eebus?ski=${'a'.repeat(40)}&host=192.168.1.88`),
      false,
    );
    expect(ws.closeCode).toBe(4401);
  });

  it('closes when relay fails', async () => {
    attachClientRelay.mockResolvedValueOnce('failed');
    const { handleEebusProxyConnection } = await import('../ws/eebus-proxy.ws.js');
    const ws = mockWs();
    await handleEebusProxyConnection(
      ws,
      mockReq(`/ws/eebus?ski=${'a'.repeat(40)}&host=192.168.1.99`),
      false,
    );
    expect(ws.closeCode).toBe(1011);
  });
});
