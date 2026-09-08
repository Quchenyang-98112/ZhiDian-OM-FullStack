import Dexie, { type Table } from 'dexie';

export interface CachedEnergySnapshot {
  id?: number;
  timestamp: number;
  data: string; // JSON stringified EnergyData
  createdAt: number;
}

export interface CachedSankeyData {
  id?: number;
  timestamp: number;
  nodes: string; // JSON stringified nodes
  links: string; // JSON stringified links
  createdAt: number;
}

export interface CachedTariffData {
  id?: number;
  provider: string; // 'tibber' | 'awattar'
  timestamp: number;
  data: string; // JSON stringified tariff data
  expiresAt: number;
  createdAt: number;
}

export interface CachedUserPreferences {
  id?: number;
  key: string;
  value: string;
  updatedAt: number;
}

export class NexusDatabase extends Dexie {
  energySnapshots!: Table<CachedEnergySnapshot, number>;
  sankeySnapshots!: Table<CachedSankeyData, number>;
  tariffData!: Table<CachedTariffData, number>;
  userPreferences!: Table<CachedUserPreferences, number>;

  constructor() {
    super('NexusHEMS');

    this.version(3).stores({
      energySnapshots: '++id, timestamp, createdAt',
      sankeySnapshots: '++id, timestamp, createdAt',
      tariffData: '++id, provider, timestamp, expiresAt',
      userPreferences: '++id, &key, updatedAt',
    });
  }
}

export const db = new NexusDatabase();

/**
 * Cache current energy data snapshot
 */
export async function cacheEnergySnapshot(data: unknown): Promise<void> {
  try {
    const snapshot: CachedEnergySnapshot = {
      timestamp: Date.now(),
      data: JSON.stringify(data),
      createdAt: Date.now(),
    };

    await db.energySnapshots.add(snapshot);

    // Keep only last 1000 snapshots
    const count = await db.energySnapshots.count();
    if (count > 1000) {
      const oldestIds = await db.energySnapshots
        .orderBy('timestamp')
        .limit(count - 1000)
        .primaryKeys();
      await db.energySnapshots.bulkDelete(oldestIds);
    }
  } catch (error) {
    console.error('Failed to cache energy snapshot:', error);
  }
}

/**
 * Get the most recent cached energy snapshot
 */
export async function getLatestEnergySnapshot(): Promise<{
  data: unknown;
  timestamp: number;
  ageMinutes: number;
} | null> {
  try {
    const latest = await db.energySnapshots.orderBy('timestamp').reverse().first();

    if (!latest) return null;

    const age = Date.now() - latest.timestamp;

    return {
      data: JSON.parse(latest.data),
      timestamp: latest.timestamp,
      ageMinutes: Math.floor(age / 1000 / 60),
    };
  } catch (error) {
    console.error('Failed to get latest snapshot:', error);
    return null;
  }
}

/**
 * Cache Sankey diagram data for offline mode
 */
export async function cacheSankeyData(nodes: unknown[], links: unknown[]): Promise<void> {
  try {
    const snapshot: CachedSankeyData = {
      timestamp: Date.now(),
      nodes: JSON.stringify(nodes),
      links: JSON.stringify(links),
      createdAt: Date.now(),
    };

    await db.sankeySnapshots.add(snapshot);

    // Keep only last 100 Sankey snapshots
    const count = await db.sankeySnapshots.count();
    if (count > 100) {
      const oldestIds = await db.sankeySnapshots
        .orderBy('timestamp')
        .limit(count - 100)
        .primaryKeys();
      await db.sankeySnapshots.bulkDelete(oldestIds);
    }
  } catch (error) {
    console.error('Failed to cache Sankey data:', error);
  }
}

/**
 * Get the most recent cached Sankey data
 */
export async function getLatestSankeyData(): Promise<{
  nodes: unknown[];
  links: unknown[];
  timestamp: number;
  ageMinutes: number;
} | null> {
  try {
    const latest = await db.sankeySnapshots.orderBy('timestamp').reverse().first();

    if (!latest) return null;

    const age = Date.now() - latest.timestamp;

    return {
      nodes: JSON.parse(latest.nodes),
      links: JSON.parse(latest.links),
      timestamp: latest.timestamp,
      ageMinutes: Math.floor(age / 1000 / 60),
    };
  } catch (error) {
    console.error('Failed to get latest Sankey data:', error);
    return null;
  }
}

/**
 * Cache tariff data (Tibber / aWATTar)
 */
export async function cacheTariffData(
  provider: string,
  data: unknown,
  ttlMinutes = 60,
): Promise<void> {
  try {
    const entry: CachedTariffData = {
      provider,
      timestamp: Date.now(),
      data: JSON.stringify(data),
      expiresAt: Date.now() + ttlMinutes * 60 * 1000,
      createdAt: Date.now(),
    };
    await db.tariffData.add(entry);

    // Prune expired entries
    const expired = await db.tariffData.where('expiresAt').below(Date.now()).primaryKeys();
    if (expired.length > 0) {
      await db.tariffData.bulkDelete(expired);
    }
  } catch (error) {
    console.error('Failed to cache tariff data:', error);
  }
}

/**
 * Get the latest valid cached tariff data for a provider
 */
export async function getLatestTariffData(provider: string): Promise<{
  data: unknown;
  timestamp: number;
  ageMinutes: number;
} | null> {
  try {
    const latest = await db.tariffData
      .where('provider')
      .equals(provider)
      .and((entry) => entry.expiresAt > Date.now())
      .reverse()
      .sortBy('timestamp');

    if (!latest.length) return null;

    const entry = latest[0];
    return {
      data: JSON.parse(entry.data),
      timestamp: entry.timestamp,
      ageMinutes: Math.floor((Date.now() - entry.timestamp) / 1000 / 60),
    };
  } catch (error) {
    console.error('Failed to get tariff data:', error);
    return null;
  }
}

