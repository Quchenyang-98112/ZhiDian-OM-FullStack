import { getApiBaseUrl, getAuthHeader } from './auth-token';
import { getSyncState, updateSyncState } from './db';

/**
 * Fetch the server's current sync version (`GET /api/sync/version`).
 * Returns null when unauthenticated or the endpoint is unreachable.
 */
export async function fetchServerSyncVersion(signal?: AbortSignal): Promise<number | null> {
  const base = getApiBaseUrl();
  const headers = getAuthHeader();
  if (!base || !headers) return null;

  try {
    const res = await fetch(`${base}/api/sync/version`, {
      signal: signal ?? null,
      headers: { Accept: 'application/json', ...headers },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { version?: unknown };
    return typeof data.version === 'number' ? data.version : null;
  } catch {
    return null;
  }
}

/**
 * Returns true when the server reports a newer sync version than the client last saw.
 * Uses the `settings` domain row in Dexie `syncState`.
 */
export async function detectSyncConflict(domain = 'settings'): Promise<boolean> {
  const remoteVersion = await fetchServerSyncVersion();
  if (remoteVersion === null) return false;

  const state = await getSyncState(domain);
  const localVersion = Number.parseInt(state.serverVersion, 10);
  if (!state.serverVersion || Number.isNaN(localVersion)) {
    // First contact: baseline the client without raising a user-visible conflict.
    await recordServerSyncVersion(remoteVersion, domain, false);
    return false;
  }
  return remoteVersion > localVersion;
}

/** Persist the last server sync version after a successful reconciliation pass. */
export async function recordServerSyncVersion(
  version: number,
  domain = 'settings',
  hasConflict = false,
): Promise<void> {
  await updateSyncState(domain, String(version), hasConflict);
}
