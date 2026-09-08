import Dexie, { type Table, type Transaction } from 'dexie';
import type { CommandAuditEntry } from '../core/command-safety';
import type { EnergyData, StoredSettings } from '../types';
import type { ShareLink } from './auth/auth-provider';
import type { EncryptedAdapterCredential } from './secure-store';

// ─── Downsampling types ──────────────────────────────────────────────

export type AggregateResolution = '15m' | '1h';
export type HistoryRange = '24h' | '7d' | '30d' | '90d';

/** One averaged bucket written by the downsampling engine. */
export interface EnergyAggregate {
  id?: number | undefined;
  resolution: AggregateResolution;
  /** Start of the time bucket (ms since epoch). */
  bucketTs: number;
  sampleCount: number;
  pvPower: number;
  batteryPower: number;
  gridPower: number;
  houseLoad: number;
  batterySoC: number;
  heatPumpPower: number;
  evPower: number;
  gridVoltage: number;
  batteryVoltage: number;
  pvYieldToday: number;
  priceCurrent: number;
}

/** Unified shape returned by getHistory() regardless of resolution. */
export interface HistoryEntry {
  ts: number;
  resolution: 'raw' | AggregateResolution;
  pvPower: number;
  batteryPower: number;
  gridPower: number;
  houseLoad: number;
  batterySoC: number;
  heatPumpPower: number;
  evPower: number;
  gridVoltage: number;
  batteryVoltage: number;
  pvYieldToday: number;
  priceCurrent: number;
}

export interface EnergySnapshot extends EnergyData {
  id?: number;
  timestamp: number;
  /** Schema version that created this record (for forward-compat checks) */
  _schemaVersion?: number;
}

export interface SankeySnapshot {
  id?: number;
  timestamp: number;
  data: EnergyData;
  flows: Array<{ source: string; target: string; value: number }>;
}

export interface OfflineAction {
  id?: number | undefined;
  type: 'ev-control' | 'hp-control' | 'battery-control' | 'settings' | 'ai-optimize';
  payload: Record<string, unknown>;
  timestamp: number;
  retries: number;
  status: 'pending' | 'syncing' | 'failed' | 'completed';
  error?: string | undefined;
  /**
   * Idempotency key for safe replay of offline actions.
   * Included as X-Idempotency-Key header on every retry so the server can
   * deduplicate duplicate deliveries caused by network failures.
   * Format: `<type>-<timestamp>-<random6hex>`
   */
  idempotencyKey?: string | undefined;
}

/**
 * Sync state record — one row per domain (e.g. 'settings', 'preferences').
 * Tracks the last server-acknowledged version so the client can detect
 * conflicts and drive incremental reconciliation.
 */
export interface SyncState {
  /** Domain key, e.g. 'settings' | 'preferences' | 'adapters' | 'schedules' */
  key: string;
  /** ISO-8601 timestamp of the last successful server sync */
  lastSyncedAt: number;
  /** Server-assigned version/ETag at time of last sync (for conflict detection) */
  serverVersion: string;
  /** Client-local revision counter incremented on every pending mutation */
  localRevision: number;
  /** Whether a conflict was detected and requires user resolution */
  hasConflict: boolean;
  updatedAt: number;
}

export interface CacheMetadata {
  key: string;
  url: string;
  timestamp: number;
  expiresAt: number;
  size: number;
  type: 'api' | 'image' | 'static';
}

