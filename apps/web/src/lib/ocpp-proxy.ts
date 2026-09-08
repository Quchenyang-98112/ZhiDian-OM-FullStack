/**
 * OCPP Security Profile 3 browser proxy — credentials posted over HTTPS+JWT,
 * then relayed via `/ws/ocpp` with single-use WS ticket + session.
 */

import { fetchWsTicket, getApiBaseUrl, getAuthHeader } from './auth-token';

export type OcppProxySessionInput = {
  host: string;
  port: number;
  stationId: string;
  clientCert: string;
  clientKey: string;
  caCert?: string;
  revocationCheck?: 'off' | 'crl' | 'ocsp';
};

export type OcppProxySessionResult =
  | { ok: true; sessionId: string }
  | { ok: false; error: 'no_auth' | 'session_failed' | 'ticket_failed' | 'network' };

/** Exchange mTLS credentials for a short-lived server-side proxy session. */
export async function createOcppProxySession(
  input: OcppProxySessionInput,
): Promise<OcppProxySessionResult> {
  const base = getApiBaseUrl();
  const headers = getAuthHeader();
  if (!base || !headers) return { ok: false, error: 'no_auth' };

  try {
    const res = await fetch(`${base}/api/ocpp/proxy-session`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    if (!res.ok) return { ok: false, error: 'session_failed' };
    const data = (await res.json()) as { sessionId?: string };
    if (!data.sessionId) return { ok: false, error: 'session_failed' };
    return { ok: true, sessionId: data.sessionId };
  } catch {
    return { ok: false, error: 'network' };
  }
}

/** Build browser WebSocket URL for the OCPP mTLS API proxy. */
export async function buildOcppProxyWebSocketUrl(
  sessionId: string,
): Promise<{ ok: true; url: string } | { ok: false; error: 'ticket_failed' | 'no_window' }> {
  if (typeof window === 'undefined') return { ok: false, error: 'no_window' };

  const ticket = await fetchWsTicket();
  if (!ticket) return { ok: false, error: 'ticket_failed' };

  const wsProtocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
  const params = new URLSearchParams({ ticket, session: sessionId });
  const url = `${wsProtocol}://${window.location.host}/ws/ocpp?${params.toString()}`;
  return { ok: true, url };
}
