import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import 'fake-indexeddb/auto';
import {
  cacheEnergySnapshot,
  cacheSankeyData,
  cacheTariffData,
  clearOfflineCache,
  db,
  evictOldestOfflineEntries,
  getBrowserStorageUsage,
  getLatestEnergySnapshot,
  getLatestSankeyData,
  getLatestTariffData,
  getStorageStats,
  monitorOfflineStorageQuota,
  OFFLINE_STORAGE_QUOTA_WARNING_RATIO,
} from '../lib/offline-cache';

describe('Offline Cache (IndexedDB)', () => {
  beforeEach(async () => {
    await db.energySnapshots.clear();
    await db.sankeySnapshots.clear();
    await db.tariffData.clear();
    await db.userPreferences.clear();
  });

  describe('Energy Snapshots', () => {
    it('should cache and retrieve an energy snapshot', async () => {
      const mockData = { pvPower: 3500, gridPower: -200 };
      await cacheEnergySnapshot(mockData);

      const latest = await getLatestEnergySnapshot();
      expect(latest).not.toBeNull();
      expect(latest!.data).toEqual(mockData);
      expect(latest!.ageMinutes).toBeTypeOf('number');
    });

    it('should return null when no snapshots exist', async () => {
      const latest = await getLatestEnergySnapshot();
      expect(latest).toBeNull();
    });

    it('should return the most recent snapshot', async () => {
      await cacheEnergySnapshot({ pvPower: 1000 });
      await new Promise((r) => setTimeout(r, 10));
      await cacheEnergySnapshot({ pvPower: 2000 });

      const latest = await getLatestEnergySnapshot();
      expect((latest!.data as { pvPower: number }).pvPower).toBe(2000);
    });
  });

  describe('Sankey Data', () => {
    it('should cache and retrieve Sankey data', async () => {
      const nodes = [{ name: 'PV' }, { name: 'Grid' }];
      const links = [{ source: 0, target: 1, value: 500 }];
      await cacheSankeyData(nodes, links);

      const latest = await getLatestSankeyData();
      expect(latest).not.toBeNull();
      expect(latest!.nodes).toEqual(nodes);
      expect(latest!.links).toEqual(links);
    });

    it('should return null when no Sankey data exists', async () => {
      const latest = await getLatestSankeyData();
      expect(latest).toBeNull();
    });
  });

  describe('Tariff Data', () => {
    it('should cache and retrieve tariff data', async () => {
      const tariff = [{ timestamp: Date.now(), price: 0.15 }];
      await cacheTariffData('tibber', tariff, 60);

      const cached = await getLatestTariffData('tibber');
      expect(cached).not.toBeNull();
      expect(cached!.data).toEqual(tariff);
    });

    it('should return null for unknown provider', async () => {
      const cached = await getLatestTariffData('tibber');
      expect(cached).toBeNull();
    });
  });

  describe('Storage Stats', () => {
    it('should report zero counts when empty', async () => {
      const stats = await getStorageStats();
      expect(stats.energySnapshots).toBe(0);
      expect(stats.sankeySnapshots).toBe(0);
      expect(stats.tariffEntries).toBe(0);
    });

    it('should count entries after caching', async () => {
      await cacheEnergySnapshot({ pvPower: 100 });
      await cacheSankeyData([{ name: 'PV' }], []);
      const stats = await getStorageStats();
      expect(stats.energySnapshots).toBe(1);
      expect(stats.sankeySnapshots).toBe(1);
    });
  });

  describe('Clear Cache', () => {
    it('should clear all cached data', async () => {
      await cacheEnergySnapshot({ pvPower: 100 });
      await cacheSankeyData([{ name: 'PV' }], []);
      await clearOfflineCache();
      const stats = await getStorageStats();
      expect(stats.energySnapshots).toBe(0);
      expect(stats.sankeySnapshots).toBe(0);
    });
  });

  describe('Database schema', () => {
    it('should have all required tables', () => {
      expect(db.energySnapshots).toBeDefined();
      expect(db.sankeySnapshots).toBeDefined();
      expect(db.tariffData).toBeDefined();
      expect(db.userPreferences).toBeDefined();
    });
  });

  describe('Storage quota monitoring (LOW-05)', () => {
    const originalStorage = navigator.storage;

    afterEach(() => {
      Object.defineProperty(navigator, 'storage', {
        configurable: true,
        value: originalStorage,
      });
      vi.useRealTimers();
      vi.restoreAllMocks();
    });

    it('getBrowserStorageUsage returns ratio when estimate is available', async () => {
      Object.defineProperty(navigator, 'storage', {
        configurable: true,
        value: {
          estimate: vi.fn().mockResolvedValue({ usage: 850, quota: 1000 }),
        },
      });

      const usage = await getBrowserStorageUsage();
      expect(usage).toEqual({ usage: 850, quota: 1000, ratio: 0.85 });
    });

    it('getBrowserStorageUsage returns null when quota is zero', async () => {
      Object.defineProperty(navigator, 'storage', {
        configurable: true,
        value: {
          estimate: vi.fn().mockResolvedValue({ usage: 100, quota: 0 }),
        },
      });

      expect(await getBrowserStorageUsage()).toBeNull();
    });

    it('evictOldestOfflineEntries removes oldest energy snapshots first', async () => {
      await cacheEnergySnapshot({ pvPower: 100 });
      await new Promise((r) => setTimeout(r, 10));
      await cacheEnergySnapshot({ pvPower: 200 });

      const evicted = await evictOldestOfflineEntries(1);
      expect(evicted).toBe(1);

      const latest = await getLatestEnergySnapshot();
      expect((latest!.data as { pvPower: number }).pvPower).toBe(200);
    });

    it('monitorOfflineStorageQuota warns once and evicts when ratio exceeds threshold', async () => {
      const onWarning = vi.fn();

      Object.defineProperty(navigator, 'storage', {
        configurable: true,
        value: {
          estimate: vi.fn().mockResolvedValue({
            usage: OFFLINE_STORAGE_QUOTA_WARNING_RATIO * 1000 + 50,
            quota: 1000,
          }),
        },
      });

      await cacheEnergySnapshot({ pvPower: 100 });
      await new Promise((r) => setTimeout(r, 10));
      await cacheEnergySnapshot({ pvPower: 200 });

      const stop = monitorOfflineStorageQuota({
        checkIntervalMs: 60_000,
        onWarning,
      });

      await vi.waitFor(() => {
        expect(onWarning).toHaveBeenCalledTimes(1);
      });

      expect(onWarning.mock.calls[0][0].ratio).toBeGreaterThanOrEqual(
        OFFLINE_STORAGE_QUOTA_WARNING_RATIO,
      );

      const stats = await getStorageStats();
      expect(stats.energySnapshots).toBeLessThan(2);

      stop();
    });
  });
});
