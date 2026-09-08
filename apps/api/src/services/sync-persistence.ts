/**
 * Optional Redis persistence for offline sync state (ADR-030).
 * Falls back to in-memory structures when REDIS_URL is unset or unavailable.
 */

import type { SettingsSyncCategory } from '../data/settings-sync-keys.js';
import type { IRedisClient } from './redis-client.js';
import { getOptionalRedisClient } from './redis-client.js';

const SYNC_VERSION_KEY = 'nexus:sync:version';
const SYNC_SETTINGS_KEY = 'nexus:sync:settings';
const SYNC_DIFF_KEY = 'nexus:sync:diff';
const IDEMPOTENCY_HTTP_PREFIX = 'nexus:idempotency:http:';
const IDEMPOTENCY_WS_PREFIX = 'nexus:idempotency:ws:';

const IDEMPOTENCY_TTL_SEC = 300;
const MAX_DIFF_ENTRIES = 500;

export interface IdempotencyRecord {
  statusCode: number;
  body: unknown;
  expiresAt: number;
}

export interface SyncDiffEntry {
  key: string;
  value: unknown;
  updatedAt: number;
  category: SettingsSyncCategory;
  version: number;
}

const SERVER_BOOT_VERSION = Date.now();

// ─── In-memory fallback ───────────────────────────────────────────────

const memoryVersion = { value: SERVER_BOOT_VERSION };
const memorySettings = new Map<string, unknown>();
const memoryDiff: SyncDiffEntry[] = [];
const memoryIdempotency = new Map<string, IdempotencyRecord>();
const memoryWsKeys = new Map<string, number>();

function pruneMemoryIdempotency(): void {
  const now = Date.now();
  for (const [key, record] of memoryIdempotency) {
    if (record.expiresAt <= now) memoryIdempotency.delete(key);
  }
}

function pruneMemoryWsKeys(): void {
  const now = Date.now();
  for (const [key, expiresAt] of memoryWsKeys) {
    if (expiresAt <= now) memoryWsKeys.delete(key);
  }
}

async function redisClient(): Promise<IRedisClient | null> {
  return getOptionalRedisClient();
}

// ─── Sync version ─────────────────────────────────────────────────────

export async function getSyncVersion(): Promise<number> {
  const redis = await redisClient();
  if (redis) {
    const raw = await redis.get(SYNC_VERSION_KEY);
    if (raw) {
      const parsed = Number(raw);
      if (Number.isFinite(parsed)) return parsed;
    }
    await redis.set(SYNC_VERSION_KEY, String(memoryVersion.value), 'EX', 86_400 * 30);
    return memoryVersion.value;
  }
  return memoryVersion.value;
}

export async function bumpSyncVersion(): Promise<number> {
  const redis = await redisClient();
  if (redis) {
    const bumped = await redis.incr(SYNC_VERSION_KEY);
    memoryVersion.value = bumped;
    return bumped;
  }
  const now = Date.now();
  memoryVersion.value = Math.max(now, memoryVersion.value + 1);
  return memoryVersion.value;
}

// ─── Settings ─────────────────────────────────────────────────────────

export async function getServerSettingsSnapshot(): Promise<Record<string, unknown>> {
  const redis = await redisClient();
  if (redis) {
    const raw = await redis.get(SYNC_SETTINGS_KEY);
    if (raw) {
      try {
        return JSON.parse(raw) as Record<string, unknown>;
      } catch {
        return {};
      }
    }
    return {};
  }
  return Object.fromEntries(memorySettings);
}

async function persistSettingsSnapshot(snapshot: Record<string, unknown>): Promise<void> {
  const redis = await redisClient();
  if (redis) {
    await redis.set(SYNC_SETTINGS_KEY, JSON.stringify(snapshot), 'EX', 86_400 * 30);
    return;
  }
  memorySettings.clear();
  for (const [key, value] of Object.entries(snapshot)) {
    memorySettings.set(key, value);
  }
}

export async function setServerSetting(key: string, value: unknown): Promise<void> {
  const snapshot = await getServerSettingsSnapshot();
  snapshot[key] = value;
  await persistSettingsSnapshot(snapshot);
}

// ─── Diff log ─────────────────────────────────────────────────────────