export interface ErrorLog {
  id?: number | undefined;
  timestamp: number;
  message: string;
  stack?: string | undefined;
  componentStack?: string | undefined;
  userAgent: string;
  url: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

export interface SettingsRecord {
  key: string;
  value: StoredSettings;
}

export interface AIKeyRecord {
  provider: string;
  encryptedKey: string;
  model: string;
  baseUrl: string;
  createdAt: number;
  lastUsed: number;
}

export interface AIForecastRecord {
  id?: number;
  metric: string;
  model: string;
  createdAt: number;
  horizonHours: number;
  accuracy: { mae: number; mape: number; rmse: number; r2: number };
  points: Array<{ timestamp: number; value: number; lower: number; upper: number }>;
  persistedToInflux: boolean;
}

/** Current schema version constant — bump when adding a new Dexie version */
export const DB_CURRENT_VERSION = 14;

/**
 * EEBUS SHIP trusted device record — stored in IndexedDB after successful PIN pairing.
 * Keyed by SKI (Subject Key Identifier) hex string.
 */
export interface EEBUSDeviceRecord {
  /** Subject Key Identifier (hex, no colons) — primary key */
  ski: string;
  hostname: string;
  port: number;
  /** Peer TLS certificate PEM (for display / manual verification) */
  certPem?: string;
  /** Unix ms — when trust was first established via PIN */
  trustedAt: number;
  /** Unix ms — last successful SPINE message exchange */
  lastConnectedAt?: number;
  /** Pairing status */
  status: 'trusted' | 'pending' | 'failed';
  brand?: string;
  model?: string;
  deviceType?: string;
}

/**
 * UI-managed EEBUS certificate metadata (no PEM) — IndexedDB via Dexie.
 * PEM material stays session-only in React state (never written to storage).
 */
export interface EEBUSLocalCertificateRow {
  id?: number;
  deviceName: string;
  fingerprint: string;
  validUntil: number;
  createdAt: number;
  status: 'trusted' | 'revoked' | 'expired';
}

/**
 * Revoked JWT token record — client-side cache of server-revoked tokens.
 * Supplements in-memory server revocation with an IndexedDB backup that
 * survives page refreshes (browser-side guard).
 */
export interface RevokedJTI {
  jti: string;
  /** Token expiry (ms since epoch) — record auto-expires at this time */
  expiresAt: number;
  revokedAt: number;
}

/** Shared store definitions (DRY — single source of truth for the latest schema) */
const LATEST_STORES = {
  energySnapshots: '++id, timestamp',
  sankeySnapshots: '++id, timestamp',
  offlineActions: '++id, timestamp, status, type',
  cacheMetadata: 'key, timestamp, expiresAt, type',
  errorLogs: '++id, timestamp, severity',
  settings: 'key',
  aiKeys: 'provider',
  commandAudit: '++id, timestamp, commandType, status',
  adapterCredentials: 'adapterId',
  shareLinks: 'id, token, expiresAt, active',
  aiForecastHistory: '++id, metric, createdAt, model',
  energyAggregates: '++id, [resolution+bucketTs]',
  revokedJTIs: 'jti, expiresAt',
  syncState: '&key, updatedAt, serverVersion',
  eebusDevices: '&ski, status, trustedAt',
  eebusLocalCertificates: '++id, fingerprint, status, createdAt',
} as const;

const LEGACY_EEBUS_CERT_LS_KEY = 'nexus:eebus-certs';

function readLegacyEebusCertLocalStorage(): string | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    return localStorage.getItem(LEGACY_EEBUS_CERT_LS_KEY);
  } catch {
    return null;
  }
}

function parseLegacyEebusCertJson(raw: string): unknown[] | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function legacyItemToEebusRow(item: unknown): Omit<EEBUSLocalCertificateRow, 'id'> | null {
  if (!item || typeof item !== 'object') return null;
  const o = item as Record<string, unknown>;
  const statusRaw = o.status;
  const status: EEBUSLocalCertificateRow['status'] =
    statusRaw === 'revoked' || statusRaw === 'expired' ? statusRaw : 'trusted';
  return {
    deviceName: String(o.deviceName ?? ''),
    fingerprint: String(o.fingerprint ?? ''),
    validUntil: Number(o.validUntil ?? 0),
    createdAt: Number(o.createdAt ?? Date.now()),
    status,
  };
}

async function migrateLegacyEebusLocalStorageV14(tx: Transaction): Promise<void> {
  const raw = readLegacyEebusCertLocalStorage();
  if (!raw) return;
  const parsed = parseLegacyEebusCertJson(raw);
  if (!parsed) return;
  const table = tx.table('eebusLocalCertificates');
  for (const item of parsed) {
    const row = legacyItemToEebusRow(item);
    if (row) await table.add(row);
  }
  try {
    localStorage.removeItem(LEGACY_EEBUS_CERT_LS_KEY);
  } catch {
    /* ignore */
  }
}

export class NexusDatabase extends Dexie {
  energySnapshots!: Table<EnergySnapshot, number>;
  sankeySnapshots!: Table<SankeySnapshot, number>;
  offlineActions!: Table<OfflineAction, number>;
  cacheMetadata!: Table<CacheMetadata, string>;
  errorLogs!: Table<ErrorLog, number>;
  settings!: Table<SettingsRecord, string>;
  aiKeys!: Table<AIKeyRecord, string>;
  commandAudit!: Table<CommandAuditEntry, number>;
  adapterCredentials!: Table<EncryptedAdapterCredential, string>;
  shareLinks!: Table<ShareLink, string>;
  aiForecastHistory!: Table<AIForecastRecord, number>;
  energyAggregates!: Table<EnergyAggregate, number>;
  revokedJTIs!: Table<RevokedJTI, string>;
  syncState!: Table<SyncState, string>;
  eebusDevices!: Table<EEBUSDeviceRecord, string>;
  eebusLocalCertificates!: Table<EEBUSLocalCertificateRow, number>;

