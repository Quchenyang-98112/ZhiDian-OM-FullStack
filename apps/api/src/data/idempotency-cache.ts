/**
 * Idempotency cache for hardware command replay deduplication (slice 1, ADR-030).
 * TTL: 5 minutes — matches docs/Offline-Sync-Design.md §3.2.
 */

export type { IdempotencyRecord } from '../services/sync-persistence.js';
export {
  getIdempotencyRecord,
  isWsIdempotencyReplay,
  markWsIdempotencyAccepted,
  resetSyncPersistenceForTests as clearIdempotencyCacheForTests,
  resetSyncPersistenceForTests as clearWsIdempotencyCacheForTests,
  setIdempotencyRecord,
} from '../services/sync-persistence.js';
