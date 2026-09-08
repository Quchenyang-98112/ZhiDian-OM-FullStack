/**
 * JWT persistence for production API calls (background sync, shares, EEBUS proxy).
 * Token is written after a successful POST /api/auth/token exchange.
 */

const AUTH_TOKEN_KEY = 'nexus-hems-auth-token';

/** Resolve API base URL — explicit env var or same-origin fallback (dev proxy). */
export function getApiBaseUrl(): string {
  const envUrl = import.meta.env.VITE_API_URL;
  if (envUrl) return envUrl;
  if (typeof window !== 'undefined') return window.location.origin;
  return '';
}

export function getAuthToken(): string | null {
  try {
    return localStorage.getItem(AUTH_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setAuthToken(token: string): void {
  try {
    localStorage.setItem(AUTH_TOKEN_KEY, token);
  } catch {
    /* private mode / quota */
  }
}

export function clearAuthToken(): void {
  try {
    localStorage.removeItem(AUTH_TOKEN_KEY);
  } catch {
    /* private mode */
  }
}

/**
 * Safely decode the scope claim from a JWT string without verifying the signature.
 * Returns null if the token is malformed or has no scope claim.
 */
export function getTokenScope(token: string | null | undefined): string | null {
  if (!token) return null;
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = parts[1];
    if (!payload) return null;
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const json = atob(
      normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), '='),
    );
    const parsed = JSON.parse(json) as Record<string, unknown>;
    const scope = parsed.scope;
    return typeof scope === 'string' ? scope : null;
  } catch {
    return null;
  }
}

export type TokenExchangeResult =
  | { ok: true; token: string; scope: string }
  | { ok: false; error: 'no_api_base' | 'invalid_credentials' | 'network' | 'invalid_response' };

/** Exchange API key for JWT and persist to localStorage. */
export async function exchangeApiKeyForJwt(
  clientId: string,
  apiKey: string,
  scope: 'read' | 'readwrite' | 'admin' = 'readwrite',
): Promise<TokenExchangeResult> {
  const base = getApiBaseUrl();
  if (!base) return { ok: false, error: 'no_api_base' };

  try {
    const res = await fetch(`${base}/api/auth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId, apiKey, scope }),
    });

    if (res.status === 401) return { ok: false, error: 'invalid_credentials' };
    if (!res.ok) return { ok: false, error: 'invalid_response' };

    const data = (await res.json()) as { token?: string; scope?: string };
    if (!data.token) return { ok: false, error: 'invalid_response' };

    setAuthToken(data.token);
    return { ok: true, token: data.token, scope: data.scope ?? scope };
  } catch {
    return { ok: false, error: 'network' };
  }
}

export function getAuthHeader(): Record<string, string> | null {
  const token = getAuthToken();
  return token ? { Authorization: `Bearer ${token}` } : null;
}

/**
 * Returns true when a stored JWT exists and its `exp` claim is still in the future.
 * Used by background sync to avoid replaying commands with an expired session.
 */
export function isAuthTokenValid(bufferMs = 30_000): boolean {
  const token = getAuthToken();
  if (!token) return false;
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return false;
    const payloadPart = parts[1];
    if (!payloadPart) return false;
    const normalized = payloadPart.replace(/-/g, '+').replace(/_/g, '/');
    const json = atob(
      normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), '='),
    );
    const parsed = JSON.parse(json) as { exp?: unknown };
    if (typeof parsed.exp !== 'number') return false;
    const expiresAtMs = parsed.exp * 1000;
    return expiresAtMs > Date.now() + bufferMs;
  } catch {
    return false;
  }
}

/** Obtain a single-use WebSocket ticket for `/ws`, `/ws/eebus`, or `/ws/ocpp` proxy connections. */
export async function fetchWsTicket(): Promise<string | null> {
  const base = getApiBaseUrl();
  const headers = getAuthHeader();
  if (!base || !headers) return null;

  try {
    const res = await fetch(`${base}/api/auth/ws-ticket`, { method: 'POST', headers });
    if (!res.ok) return null;
    const data = (await res.json()) as { ticket?: string };
    return data.ticket ?? null;
  } catch {
    return null;
  }
}