  constructor(dbName = 'nexus-hems-dash') {
    super(dbName);

    // ── Version 1: Original schema ──────────────────────────────────
    this.version(1).stores({
      energySnapshots: '++id, timestamp',
      settings: 'key',
    });

    // ── Version 2: Add advanced PWA features ────────────────────────
    this.version(2)
      .stores({
        energySnapshots: '++id, timestamp',
        sankeySnapshots: '++id, timestamp',
        offlineActions: '++id, timestamp, status, type',
        cacheMetadata: 'key, timestamp, expiresAt, type',
        errorLogs: '++id, timestamp, severity',
        settings: 'key',
      })
      .upgrade((tx) => {
        // Backfill _schemaVersion on existing snapshots
        return tx
          .table('energySnapshots')
          .toCollection()
          .modify((snap: EnergySnapshot) => {
            snap._schemaVersion ??= 1;
          });
      });

    // ── Version 3: Add encrypted AI key storage (BYOK) ─────────────
    this.version(3)
      .stores({
        energySnapshots: '++id, timestamp',
        sankeySnapshots: '++id, timestamp',
        offlineActions: '++id, timestamp, status, type',
        cacheMetadata: 'key, timestamp, expiresAt, type',
        errorLogs: '++id, timestamp, severity',
        settings: 'key',
        aiKeys: 'provider',
      })
      .upgrade((tx) => {
        return tx
          .table('energySnapshots')
          .toCollection()
          .modify((snap: EnergySnapshot) => {
            snap._schemaVersion = 3;
          });
      });

    // ── Version 4: Add command audit trail for safety logging ───────
    this.version(4)
      .stores({
        energySnapshots: '++id, timestamp',
        sankeySnapshots: '++id, timestamp',
        offlineActions: '++id, timestamp, status, type',
        cacheMetadata: 'key, timestamp, expiresAt, type',
        errorLogs: '++id, timestamp, severity',
        settings: 'key',
        aiKeys: 'provider',
        commandAudit: '++id, timestamp, commandType, status',
      })
      .upgrade((tx) => {
        return tx
          .table('energySnapshots')
          .toCollection()
          .modify((snap: EnergySnapshot) => {
            snap._schemaVersion = 4;
          });
      });

    // ── Version 5: Add encrypted adapter credential vault ──────────
    this.version(5)
      .stores({
        energySnapshots: '++id, timestamp',
        sankeySnapshots: '++id, timestamp',
        offlineActions: '++id, timestamp, status, type',
        cacheMetadata: 'key, timestamp, expiresAt, type',
        errorLogs: '++id, timestamp, severity',
        settings: 'key',
        aiKeys: 'provider',
        commandAudit: '++id, timestamp, commandType, status',
        adapterCredentials: 'adapterId',
      })
      .upgrade((tx) => {
        return tx
          .table('energySnapshots')
          .toCollection()
          .modify((snap: EnergySnapshot) => {
            snap._schemaVersion = 5;
          });
      });

    // ── Version 6: Add share links for time-limited QR sharing ─────
    this.version(6)
      .stores({
        energySnapshots: '++id, timestamp',
        sankeySnapshots: '++id, timestamp',
        offlineActions: '++id, timestamp, status, type',
        cacheMetadata: 'key, timestamp, expiresAt, type',
        errorLogs: '++id, timestamp, severity',
        settings: 'key',
        aiKeys: 'provider',
        commandAudit: '++id, timestamp, commandType, status',
        adapterCredentials: 'adapterId',
        shareLinks: 'id, token, expiresAt, active',
      })
      .upgrade((tx) => {
        return tx
          .table('energySnapshots')
          .toCollection()
          .modify((snap: EnergySnapshot) => {
            snap._schemaVersion = 6;
          });
      });

    // ── Version 7: Extended history retention (50k snapshots) ───────
    this.version(7)
      .stores({
        energySnapshots: '++id, timestamp',
        sankeySnapshots: '++id, timestamp',
        offlineActions: '++id, timestamp, status, type',
        cacheMetadata: 'key, timestamp, expiresAt, type',
        errorLogs: '++id, timestamp, severity',
        settings: 'key',
        aiKeys: 'provider',
        commandAudit: '++id, timestamp, commandType, status',
        adapterCredentials: 'adapterId',
        shareLinks: 'id, token, expiresAt, active',
      })
      .upgrade((tx) => {
        return tx
          .table('energySnapshots')
          .toCollection()
          .modify((snap: EnergySnapshot) => {
            snap._schemaVersion = 7;
          });
      });

    // ── Version 8: Migration-safe upgrade with data validation ──────
    // Ensures all existing records have required fields with safe defaults
    this.version(8)
      .stores(LATEST_STORES)
      .upgrade(async (tx) => {
        // Backfill energy snapshots with safe defaults for any missing fields
        await tx
          .table('energySnapshots')
          .toCollection()
          .modify((snap: Record<string, unknown>) => {
            snap._schemaVersion = 8;
            // Ensure all EnergyData fields exist with safe defaults
            snap.gridPower ??= 0;
            snap.pvPower ??= 0;
            snap.batteryPower ??= 0;
            snap.houseLoad ??= 0;
            snap.batterySoC ??= 0;
            snap.heatPumpPower ??= 0;
            snap.evPower ??= 0;
            snap.gridVoltage ??= 230;
            snap.batteryVoltage ??= 48;
            snap.pvYieldToday ??= 0;
            snap.priceCurrent ??= 0;
            snap.timestamp ??= Date.now();
          });

        // Ensure offline actions have valid status
        await tx
          .table('offlineActions')
          .toCollection()
          .modify((action: Record<string, unknown>) => {
            const validStatuses = ['pending', 'syncing', 'failed', 'completed'];
            if (!validStatuses.includes(action.status as string)) {
              action.status = 'failed';
            }
            action.retries ??= 0;
          });
      });

    // ── Version 9: AI forecast history table for persistence ────────
    this.version(9)
      .stores(LATEST_STORES)
      .upgrade(async (tx) => {
        await tx
          .table('energySnapshots')
          .toCollection()
          .modify((snap: Record<string, unknown>) => {
            snap._schemaVersion = 9;
          });
      });

    // ── Version 10: Downsampling — energyAggregates with compound index ──
    // Compound index [resolution+bucketTs] enables efficient time-range
    // queries per resolution tier (15m / 1h) without full-table scans.
    // No data migration needed: energyAggregates starts empty; existing
    // energySnapshots are unchanged so _schemaVersion stays at 9.
    this.version(10).stores(LATEST_STORES);

    // ── Version 11: revokedJTIs — client-side JWT revocation cache ──
    // Browser-side cache of server-revoked JTIs. The server remains the
    // authoritative revocation authority; this table is a best-effort
    // additional guard against stale cached tokens in the SPA.
    // No migration needed: revokedJTIs starts empty.
    this.version(11).stores(LATEST_STORES);

    // ── Version 12: syncState + idempotencyKey for offline-sync ────
    // Adds the syncState table for conflict-detection and reconciliation
    // (lastSyncedAt, serverVersion, localRevision, hasConflict).
    // Adds idempotencyKey to offlineActions for safe retry deduplication.
    // No data migration needed: syncState starts empty, idempotencyKey is
    // optional so all existing offlineActions remain valid.
    this.version(12)
      .stores(LATEST_STORES)
      .upgrade(async (tx) => {
        // Back-fill idempotency keys on any existing pending offline actions
        // so they can be safely retried after the upgrade.
        await tx
          .table('offlineActions')
          .toCollection()
          .modify((action: Record<string, unknown>) => {
            if (!action.idempotencyKey) {
              const ts = typeof action.timestamp === 'number' ? action.timestamp : Date.now();
              const rand = Math.floor(Math.random() * 0xffffff)
                .toString(16)
                .padStart(6, '0');
              action.idempotencyKey = `${String(action.type)}-${ts}-${rand}`;
            }
          });
      });

    // ── Version 13: eebusDevices — EEBUS SHIP trusted device store ─
    // Adds the eebusDevices table keyed by SKI (Subject Key Identifier).
    // Replaces the localStorage fallback in CertificateManagement.tsx.
    // No migration of existing data: eebusDevices starts empty; the
    // localStorage entries are not auto-migrated (users re-pair devices).
    this.version(13).stores(LATEST_STORES);

    // ── Version 14: eebusLocalCertificates — UI cert metadata (no PEM) ─
    // Moves CertificateManagement metadata off localStorage into IndexedDB
    // to satisfy CodeQL clear-text sensitive storage heuristics; PEM stays
    // in memory only. One-time migration from legacy localStorage key.
    this.version(14).stores(LATEST_STORES).upgrade(migrateLegacyEebusLocalStorageV14);
  }
}

