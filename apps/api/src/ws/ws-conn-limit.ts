/**
 * Per-IP WebSocket connection limiting (HIGH-06 / HIGH-07).
 *
 * A single shared counter caps the total number of concurrent WebSocket
 * connections per source IP across ALL ws entry points — the energy stream and
 * the OCPP/EEBUS mTLS relay proxies. The proxy paths previously bypassed this
 * limit entirely; routing every path through this helper closes that gap while
 * keeping the accounting in one place.
 *
 * The per-*message* command rate limiter (`checkWsRateLimit`) is intentionally
 * NOT reused for proxies: relays forward opaque frames rather than issuing
 * validated commands, so a per-connection cap is the correct primitive there.
 */

import type { IncomingMessage } from 'node:http';

/** Shared across every ws entry point so one IP cannot fan out via multiple paths. */
const wsConnectionsPerIP = new Map<string, number>();

const DEFAULT_MAX_CONNECTIONS_PER_IP = 10;

/** Effective per-IP cap. Env-overridable; falls back to the safe default. */
export function getMaxConnectionsPerIP(): number {
  const raw = Number(process.env.WS_MAX_CONNECTIONS_PER_IP);
  return Number.isInteger(raw) && raw > 0 ? raw : DEFAULT_MAX_CONNECTIONS_PER_IP;
}

/** Resolve the client IP from the socket address (never trust x-forwarded-for). */
export function getWSClientIP(req: IncomingMessage): string {
  return req.socket?.remoteAddress ?? 'unknown';
}

/**
 * Try to reserve a connection slot for `ip`. Returns `true` and increments the
 * counter when under the cap; returns `false` (no increment) when at the cap.
 * Every successful acquire MUST be paired with a `releaseConnection(ip)`.
 */
export function tryAcquireConnection(ip: string): boolean {
  const current = wsConnectionsPerIP.get(ip) ?? 0;
  if (current >= getMaxConnectionsPerIP()) return false;
  wsConnectionsPerIP.set(ip, current + 1);
  return true;
}

/** Release a previously-acquired slot for `ip`, cleaning up empty entries. */
export function releaseConnection(ip: string): void {
  const remaining = (wsConnectionsPerIP.get(ip) ?? 1) - 1;
  if (remaining <= 0) wsConnectionsPerIP.delete(ip);
  else wsConnectionsPerIP.set(ip, remaining);
}

/** Test-only: reset all counters. */
export function _resetConnectionCounts(): void {
  wsConnectionsPerIP.clear();
}
