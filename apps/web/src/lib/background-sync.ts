/**
 * Background Sync Service
 * Handles offline action queue synchronization
 * Features: exponential backoff, max retries, online/offline detection
 */

import { getAuthHeader, isAuthTokenValid } from './auth-token';
import {
  cleanupCompletedActions,
  getPendingActions,
  type OfflineAction,
  updateActionStatus,
} from './db';
import { detectSyncConflict, fetchServerSyncVersion, recordServerSyncVersion } from './sync-client';
import { markSyncConflict } from './sync-conflict';

const MAX_RETRIES = 5;
const BASE_RETRY_DELAY_MS = 2000;
/** Hardware control commands older than this are never replayed (offline-sync design §4.1). */
export const OFFLINE_HARDWARE_COMMAND_TTL_MS = 5 * 60 * 1000;

const HARDWARE_COMMAND_TYPES = new Set<OfflineAction['type']>([
  'ev-control',
  'hp-control',
  'battery-control',
]);

function isHardwareCommand(type: OfflineAction['type']): boolean {
  return HARDWARE_COMMAND_TYPES.has(type);
}

async function assertFetchOk(response: Response, context: string): Promise<void> {
  if (response.ok) return;
  const detail = await response.text().catch(() => '');
  const suffix = detail.length > 0 ? `: ${detail.slice(0, 200)}` : '';
  throw new Error(`${context} failed with HTTP ${response.status}${suffix}`);
}

function isCommandExpired(action: OfflineAction): boolean {
  return (
    isHardwareCommand(action.type) &&
    Date.now() - action.timestamp > OFFLINE_HARDWARE_COMMAND_TTL_MS
  );
}

function getActionRetryCount(action: OfflineAction): number {
  return action.retries;
}

type ActionProcessResult = 'completed' | 'skipped' | 'failed';

class BackgroundSyncService {
  private isSyncing = false;
  private syncGeneration = 0;
  private syncInterval: number | null = null;
  private retryTimeouts = new Map<number, ReturnType<typeof setTimeout>>();
  private onlineHandler: (() => void) | null = null;

  /**
   * Initialize background sync
   */
  init() {
    // Register service worker sync if available
    if ('serviceWorker' in navigator && 'sync' in ServiceWorkerRegistration.prototype) {
      navigator.serviceWorker.ready
        .then((registration) => {
          return registration.sync.register('sync-offline-actions');
        })
        .catch((error) => {
          if (import.meta.env.DEV)
            console.warn('[BackgroundSync] Service Worker sync not available:', error);
          this.startPeriodicSync();
        });
    } else {
      this.startPeriodicSync();
    }

    // Listen for online/offline events
    this.onlineHandler = () => {
      if (import.meta.env.DEV) console.log('[BackgroundSync] Network online, syncing...');
      void this.probeSyncConflict();
      this.syncPendingActions();
    };
    window.addEventListener('online', this.onlineHandler);

    // Cleanup old completed actions every hour
    setInterval(
      () => {
        cleanupCompletedActions().catch(console.error);
      },
      60 * 60 * 1000,
    );

    // Initial sync if online
    if (navigator.onLine) {
      void this.probeSyncConflict();
      this.syncPendingActions();
    }
  }

  /** Detect server-side version drift even when the offline queue is empty. */
  private async probeSyncConflict(): Promise<void> {
    if (!navigator.onLine || !isAuthTokenValid()) return;
    const hasConflict = await detectSyncConflict();
    if (hasConflict) {
      await markSyncConflict('settings');
    }
  }

  /**
   * Start periodic sync (fallback)
   */
  private startPeriodicSync() {
    this.syncInterval = window.setInterval(
      () => {
        if (navigator.onLine) {
          this.syncPendingActions();
        }
      },
      3 * 60 * 1000, // Every 3 minutes
    );
  }

  /**
   * Sync all pending actions with retry support.
   * @returns false when one or more actions failed in this pass.
   */
  async syncPendingActions(options?: { force?: boolean }): Promise<boolean> {
    if (this.isSyncing || !navigator.onLine) {
      return true;
    }

    const generation = this.syncGeneration;
    this.isSyncing = true;
    let batchHadFailure = false;
    let deferredDueToConflict = false;

    try {
      const actions = await getPendingActions();
      if (actions.length === 0) return true;

      if (!this.ensureAuthForReplay()) return false;

      if (import.meta.env.DEV) {
        console.log(`[BackgroundSync] Syncing ${actions.length} pending actions`);
      }

      for (const action of actions) {
        if (!options?.force && action.type === 'settings') {
          const hasConflict = await detectSyncConflict('settings');
          if (hasConflict) {
            await markSyncConflict('settings');
            deferredDueToConflict = true;
            continue;
          }
        }

        const result = await this.processPendingAction(action);
        if (result === 'failed') batchHadFailure = true;
      }

      if (!batchHadFailure && !deferredDueToConflict) {
        await this.recordLatestServerVersion(false);
      }

      return !batchHadFailure;
    } catch (error) {
      console.error('[BackgroundSync] Sync failed:', error);
      return false;
    } finally {
      if (generation === this.syncGeneration) {
        this.isSyncing = false;
      }
    }
  }