export const nexusDb = new NexusDatabase();

/** Load UI EEBUS certificate metadata (PEM never stored here). */
export async function loadEebusLocalCertificateRows(): Promise<EEBUSLocalCertificateRow[]> {
  return nexusDb.eebusLocalCertificates.orderBy('id').toArray();
}

/** Replace all UI EEBUS certificate metadata rows (ignores any `pemData` fields). */
export async function persistEebusLocalCertificateRows(
  rows: Array<EEBUSLocalCertificateRow & { pemData?: string }>,
): Promise<void> {
  const withoutPem: EEBUSLocalCertificateRow[] = rows.map(({ pemData: _p, ...rest }) => rest);
  await nexusDb.transaction('rw', nexusDb.eebusLocalCertificates, async () => {
    await nexusDb.eebusLocalCertificates.clear();
    if (withoutPem.length > 0) {
      await nexusDb.eebusLocalCertificates.bulkPut(withoutPem);
    }
  });
}

/**
 * Persist energy snapshot with automatic cleanup
 */
export async function persistSnapshot(snapshot: EnergyData) {
  await nexusDb.energySnapshots.add({ ...snapshot, timestamp: Date.now() });

  // Extended retention: 50 000 snapshots ≈ 30 days at 1 snapshot/min
  const MAX_SNAPSHOTS = 50_000;
  const count = await nexusDb.energySnapshots.count();
  if (count > MAX_SNAPSHOTS) {
    const oldest = await nexusDb.energySnapshots
      .orderBy('timestamp')
      .limit(count - MAX_SNAPSHOTS)
      .primaryKeys();
    await nexusDb.energySnapshots.bulkDelete(oldest);
  }
}

