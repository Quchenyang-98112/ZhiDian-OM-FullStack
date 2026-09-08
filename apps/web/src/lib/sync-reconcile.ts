import { useAppStore } from '../store';
import type { StoredSettings } from '../types';
import { getApiBaseUrl, getAuthHeader } from './auth-token';
import { persistSettings } from './db';

export interface SyncDiffEntry {
  key: string;
  value: unknown;
  updatedAt: number;
  category: 'userPreferences' | 'deviceSettings';
  version: number;
}

export interface SyncDiffResponse {
  version: number;
  changes: SyncDiffEntry[];
}

/**
 * Fetch server-side settings changes since the given sync version.
 * Returns null when unauthenticated or the endpoint is unreachable.
 */
export async function fetchSyncDiff(
  since: number,
  signal?: AbortSignal,
): Promise<SyncDiffResponse | null> {
  const base = getApiBaseUrl();
  const headers = getAuthHeader();
  if (!base || !headers) return null;

  const sinceParam = Number.isFinite(since) ? since : 0;
  try {
    const res = await fetch(
      `${base}/api/sync/diff?since=${encodeURIComponent(String(sinceParam))}`,
      {
        signal: signal ?? null,
        headers: { Accept: 'application/json', ...headers },
      },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as SyncDiffResponse;
    if (typeof data.version !== 'number' || !Array.isArray(data.changes)) return null;
    return data;
  } catch {
    return null;
  }
}

function isStoredSettingsKey(key: string): key is keyof StoredSettings {
  return key in useAppStore.getState().settings;
}

/**
 * Apply server diff entries to the local Zustand store and IndexedDB settings row.
 * Used on server-wins conflict resolution — all returned keys overwrite local state.
 */
export async function applyServerSyncDiff(changes: SyncDiffEntry[]): Promise<void> {
  if (changes.length === 0) return;

  const patch: Partial<StoredSettings> = {};
  for (const change of changes) {
    if (!isStoredSettingsKey(change.key)) continue;
    (patch as Record<string, unknown>)[change.key] = change.value;
  }

  if (Object.keys(patch).length === 0) return;

  useAppStore.getState().updateSettings(patch);
  await persistSettings(useAppStore.getState().settings);
}

/**
 * Pull and apply server settings changes since the client's last known version.
 * Returns the latest server version when reconciliation succeeded.
 */
export async function reconcileServerSettings(since: number): Promise<number | null> {
  const diff = await fetchSyncDiff(since);
  if (!diff) return null;
  await applyServerSyncDiff(diff.changes);
  return diff.version;
}