async function readDiffLog(): Promise<SyncDiffEntry[]> {
  const redis = await redisClient();
  if (redis) {
    const raw = await redis.get(SYNC_DIFF_KEY);
    if (!raw) return [];
    try {
      return JSON.parse(raw) as SyncDiffEntry[];
    } catch {
      return [];
    }
  }
  return [...memoryDiff];
}

async function writeDiffLog(entries: SyncDiffEntry[]): Promise<void> {
  const trimmed = entries.slice(-MAX_DIFF_ENTRIES);
  const redis = await redisClient();
  if (redis) {
    await redis.set(SYNC_DIFF_KEY, JSON.stringify(trimmed), 'EX', 86_400 * 30);
    return;
  }
  memoryDiff.length = 0;
  memoryDiff.push(...trimmed);
}

export async function appendSyncDiffEntry(entry: SyncDiffEntry): Promise<void> {
  const log = await readDiffLog();
  log.push(entry);
  await writeDiffLog(log);
}

export async function getSyncDiffSince(
  since: number,
): Promise<{ version: number; changes: SyncDiffEntry[] }> {
  const version = await getSyncVersion();
  const normalizedSince = Number.isFinite(since) ? since : 0;
  const log = await readDiffLog();
  const changes = log.filter((entry) => entry.version > normalizedSince);
  return { version, changes };
}

// ─── HTTP idempotency ─────────────────────────────────────────────────

export async function getIdempotencyRecord(key: string): Promise<IdempotencyRecord | undefined> {
  const redis = await redisClient();
  if (redis) {
    const raw = await redis.get(`${IDEMPOTENCY_HTTP_PREFIX}${key}`);
    if (!raw) return undefined;
    try {
      const record = JSON.parse(raw) as IdempotencyRecord;
      if (record.expiresAt <= Date.now()) {
        await redis.del(`${IDEMPOTENCY_HTTP_PREFIX}${key}`);
        return undefined;
      }
      return record;
    } catch {
      return undefined;
    }
  }

  pruneMemoryIdempotency();
  const record = memoryIdempotency.get(key);
  if (!record || record.expiresAt <= Date.now()) {
    memoryIdempotency.delete(key);
    return undefined;
  }
  return record;
}

export async function setIdempotencyRecord(
  key: string,
  statusCode: number,
  body: unknown,
): Promise<void> {
  const record: IdempotencyRecord = {
    statusCode,
    body,
    expiresAt: Date.now() + IDEMPOTENCY_TTL_SEC * 1000,
  };

  const redis = await redisClient();
  if (redis) {
    await redis.set(
      `${IDEMPOTENCY_HTTP_PREFIX}${key}`,
      JSON.stringify(record),
      'EX',
      IDEMPOTENCY_TTL_SEC,
    );
    return;
  }

  pruneMemoryIdempotency();
  memoryIdempotency.set(key, record);
}

// ─── WS idempotency ───────────────────────────────────────────────────

export async function isWsIdempotencyReplay(key: string): Promise<boolean> {
  const redis = await redisClient();
  if (redis) {
    const hit = await redis.get(`${IDEMPOTENCY_WS_PREFIX}${key}`);
    return hit !== null;
  }

  pruneMemoryWsKeys();
  const expiresAt = memoryWsKeys.get(key);
  if (!expiresAt) return false;
  if (expiresAt <= Date.now()) {
    memoryWsKeys.delete(key);
    return false;
  }
  return true;
}

export async function markWsIdempotencyAccepted(key: string): Promise<void> {
  const redis = await redisClient();
  if (redis) {
    await redis.set(`${IDEMPOTENCY_WS_PREFIX}${key}`, '1', 'EX', IDEMPOTENCY_TTL_SEC);
    return;
  }

  pruneMemoryWsKeys();
  memoryWsKeys.set(key, Date.now() + IDEMPOTENCY_TTL_SEC * 1000);
}

// ─── Test helpers ─────────────────────────────────────────────────────

export function resetSyncPersistenceForTests(version = SERVER_BOOT_VERSION): void {
  memoryVersion.value = version;
  memorySettings.clear();
  memoryDiff.length = 0;
  memoryIdempotency.clear();
  memoryWsKeys.clear();
}