/**
 * Get the most recent persisted energy snapshot (used by OfflineBanner)
 */
export async function getLatestEnergySnapshot(): Promise<{
  data: EnergyData;
  timestamp: number;
  ageMinutes: number;
} | null> {
  try {
    const latest = await nexusDb.energySnapshots.orderBy('timestamp').reverse().first();
    if (!latest) return null;
    return {
      data: latest,
      timestamp: latest.timestamp,
      ageMinutes: Math.floor((Date.now() - latest.timestamp) / 1000 / 60),
    };
  } catch {
    return null;
  }
}

/**
 * Persist Sankey visualization snapshot
 */
export async function persistSankeySnapshot(
  data: EnergyData,
  flows: Array<{ source: string; target: string; value: number }>,
) {
  await nexusDb.sankeySnapshots.add({
    timestamp: Date.now(),
    data,
    flows,
  });

  const count = await nexusDb.sankeySnapshots.count();
  if (count > 100) {
    const oldest = await nexusDb.sankeySnapshots
      .orderBy('timestamp')
      .limit(count - 100)
      .primaryKeys();
    await nexusDb.sankeySnapshots.bulkDelete(oldest);
  }
}

/**
 * Queue offline action for later sync.
 * Generates a stable idempotency key so the server can deduplicate retries.
 */
export async function queueOfflineAction(
  type: OfflineAction['type'],
  payload: Record<string, unknown>,
): Promise<number> {
  const ts = Date.now();
  const rand = Math.floor(Math.random() * 0xffffff)
    .toString(16)
    .padStart(6, '0');
  const id = await nexusDb.offlineActions.add({
    type,
    payload,
    timestamp: ts,
    retries: 0,
    status: 'pending',
    idempotencyKey: `${type}-${ts}-${rand}`,
  });
  return id as number;
}

/**
 * Get or create a SyncState record for the given domain key.
 */
export async function getSyncState(key: string): Promise<SyncState> {
  const existing = await nexusDb.syncState.get(key);
  if (existing) return existing;
  const initial: SyncState = {
    key,
    lastSyncedAt: 0,
    serverVersion: '',
    localRevision: 0,
    hasConflict: false,
    updatedAt: Date.now(),
  };
  await nexusDb.syncState.put(initial);
  return initial;
}

/**
 * Update SyncState after a successful server sync.
 */
export async function updateSyncState(
  key: string,
  serverVersion: string,
  hasConflict = false,
): Promise<void> {
  const now = Date.now();
  await nexusDb.syncState.put({
    key,
    lastSyncedAt: now,
    serverVersion,
    localRevision: 0,
    hasConflict,
    updatedAt: now,
  });
}

/**
 * Get pending offline actions
 */
export async function getPendingActions(): Promise<OfflineAction[]> {
  return nexusDb.offlineActions
    .where('status')
    .equals('pending')
    .or('status')
    .equals('failed')
    .and((action) => action.retries < 3)
    .toArray();
}

/**
 * Update offline action status
 */