  private ensureAuthForReplay(): boolean {
    if (isAuthTokenValid()) return true;
    if (import.meta.env.DEV) {
      console.warn('[BackgroundSync] Auth token missing or expired — skipping replay');
    }
    return false;
  }

  private async recordLatestServerVersion(hasConflict: boolean): Promise<void> {
    const serverVersion = await fetchServerSyncVersion();
    if (serverVersion !== null) {
      await recordServerSyncVersion(serverVersion, 'settings', hasConflict);
    }
  }

  private async processPendingAction(action: OfflineAction): Promise<ActionProcessResult> {
    if (isCommandExpired(action)) {
      await updateActionStatus(action.id!, 'failed', 'Command expired (TTL exceeded)');
      return 'completed';
    }

    const retryCount = getActionRetryCount(action);
    if (retryCount >= MAX_RETRIES) {
      if (import.meta.env.DEV) {
        console.warn(`[BackgroundSync] Action ${action.id} exceeded max retries, marking failed`);
      }
      await updateActionStatus(action.id!, 'failed', 'Max retries exceeded');
      return 'completed';
    }

    try {
      await updateActionStatus(action.id!, 'syncing');
      await this.executeAction(action);
      await updateActionStatus(action.id!, 'completed');
      return 'completed';
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : 'Unknown error';
      console.error(
        '[BackgroundSync] Action',
        action.id,
        'failed (attempt',
        retryCount + 1,
        '):',
        errMsg,
      );

      const delay = BASE_RETRY_DELAY_MS * 2 ** retryCount + Math.floor(Math.random() * 1000);
      await updateActionStatus(action.id!, 'failed', errMsg);

      if (retryCount + 1 < MAX_RETRIES) {
        const timeout = setTimeout(() => {
          this.retryTimeouts.delete(action.id!);
          void this.syncPendingActions();
        }, delay);
        this.retryTimeouts.set(action.id!, timeout);
      }
      return 'failed';
    }
  }

  /**
   * Get sync status summary
   */
  async getSyncStatus(): Promise<{
    pendingCount: number;
    isSyncing: boolean;
    isOnline: boolean;
  }> {
    const actions = await getPendingActions();
    return {
      pendingCount: actions.length,
      isSyncing: this.isSyncing,
      isOnline: navigator.onLine,
    };
  }

  /**
   * Execute a specific action.
   * HIGH-05: All requests include Authorization header. Actions are rejected if
   * no auth token is available — never dispatch control commands unauthenticated.
   * X-Idempotency-Key is sent on every retry so the server can deduplicate
   * duplicate deliveries caused by network failures or background-sync retries.
   */
  private async executeAction(action: OfflineAction): Promise<void> {
    const baseUrl = import.meta.env.VITE_API_URL || window.location.origin;
    const authHeaders = getAuthHeader();

    if (!authHeaders) {
      throw new Error('No auth token available — cannot sync action. User must be authenticated.');
    }

    const idempotencyKey = (action as unknown as { idempotencyKey?: string }).idempotencyKey;
    const idempotencyHeader: Record<string, string> = idempotencyKey
      ? { 'X-Idempotency-Key': idempotencyKey }
      : {};

    const commonHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      ...authHeaders,
      ...idempotencyHeader,
    };

    switch (action.type) {
      case 'ev-control':
      case 'hp-control':
      case 'battery-control': {
        const response = await fetch(`${baseUrl}/api/commands/replay`, {
          method: 'POST',
          headers: commonHeaders,
          body: JSON.stringify({ type: action.type, payload: action.payload }),
        });
        await assertFetchOk(response, `Replay ${action.type}`);
        break;
      }

      case 'settings': {
        const response = await fetch(`${baseUrl}/api/settings`, {
          method: 'PUT',
          headers: commonHeaders,
          body: JSON.stringify(action.payload),
        });
        await assertFetchOk(response, 'Settings sync');
        break;
      }

      case 'ai-optimize': {
        const response = await fetch(`${baseUrl}/api/ai/optimize`, {
          method: 'POST',
          headers: commonHeaders,
          body: JSON.stringify(action.payload),
        });
        await assertFetchOk(response, 'AI optimize');
        break;
      }

      default:
        throw new Error(`Unknown action type: ${action.type}`);
    }
  }

  /**
   * Cleanup on destroy
   */
  destroy() {
    this.syncGeneration += 1;
    this.isSyncing = false;
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
    }
    // Clear all pending retry timeouts
    for (const timeout of this.retryTimeouts.values()) {
      clearTimeout(timeout);
    }
    this.retryTimeouts.clear();
    if (this.onlineHandler) {
      window.removeEventListener('online', this.onlineHandler);
    }
  }
}

export const backgroundSyncService = new BackgroundSyncService();