/**
 * Get storage usage statistics
 */
export async function getStorageStats(): Promise<{
  energySnapshots: number;
  sankeySnapshots: number;
  tariffEntries: number;
  estimatedSizeKB: number;
}> {
  try {
    const energyCount = await db.energySnapshots.count();
    const sankeyCount = await db.sankeySnapshots.count();
    const tariffCount = await db.tariffData.count();

    // Estimate size based on average record sizes
    const estimatedSizeKB = Math.round(energyCount * 2 + sankeyCount * 5 + tariffCount * 1);

    return {
      energySnapshots: energyCount,
      sankeySnapshots: sankeyCount,
      tariffEntries: tariffCount,
      estimatedSizeKB,
    };
  } catch (error) {
    console.error('Failed to get storage stats:', error);
    return { energySnapshots: 0, sankeySnapshots: 0, tariffEntries: 0, estimatedSizeKB: 0 };
  }
}

/**
 * Clear all cached offline data
 */
export async function clearOfflineCache(): Promise<void> {
  try {
    await db.energySnapshots.clear();
    await db.sankeySnapshots.clear();
    await db.tariffData.clear();
  } catch (error) {
    console.error('Failed to clear offline cache:', error);
  }
}

/** Warn when browser storage usage exceeds this fraction of quota (LOW-05). */
export const OFFLINE_STORAGE_QUOTA_WARNING_RATIO = 0.8;

export interface BrowserStorageUsage {
  usage: number;
  quota: number;
  ratio: number;
}

/**
 * Read browser storage quota via Storage Manager API.
 * Returns null when the API is unavailable or quota is unknown.
 */
export async function getBrowserStorageUsage(): Promise<BrowserStorageUsage | null> {
  if (typeof navigator === 'undefined' || !navigator.storage?.estimate) {
    return null;
  }

  try {
    const estimate = await navigator.storage.estimate();
    const usage = estimate.usage ?? 0;
    const quota = estimate.quota ?? 0;
    if (quota <= 0) return null;
    return { usage, quota, ratio: usage / quota };
  } catch (error) {
    console.error('Failed to estimate browser storage:', error);
    return null;
  }
}

/**
 * LRU eviction: remove oldest offline-cache rows across IndexedDB tables.
 * Energy snapshots are pruned first (largest volume), then Sankey and tariff rows.
 */
export async function evictOldestOfflineEntries(batchSize = 50): Promise<number> {
  let evicted = 0;

  try {
    const energyIds = await db.energySnapshots.orderBy('timestamp').limit(batchSize).primaryKeys();
    if (energyIds.length > 0) {
      await db.energySnapshots.bulkDelete(energyIds);
      evicted += energyIds.length;
    }

    const remaining = Math.max(0, batchSize - evicted);
    if (remaining > 0) {
      const sankeyIds = await db.sankeySnapshots
        .orderBy('timestamp')
        .limit(remaining)
        .primaryKeys();
      if (sankeyIds.length > 0) {
        await db.sankeySnapshots.bulkDelete(sankeyIds);
        evicted += sankeyIds.length;
      }
    }

    const expiredTariffIds = await db.tariffData.where('expiresAt').below(Date.now()).primaryKeys();
    if (expiredTariffIds.length > 0) {
      await db.tariffData.bulkDelete(expiredTariffIds);
      evicted += expiredTariffIds.length;
    }

    const tariffRemaining = Math.max(0, batchSize - evicted);
    if (tariffRemaining > 0) {
      const tariffIds = await db.tariffData
        .orderBy('timestamp')
        .limit(tariffRemaining)
        .primaryKeys();
      if (tariffIds.length > 0) {
        await db.tariffData.bulkDelete(tariffIds);
        evicted += tariffIds.length;
      }
    }
  } catch (error) {
    console.error('Failed to evict offline cache entries:', error);
  }

  return evicted;
}

export interface OfflineStorageQuotaMonitorOptions {
  /** Called once when usage crosses the warning ratio. */
  onWarning?: (usage: BrowserStorageUsage) => void;
  warningRatio?: number;
  checkIntervalMs?: number;
  /** Run LRU eviction when the warning threshold is crossed (default: true). */
  evictOnWarning?: boolean;
}

const DEFAULT_QUOTA_CHECK_INTERVAL_MS = 5 * 60 * 1000;

/**
 * Periodically monitor browser storage quota and warn before IndexedDB writes fail.
 * Returns a cleanup function (clear interval).
 */
export function monitorOfflineStorageQuota(
  options: OfflineStorageQuotaMonitorOptions = {},
): () => void {
  const warningRatio = options.warningRatio ?? OFFLINE_STORAGE_QUOTA_WARNING_RATIO;
  const checkIntervalMs = options.checkIntervalMs ?? DEFAULT_QUOTA_CHECK_INTERVAL_MS;
  const evictOnWarning = options.evictOnWarning ?? true;
  let warned = false;

  const check = async (): Promise<void> => {
    const usage = await getBrowserStorageUsage();
    if (!usage || usage.ratio < warningRatio) return;

    if (evictOnWarning) {
      await evictOldestOfflineEntries();
    }

    if (!warned && options.onWarning) {
      warned = true;
      options.onWarning(usage);
    }
  };

  void check();
  const intervalId = setInterval(() => {
    void check();
  }, checkIntervalMs);

  return () => clearInterval(intervalId);
}