export async function updateActionStatus(
  id: number,
  status: OfflineAction['status'],
  error?: string,
) {
  const action = await nexusDb.offlineActions.get(id);
  if (action) {
    await nexusDb.offlineActions.update(id, {
      status,
      error,
      retries: status === 'failed' ? action.retries + 1 : action.retries,
    });
  }
}

/**
 * Clear completed actions older than 7 days
 */
export async function cleanupCompletedActions() {
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  await nexusDb.offlineActions
    .where('status')
    .equals('completed')
    .and((action) => action.timestamp < sevenDaysAgo)
    .delete();
}

/**
 * Store cache metadata for monitoring
 */
export async function storeCacheMetadata(
  key: string,
  url: string,
  size: number,
  type: CacheMetadata['type'],
  ttl: number = 24 * 60 * 60 * 1000, // 24 hours default
) {
  await nexusDb.cacheMetadata.put({
    key,
    url,
    timestamp: Date.now(),
    expiresAt: Date.now() + ttl,
    size,
    type,
  });
}

/**
 * Get cache statistics
 */
export async function getCacheStats() {
  const metadata = await nexusDb.cacheMetadata.toArray();
  const now = Date.now();

  const totalSize = metadata.reduce((sum, item) => sum + item.size, 0);
  const expired = metadata.filter((item) => item.expiresAt < now).length;
  const byType = metadata.reduce<Partial<Record<string, number>>>((acc, item) => {
    acc[item.type] = (acc[item.type] ?? 0) + 1;
    return acc;
  }, {});

  return {
    totalSize,
    totalEntries: metadata.length,
    expired,
    byType,
  };
}

/**
 * Clean expired cache entries
 */
export async function cleanExpiredCache() {
  const now = Date.now();
  await nexusDb.cacheMetadata.where('expiresAt').below(now).delete();
}

/**
 * Log error for diagnostics.
 * LOW-03: Enforces max 100 entries AND a 7-day TTL to prevent unbounded growth.
 */
export async function logError(
  error: Error,
  componentStack?: string,
  severity: ErrorLog['severity'] = 'medium',
) {
  await nexusDb.errorLogs.add({
    timestamp: Date.now(),
    message: error.message,
    stack: error.stack,
    componentStack,
    userAgent: navigator.userAgent,
    url: window.location.href,
    severity,
  });

  // Enforce 100-entry cap
  const count = await nexusDb.errorLogs.count();
  if (count > 100) {
    const oldest = await nexusDb.errorLogs
      .orderBy('timestamp')
      .limit(count - 100)
      .primaryKeys();
    await nexusDb.errorLogs.bulkDelete(oldest);
  }

  // LOW-03: Enforce 7-day TTL — delete entries older than 7 days
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const expired = await nexusDb.errorLogs.where('timestamp').below(sevenDaysAgo).primaryKeys();
  if (expired.length > 0) {
    await nexusDb.errorLogs.bulkDelete(expired);
  }
}

/**
 * Get recent errors for diagnostics
 */
export async function getRecentErrors(limit: number = 20): Promise<ErrorLog[]> {
  return nexusDb.errorLogs.orderBy('timestamp').reverse().limit(limit).toArray();
}

/**
 * Persist settings
 */
export async function persistSettings(settings: StoredSettings) {
  await nexusDb.settings.put({ key: 'ui-settings', value: settings });
}

/**
 * Get database size estimate
 */
export async function getDatabaseSize(): Promise<number> {
  if ('estimate' in navigator.storage) {
    const estimate = await navigator.storage.estimate();
    return estimate.usage || 0;
  }
  return 0;
}

export async function getLocalStorageStats(): Promise<{ usageMb: number; snapshots: number }> {
  const [usageBytes, snapshots] = await Promise.all([
    getDatabaseSize(),
    nexusDb.energySnapshots.count(),
  ]);
  return {
    usageMb: usageBytes / (1024 * 1024),
    snapshots,
  };
}

/**
 * Clear all database data (for reset)
 */
export async function clearAllData() {
  await Promise.all([
    nexusDb.energySnapshots.clear(),
    nexusDb.sankeySnapshots.clear(),
    nexusDb.offlineActions.clear(),
    nexusDb.cacheMetadata.clear(),
    nexusDb.errorLogs.clear(),
    nexusDb.shareLinks.clear(),
    nexusDb.eebusLocalCertificates.clear(),
  ]);
}

// ─── Share Link Persistence ─────────────────────────────────────────

/**
 * Save a share link to IndexedDB (for offline-first providers like Keycloak)
 */
export async function persistShareLink(link: ShareLink): Promise<void> {
  await nexusDb.shareLinks.put(link);
}

