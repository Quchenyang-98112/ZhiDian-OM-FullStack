import {
  getPendingActions,
  getSyncState,
  nexusDb,
  type SyncState,
  updateActionStatus,
  updateSyncState,
} from './db';
import { fetchServerSyncVersion, recordServerSyncVersion } from './sync-client';
import { reconcileServerSettings } from './sync-reconcile';

/** Dispatched when a new sync conflict is persisted in Dexie `syncState`. */
export const SYNC_CONFLICT_EVENT = 'nexus-hems-sync-conflict';

export type SyncConflictResolution = 'local' | 'server';

/** Rows in `syncState` that still require user resolution. */
export async function getConflictedSyncStates(): Promise<SyncState[]> {
  const rows = await nexusDb.syncState.toArray();
  return rows.filter((row) => row.hasConflict);
}

export function dispatchSyncConflictEvent(domain: string): void {
  window.dispatchEvent(new CustomEvent(SYNC_CONFLICT_EVENT, { detail: { domain } }));
}

/** Mark a domain as conflicted and notify UI listeners (idempotent per domain). */
export async function markSyncConflict(domain = 'settings'): Promise<void> {
  const state = await getSyncState(domain);
  if (state.hasConflict) return;

  const remote = await fetchServerSyncVersion();
  const version = remote !== null ? String(remote) : state.serverVersion || '0';
  await updateSyncState(domain, version, true);
  dispatchSyncConflictEvent(domain);
}

async function discardPendingSettingsActions(): Promise<void> {
  const pending = await getPendingActions();
  for (const action of pending) {
    if (action.type === 'settings' && action.id !== undefined) {
      await updateActionStatus(action.id, 'failed', 'Discarded (server-wins conflict resolution)');
    }
  }
}

/**
 * Resolve a sync conflict after explicit user choice.
 * Server-wins discards queued settings mutations; local-wins replays then clears the flag.
 */
export async function resolveSyncConflict(
  domain: string,
  resolution: SyncConflictResolution,
): Promise<void> {
  if (resolution === 'server') {
    const state = await getSyncState(domain);
    const since = Number.parseInt(state.serverVersion, 10);
    const reconciledVersion = Number.isNaN(since) ? null : await reconcileServerSettings(since);

    if (reconciledVersion !== null) {
      await recordServerSyncVersion(reconciledVersion, domain, false);
    } else {
      const remote = await fetchServerSyncVersion();
      if (remote !== null) {
        await recordServerSyncVersion(remote, domain, false);
      } else {
        await updateSyncState(domain, state.serverVersion, false);
      }
    }
    await discardPendingSettingsActions();
    return;
  }

  const { backgroundSyncService } = await import('./background-sync');
  const replayOk = await backgroundSyncService.syncPendingActions({ force: true });
  if (!replayOk) {
    throw new Error('Local replay failed');
  }

  const remote = await fetchServerSyncVersion();
  if (remote !== null) {
    await recordServerSyncVersion(remote, domain, false);
  } else {
    const state = await getSyncState(domain);
    await updateSyncState(domain, state.serverVersion, false);
  }
}
