/**
 * EEBUS SHIP WebSocket proxy — browser clients connect here; server holds mTLS to device.
 *
 * Path: /ws/eebus?ticket=<uuid>&ski=<hex>&host=<hostname>&port=<4712>
 * Auth: single-use WS ticket (readwrite scope minimum)
 */

import type { IncomingMessage } from 'http';
import type { WebSocket } from 'ws';
import { isPrivateHost } from '../config/private-host.js';
import { type AuthenticatedClient, authenticateWS } from '../middleware/auth.js';
import { getDevice } from '../services/EEBusTrustStore.js';
import { attachClientRelay } from '../services/ShipHandshakeService.js';
import { wsTicketStore } from '../services/ws-ticket-store.js';
import { rejectProxyIfReadOnly } from './proxy-readonly-guard.js';
import { getWSClientIP, releaseConnection, tryAcquireConnection } from './ws-conn-limit.js';

const SCOPE_ORDER = { read: 0, readwrite: 1, admin: 2 } as const;

function hasWriteScope(auth: AuthenticatedClient): boolean {
  return SCOPE_ORDER[auth.scope] >= SCOPE_ORDER.readwrite;
}

/** Returns true when the request targets the EEBUS mTLS proxy WebSocket path. */
export function isEebusProxyPath(req: IncomingMessage): boolean {
  try {
    const url = new URL(req.url || '', `http://${req.headers.host || 'localhost'}`);
    return url.pathname === '/ws/eebus' || url.pathname.endsWith('/ws/eebus');
  } catch {
    return false;
  }
}

/** Handle a browser EEBUS SHIP mTLS proxy WebSocket upgrade (`/ws/eebus`). */
export async function handleEebusProxyConnection(
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
  const ski = url.searchParams.get('ski')?.trim();
  let host = url.searchParams.get('host')?.trim();
  const portParam = url.searchParams.get('port');
  const port = portParam ? Number(portParam) : 4712;

  if (!ski || ski.length < 4) {
    clientWs.close(4400, 'ski query parameter required');
    return;
  }

  if (!host) {
    const stored = await getDevice(ski);
    host = stored?.hostname;
  }

  if (!host) {
    clientWs.close(4404, 'Unknown device host — pair or provide host query param');
    return;
  }

  if (!isPrivateHost(host)) {
    clientWs.close(4403, 'Host must be private/local network');
    return;
  }

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    clientWs.close(4400, 'Invalid port');
    return;
  }

  const result = await attachClientRelay(ski, host, port, clientWs);
  if (result === 'pin_required') {
    clientWs.close(4401, 'PIN required — submit via POST /api/eebus/pair/pin');
    return;
  }
  if (result === 'failed') {
    clientWs.close(1011, 'SHIP relay failed');
  }
}