/**
 * Get all active, non-expired share links
 */
export async function getActiveShareLinks(): Promise<ShareLink[]> {
  const now = Date.now();
  return nexusDb.shareLinks
    .where('active')
    .equals(1) // Dexie boolean indexing
    .and((link) => link.expiresAt > now)
    .toArray();
}

/**
 * Validate a share token against the local DB
 */
export async function validateLocalShareToken(
  token: string,
): Promise<{ valid: boolean; permissions?: 'view' | 'control'; expiresAt?: number }> {
  const link = await nexusDb.shareLinks.where('token').equals(token).first();
  if (!link?.active) return { valid: false };
  if (link.expiresAt < Date.now()) return { valid: false };
  if (link.maxUses > 0 && link.useCount >= link.maxUses) return { valid: false };

  // Increment use count
  await nexusDb.shareLinks.update(link.id, { useCount: link.useCount + 1 });

  return { valid: true, permissions: link.permissions, expiresAt: link.expiresAt };
}

/**
 * Revoke a share link by ID
 */
export async function revokeLocalShareLink(linkId: string): Promise<void> {
  await nexusDb.shareLinks.update(linkId, { active: false });
}

/**
 * Clean expired share links
 */
export async function cleanExpiredShareLinks(): Promise<void> {
  const now = Date.now();
  await nexusDb.shareLinks.where('expiresAt').below(now).delete();
}

// ─── Migration Health & Backup ──────────────────────────────────────

export interface MigrationHealthResult {
  ok: boolean;
  currentVersion: number;
  expectedVersion: number;
  tableCounts: Record<string, number>;
  errors: string[];
}

/**
 * Verify all tables exist and are accessible after a migration.
 * Call this at app startup to detect migration corruption early.
 */
