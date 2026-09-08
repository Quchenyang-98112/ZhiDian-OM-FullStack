import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const PEM_CERT = '-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----';
const PEM_KEY = '-----BEGIN PRIVATE KEY-----\nMIIE\n-----END PRIVATE KEY-----';

describe('ocpp-proxy client', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('createOcppProxySession returns session id on success', async () => {
    localStorage.setItem('nexus-hems-auth-token', 'jwt-token');
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ sessionId: 'sess-123' }), { status: 200 }),
    );

    const { createOcppProxySession } = await import('../lib/ocpp-proxy');
    const result = await createOcppProxySession({
      host: '192.168.1.1',
      port: 9000,
      stationId: 'CP1',
      clientCert: PEM_CERT,
      clientKey: PEM_KEY,
    });

    expect(result).toEqual({ ok: true, sessionId: 'sess-123' });
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/ocpp/proxy-session'),
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('createOcppProxySession returns no_auth without JWT', async () => {
    const { createOcppProxySession } = await import('../lib/ocpp-proxy');
    const result = await createOcppProxySession({
      host: '192.168.1.1',
      port: 9000,
      stationId: 'CP1',
      clientCert: PEM_CERT,
      clientKey: PEM_KEY,
    });
    expect(result).toEqual({ ok: false, error: 'no_auth' });
  });

  it('buildOcppProxyWebSocketUrl composes ticket and session params', async () => {
    localStorage.setItem('nexus-hems-auth-token', 'jwt-token');
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ ticket: 'ws-ticket-1' }), { status: 200 }),
    );

    const { buildOcppProxyWebSocketUrl } = await import('../lib/ocpp-proxy');
    const result = await buildOcppProxyWebSocketUrl('sess-abc');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.url).toContain('/ws/ocpp?');
      expect(result.url).toContain('ticket=ws-ticket-1');
      expect(result.url).toContain('session=sess-abc');
    }
  });
});
