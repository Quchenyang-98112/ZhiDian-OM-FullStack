/**
 * Server settings store for offline sync (slice 4, ADR-030).
 */

import {
  getServerSettingsSnapshot,
  getSyncVersion,
  resetSyncPersistenceForTests,
  setServerSetting,
} from '../services/sync-persistence.js';
import { classifySettingsKey } from './settings-sync-keys.js';
import { recordSyncDiffEntry } from './sync-diff-store.js';

/** Snapshot of all known server settings keys. */
export async function getServerSettings(): Promise<Record<string, unknown>> {
  return getServerSettingsSnapshot();
}

/**
 * Merge a partial settings patch from a client replay or API write.
 * Returns the new sync version after recording per-key diffs.
 */
export async function applySettingsPatch(
  patch: Record<string, unknown>,
  clientUpdatedAt?: number,
): Promise<{ version: number; applied: string[] }> {
  const updatedAt = clientUpdatedAt ?? Date.now();
  const applied: string[] = [];

  for (const [key, value] of Object.entries(patch)) {
    await setServerSetting(key, value);
    await recordSyncDiffEntry(key, value, classifySettingsKey(key), updatedAt);
    applied.push(key);
  }

  return { version: await getSyncVersion(), applied };
}

/** @internal Test helper */
export function resetServerSettingsForTests(): void {
  resetSyncPersistenceForTests();
}