export async function checkMigrationHealth(
  db: NexusDatabase = nexusDb,
): Promise<MigrationHealthResult> {
  const errors: string[] = [];
  const tableCounts: Record<string, number> = {};
  const expectedTables = Object.keys(LATEST_STORES);

  for (const tableName of expectedTables) {
    try {
      const table = db.table(tableName);
      tableCounts[tableName] = await table.count();
    } catch (e) {
      errors.push(
        `Table "${tableName}" inaccessible: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  const currentVersion = db.verno;
  return {
    ok: errors.length === 0 && currentVersion === DB_CURRENT_VERSION,
    currentVersion,
    expectedVersion: DB_CURRENT_VERSION,
    tableCounts,
    errors,
  };
}

export interface DatabaseBackup {
  version: number;
  timestamp: number;
  tables: Record<string, unknown[]>;
}

/**
 * Export all database tables as a JSON-serialisable object.
 * Useful for pre-migration backup or diagnostics.
 */
export async function exportDatabaseBackup(db: NexusDatabase = nexusDb): Promise<DatabaseBackup> {
  const tables: Record<string, unknown[]> = {};
  for (const tableName of Object.keys(LATEST_STORES)) {
    try {
      tables[tableName] = await db.table(tableName).toArray();
    } catch {
      tables[tableName] = [];
    }
  }
  return {
    version: db.verno,
    timestamp: Date.now(),
    tables,
  };
}

/**
 * Restore database from a backup object (e.g. after failed migration).
 * Clears existing data before inserting backup data.
 */
export async function restoreDatabaseBackup(
  backup: DatabaseBackup,
  db: NexusDatabase = nexusDb,
): Promise<void> {
  await db.transaction('rw', db.tables, async () => {
    for (const table of db.tables) {
      await table.clear();
      const rows = backup.tables[table.name];
      if (rows && rows.length > 0) {
        await table.bulkAdd(rows);
      }
    }
  });
}

// ─── History query (resolution-aware) ──────────────────────────────

const HISTORY_RANGE_MS: Record<HistoryRange, number> = {
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
  '90d': 90 * 24 * 60 * 60 * 1000,
};

function snapshotToEntry(s: EnergySnapshot): Omit<HistoryEntry, 'ts' | 'resolution'> {
  return {
    pvPower: s.pvPower,
    batteryPower: s.batteryPower,
    gridPower: s.gridPower,
    houseLoad: s.houseLoad,
    batterySoC: s.batterySoC,
    heatPumpPower: s.heatPumpPower,
    evPower: s.evPower,
    gridVoltage: s.gridVoltage,
    batteryVoltage: s.batteryVoltage,
    pvYieldToday: s.pvYieldToday,
    priceCurrent: s.priceCurrent,
  };
}

function aggregateToEntry(a: EnergyAggregate): Omit<HistoryEntry, 'ts' | 'resolution'> {
  return {
    pvPower: a.pvPower,
    batteryPower: a.batteryPower,
    gridPower: a.gridPower,
    houseLoad: a.houseLoad,
    batterySoC: a.batterySoC,
    heatPumpPower: a.heatPumpPower,
    evPower: a.evPower,
    gridVoltage: a.gridVoltage,
    batteryVoltage: a.batteryVoltage,
    pvYieldToday: a.pvYieldToday,
    priceCurrent: a.priceCurrent,
  };
}

// ─── On-the-fly aggregation ──────────────────────────────────────────

function msToResolutionLabel(ms: number): 'raw' | AggregateResolution {
  if (ms >= 60 * 60 * 1000) return '1h';
  if (ms >= 15 * 60 * 1000) return '15m';
  return 'raw';
}

/**
 * Fetch raw EnergySnapshots in [startTime, endTime] and aggregate them
 * on-the-fly into fixed-size time buckets of `resolutionMs` milliseconds.
 *
 * Each bucket's value is the arithmetic mean of all samples that fall
 * within it. Empty buckets are omitted.
 *
 * Typical resolutions:
 *   ≤ 24 h  →  5 min  (300 000 ms)
 *   ≤ 7 d   → 15 min  (900 000 ms)
 *   > 7 d   →  1 h   (3 600 000 ms)
 */
export async function getAggregatedSnapshots(
  startTime: number,
  endTime: number,
  resolutionMs: number,
): Promise<HistoryEntry[]> {
  const effectiveRes = Math.max(1, resolutionMs);
  const label = msToResolutionLabel(effectiveRes);

  const snaps = await nexusDb.energySnapshots
    .where('timestamp')
    .between(startTime, endTime, true, true)
    .toArray();

  if (snaps.length === 0) return [];

  // Bucket snapshots by floor(ts / resolutionMs) * resolutionMs
  const buckets = new Map<number, EnergySnapshot[]>();
  for (const snap of snaps) {
    const key = Math.floor(snap.timestamp / effectiveRes) * effectiveRes;
    let group = buckets.get(key);
    if (!group) {
      group = [];
      buckets.set(key, group);
    }
    group.push(snap);
  }

  // Average each bucket and emit a HistoryEntry
  const result: HistoryEntry[] = [];
  for (const [bucketTs, group] of buckets) {
    const n = group.length;
    const sum = (f: keyof EnergyData) => group.reduce((acc, s) => acc + (s[f] as number), 0);
    result.push({
      ts: bucketTs,
      resolution: label,
      pvPower: sum('pvPower') / n,
      batteryPower: sum('batteryPower') / n,
      gridPower: sum('gridPower') / n,
      houseLoad: sum('houseLoad') / n,
      batterySoC: sum('batterySoC') / n,
      heatPumpPower: sum('heatPumpPower') / n,
      evPower: sum('evPower') / n,
      gridVoltage: sum('gridVoltage') / n,
      batteryVoltage: sum('batteryVoltage') / n,
      pvYieldToday: sum('pvYieldToday') / n,
      priceCurrent: sum('priceCurrent') / n,
    });
  }

  result.sort((a, b) => a.ts - b.ts);
  return result;
}

// ─── Pre-aggregated history query (uses energyAggregates table) ──────

/**
 * Resolution-aware history query:
 *   24h / 7d  → raw EnergySnapshots (full resolution)
 *   30d       → 15-minute EnergyAggregates (downsampled)
 *   90d       → 1-hour EnergyAggregates (downsampled)
 *
 * Returns entries sorted ascending by timestamp.
 */
export async function getHistory(range: HistoryRange): Promise<HistoryEntry[]> {
  const now = Date.now();
  const from = now - HISTORY_RANGE_MS[range];

  if (range === '24h' || range === '7d') {
    const snaps = await nexusDb.energySnapshots
      .where('timestamp')
      .aboveOrEqual(from)
      .sortBy('timestamp');
    return snaps.map((s) => ({
      ts: s.timestamp,
      resolution: 'raw' as const,
      ...snapshotToEntry(s),
    }));
  }

  const res: AggregateResolution = range === '30d' ? '15m' : '1h';
  const aggs = await nexusDb.energyAggregates
    .where('[resolution+bucketTs]')
    .between([res, from], [res, now], true, true)
    .toArray();
  // Compound index returns in insertion order — sort ascending by bucketTs
  aggs.sort((a, b) => a.bucketTs - b.bucketTs);
  return aggs.map((a) => ({ ts: a.bucketTs, resolution: res, ...aggregateToEntry(a) }));
}
