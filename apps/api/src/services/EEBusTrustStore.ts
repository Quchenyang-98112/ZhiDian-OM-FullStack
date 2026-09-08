/**
 * EEBusTrustStore — Persistent trust store for EEBUS SHIP devices (file or Redis).
 *
 * Default: JSON file with atomic temp+rename writes.
 * HA: set `EEBUS_TRUST_BACKEND=redis` and `REDIS_URL` so all API replicas share entries.
 *
 * File path: EEBUS_TRUST_FILE env var or 'data/eebus-trust.json' (relative to cwd).
 */

import { mkdir, readFile, rename, writeFile } from 'fs/promises';
import { dirname, resolve } from 'path';

const TRUST_BACKEND = (process.env.EEBUS_TRUST_BACKEND ?? 'file').toLowerCase();

// ─── Types ─────────────────────────────────────────────────────────

export interface EEBUSDeviceEntry {
  ski: string;
  hostname: string;
  port: number;
  brand?: string;
  model?: string;
  deviceType?: string;
  /** 'trusted' = successfully paired; 'pending' = handshake in progress; 'failed' = last attempt failed */
  status: 'trusted' | 'pending' | 'failed';
  /** Unix ms — when trust was first established via PIN */
  trustedAt: number;
  /** Unix ms — last successful SPINE message exchange */
  lastConnectedAt?: number;
}

interface TrustStoreFile {
  version: 1;
  devices: EEBUSDeviceEntry[];
}

// ─── Singleton ─────────────────────────────────────────────────────

const TRUST_FILE_PATH = resolve(
  process.cwd(),
  process.env.EEBUS_TRUST_FILE ?? 'data/eebus-trust.json',
);

let cache: Map<string, EEBUSDeviceEntry> | null = null;

// ─── Internal helpers ──────────────────────────────────────────────

async function ensureDir(filePath: string): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
}

async function loadCache(): Promise<Map<string, EEBUSDeviceEntry>> {
  if (cache) return cache;
  try {
    const raw = await readFile(TRUST_FILE_PATH, 'utf-8');
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      !Array.isArray((parsed as TrustStoreFile).devices)
    ) {
      cache = new Map();
      return cache;
    }
    const data = parsed as TrustStoreFile;
    cache = new Map(data.devices.map((d) => [d.ski, d]));
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.error('[EEBusTrustStore] Failed to load trust file:', err);
    }
    cache = new Map();
  }
  return cache;
}

async function persist(): Promise<void> {
  const store = await loadCache();
  const data: TrustStoreFile = {
    version: 1,
    devices: Array.from(store.values()),
  };
  const json = JSON.stringify(data, null, 2);
  await ensureDir(TRUST_FILE_PATH);
  const tmpPath = `${TRUST_FILE_PATH}.tmp`;
  await writeFile(tmpPath, json, 'utf-8');
  // Atomic rename ensures no partial reads
  await rename(tmpPath, TRUST_FILE_PATH);
}

// ─── Public API ────────────────────────────────────────────────────

/**
 * Add or update a device in the trust store.
 * Partial updates are merged — only provided fields overwrite existing values.
 */
export async function upsertDevice(entry: EEBUSDeviceEntry): Promise<void> {
  if (TRUST_BACKEND === 'redis') {
    const { redisUpsertDevice } = await import('./eebus-trust-redis.js');
    await redisUpsertDevice(entry);
    cache = null;
    return;
  }
  const store = await loadCache();
  const existing = store.get(entry.ski);
  store.set(entry.ski, { ...existing, ...entry });
  await persist();
}

/**
 * Remove a device from the trust store by SKI.
 * @returns true if the device was found and removed, false if not found.
 */
export async function removeDevice(ski: string): Promise<boolean> {
  if (TRUST_BACKEND === 'redis') {
    const { redisRemoveDevice } = await import('./eebus-trust-redis.js');
    cache = null;
    return redisRemoveDevice(ski);
  }
  const store = await loadCache();
  if (!store.has(ski)) return false;
  store.delete(ski);
  await persist();
  return true;
}

/**
 * Retrieve a single device entry by SKI.
 * @returns The device entry, or null if not found.
 */
export async function getDevice(ski: string): Promise<EEBUSDeviceEntry | null> {
  if (TRUST_BACKEND === 'redis') {
    const { redisGetDevice } = await import('./eebus-trust-redis.js');
    return redisGetDevice(ski);
  }
  const store = await loadCache();
  return store.get(ski) ?? null;
}

/**
 * List all devices in the trust store.
 */
export async function listDevices(): Promise<EEBUSDeviceEntry[]> {
  if (TRUST_BACKEND === 'redis') {
    const { redisListDevices } = await import('./eebus-trust-redis.js');
    return redisListDevices();
  }
  const store = await loadCache();
  return Array.from(store.values());
}

/**
 * Check if a SKI is in the trust store with 'trusted' status.
 */
export async function isTrusted(ski: string): Promise<boolean> {
  const device = await getDevice(ski);
  return device?.status === 'trusted';
}

/**
 * Update only the status and lastConnectedAt of an existing device.
 * No-op if the device is not in the trust store.
 */
export async function updateDeviceStatus(
  ski: string,
  status: EEBUSDeviceEntry['status'],
  lastConnectedAt?: number,
): Promise<void> {
  if (TRUST_BACKEND === 'redis') {
    const { redisUpdateDeviceStatus } = await import('./eebus-trust-redis.js');
    await redisUpdateDeviceStatus(ski, status, lastConnectedAt);
    cache = null;
    return;
  }
  const store = await loadCache();
  const existing = store.get(ski);
  if (!existing) return;
  // exactOptionalPropertyTypes: only set lastConnectedAt when defined
  const updated: EEBUSDeviceEntry = { ...existing, status };
  const resolvedLastConnected = lastConnectedAt ?? existing.lastConnectedAt;
  if (resolvedLastConnected !== undefined) {
    updated.lastConnectedAt = resolvedLastConnected;
  }
  store.set(ski, updated);
  await persist();
}

/** Invalidate the in-memory cache (useful in tests) */
export function invalidateCache(): void {
  cache = null;
}
