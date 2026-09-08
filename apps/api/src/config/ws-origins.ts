/**
 * Fail-fast validation for production WS_ORIGINS (CSP connect-src).
 * Mirrors the nginx docker-entrypoint allowlist; API Helmet consumes the same env.
 */

import { isDevRuntime } from './runtime-env.js';

const WS_ORIGIN_PATTERN = /^wss?:\/\/[a-zA-Z0-9][a-zA-Z0-9._\-[\]:]*(?::\d{1,5})?(?:\/[^\s]*)?$/;

export function parseWsOrigins(raw: string | undefined): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
}

export function isValidWsOrigin(origin: string): boolean {
  return WS_ORIGIN_PATTERN.test(origin);
}

/**
 * Normalize an origin (or WS_ORIGINS allowlist entry) to a scheme-family-aware
 * `scheme://host[:port]` string for comparison. A browser's WebSocket `Origin`
 * header carries the *page* origin (`https://app`), while WS_ORIGINS holds the
 * socket origin (`wss://app`); ws↔http and wss↔https are the same trust family,
 * so both collapse to http:/https:. Default ports (80/443) are dropped so
 * `wss://h:443` and `https://h` match. Returns null for unparseable input.
 */
function normalizeOrigin(value: string): string | null {
  try {
    const u = new URL(value.trim());
    const secure = u.protocol === 'wss:' || u.protocol === 'https:';
    const insecure = u.protocol === 'ws:' || u.protocol === 'http:';
    if (!secure && !insecure) return null;
    const scheme = secure ? 'https:' : 'http:';
    const defaultPort = secure ? '443' : '80';
    const port = u.port && u.port !== defaultPort ? `:${u.port}` : '';
    return `${scheme}//${u.hostname.toLowerCase()}${port}`;
  } catch {
    return null;
  }
}

/**
 * Whether a browser-supplied WebSocket `Origin` is in the allowlist (CSWSH,
 * CWE-346). Comparison is scheme-family-aware (see normalizeOrigin). An empty
 * or unparseable origin returns false — callers decide how to treat a *missing*
 * Origin header (non-browser clients), which is distinct from a present-but-
 * disallowed one.
 */
export function isAllowedWsOrigin(origin: string, allowlist: string[]): boolean {
  const normOrigin = normalizeOrigin(origin);
  if (!normOrigin) return false;
  return allowlist.some((entry) => normalizeOrigin(entry) === normOrigin);
}

/**
 * In production, reject malformed WS_ORIGINS before Helmet applies CSP.
 * Empty is allowed (no extra connect-src entries beyond defaults).
 */
export function validateWsOrigins(env: NodeJS.ProcessEnv = process.env): void {
  if (isDevRuntime(env)) return;

  for (const origin of parseWsOrigins(env.WS_ORIGINS)) {
    if (!isValidWsOrigin(origin)) {
      throw new Error(
        `[WS_ORIGINS] Invalid WebSocket origin "${origin}" — expected ws:// or wss:// with host [and optional port]`,
      );
    }
  }
}
