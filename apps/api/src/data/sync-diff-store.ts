/**
 * Versioned settings change log for offline reconciliation (slice 4, ADR-030).
 */

import {
  appendSyncDiffEntry,
  bumpSyncVersion,
  getSyncDiffSince,
  resetSyncPersistenceForTests,
} from '../services/sync-persistence.js';
import type { SettingsSyncCategory } from './settings-sync-keys.js';

export type { SyncDiffEntry } from '../services/sync-persistence.js';

/** Record a settings mutation and return the new server sync version. */
export async function recordSyncDiffEntry(
  key: string,
  value: unknown,
  category: SettingsSyncCategory,
  updatedAt = Date.now(),
): Promise<number> {
  const version = await bumpSyncVersion();
  await appendSyncDiffEntry({ key, value, updatedAt, category, version });
  return version;
}

export { getSyncDiffSince };

/** @internal Test helper — clears sync persistence state. */
export function resetSyncDiffForTests(): void {
  resetSyncPersistenceForTests();
}
