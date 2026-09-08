/**
 * OCPP 2.1 WebSocket proxy — browser clients connect here; server holds mTLS to CSMS.
 *
 * Path: /ws/ocpp?ticket=<uuid>&session=<uuid>
 * Auth: single-use WS ticket (readwrite scope minimum) + single-use proxy session
 */

import type { IncomingMessage } from 'http';
import type { WebSocket } from 'ws';
import { isPrivateHost } from '../config/private-host.js';
import { type AuthenticatedClient, authenticateWS } from '../middleware/auth.js';
import { attachOcppProxyRelay } from '../services/OcppProxyRelay.js';
import { ocppSessionStore } from '../services/ocpp-session-store.js';
import { wsTicketStore } from '../services/ws-ticket-store.js';
import { rejectProxyIfReadOnly } from './proxy-readonly-guard.js';
import { getWSClientIP, releaseConnection, tryAcquireConnection } from './ws-conn-limit.js';

const SCOPE_ORDER = { read: 0, readwrite: 1, admin: 2 } as const;

function hasWriteScope(auth: AuthenticatedClient): boolean {
  return SCOPE_ORDER[auth.scope] >= SCOPE_ORDER.readwrite;
}

/** Returns true when the request targets the OCPP mTLS proxy WebSocket path. */
export function isOcppProxyPath(req: IncomingMessage): boolean {
  try {
    const url = new URL(req.url || '', `http://${req.headers.host || 'localhost'}`);
    return url.pathname === '/ws/ocpp' || url.pathname.endsWith('/ws/ocpp');
  } catch {
    return false;
  }
}

/** Handle a browser OCPP mTLS proxy WebSocket upgrade (`/ws/ocpp`). */
export async function handleOcppProxyConnection(
  clientWs: WebSocket,
  req: IncomingMessage,
  requireAuth: boolean,
): Promise<void> {
  // HIGH-06: proxy connections share the per-IP cap with the energy stream.
  const clientIP = getWSClientIP(req);
  if (!tryAcquireConnection(clientIP)) {
    clientWs.close(4429, 'Too many connections from this IP');
    return;
  }
  // Release the slot on any exit path (early rejection or relay teardown).
  clientWs.once('close', () => releaseConnection(clientIP));

  const authResult = await authenticateWS(req, wsTicketStore);
  if (requireAuth && (!authResult || !hasWriteScope(authResult))) {
    clientWs.close(4003, 'readwrite scope required');
    return;
  }

  if (rejectProxyIfReadOnly(clientWs)) return;

  const url = new URL(req.url || '', `http://${req.headers.host || 'localhost'}`);
  const sessionId = url.searchParams.get('session')?.trim();
  if (!sessionId) {
    clientWs.close(4400, 'session query parameter required');
    return;
  }

  const session = await ocppSessionStore.consume(sessionId);
  if (!session) {
    clientWs.close(4401, 'Invalid or expired OCPP proxy session');
    return;
  }

  if (!isPrivateHost(session.host)) {
    clientWs.close(4403, 'Host must be private/local network');
    return;
  }

  if (!Number.isInteger(session.port) || session.port < 1 || session.port > 65535) {
    clientWs.close(4400, 'Invalid port');
    return;
  }

  const result = await attachOcppProxyRelay(session, clientWs);
  if (result === 'failed') {
    clientWs.close(1011, 'OCPP mTLS relay failed');
  }
}
