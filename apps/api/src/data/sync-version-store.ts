/**
 * Monotonic sync version for offline reconciliation (slice 2, ADR-030).
 * Delegates to sync-persistence (Redis when REDIS_URL is set, in-memory otherwise).
 */

export {
  bumpSyncVersion,
  getSyncVersion,
  resetSyncPersistenceForTests as resetSyncVersionForTests,
} from '../services/sync-persistence.js';
