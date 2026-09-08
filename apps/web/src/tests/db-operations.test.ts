import { beforeEach, describe, expect, it, vi } from 'vitest';
import 'fake-indexeddb/auto';
import {
  cleanExpiredCache,
  cleanExpiredShareLinks,
  cleanupCompletedActions,
  clearAllData,
  getAggregatedSnapshots,
  getCacheStats,
  getDatabaseSize,
  getHistory,
  getLatestEnergySnapshot,
  getPendingActions,
  getRecentErrors,
  getSyncState,
  loadEebusLocalCertificateRows,
  logError,
  nexusDb,
  persistEebusLocalCertificateRows,
  persistSankeySnapshot,
  persistSettings,
  persistShareLink,
  persistSnapshot,
  queueOfflineAction,
  revokeLocalShareLink,
  storeCacheMetadata,
  updateActionStatus,
  updateSyncState,
  validateLocalShareToken,
} from '../lib/db';
import { defaultSettings } from '../store';
import type { EnergyData } from '../types';

const mockEnergy: EnergyData = {
  gridPower: 500,
  pvPower: 3500,
  batteryPower: -1000,
  houseLoad: 2000,
  batterySoC: 72,
  heatPumpPower: 800,
  evPower: 0,
  gridVoltage: 230,
  batteryVoltage: 52,
  pvYieldToday: 10,
  priceCurrent: 0.18,
};

async function clearOperationalTables(): Promise<void> {
  await Promise.all([
    nexusDb.energySnapshots.clear(),
    nexusDb.sankeySnapshots.clear(),
    nexusDb.offlineActions.clear(),
    nexusDb.syncState.clear(),
    nexusDb.cacheMetadata.clear(),
    nexusDb.errorLogs.clear(),
    nexusDb.shareLinks.clear(),
    nexusDb.eebusLocalCertificates.clear(),
    nexusDb.energyAggregates.clear(),
  ]);
}

describe('Database operational helpers', () => {
  beforeEach(async () => {
    await clearOperationalTables();
  });

  it('returns the latest snapshot with age metadata', async () => {
    const ts = Date.now() - 5 * 60_000;
    await nexusDb.energySnapshots.add({ ...mockEnergy, timestamp: ts });
    await persistSnapshot(mockEnergy);

    const latest = await getLatestEnergySnapshot();
    expect(latest?.data.pvPower).toBe(3500);
    expect(latest?.ageMinutes).toBeGreaterThanOrEqual(0);
  });

  it('persists sankey snapshots and trims old rows', async () => {
    for (let i = 0; i < 101; i++) {
      await persistSankeySnapshot(mockEnergy, [{ source: 'pv', target: 'load', value: 100 + i }]);
    }

    expect(await nexusDb.sankeySnapshots.count()).toBe(100);
  });

  it('queues, updates, and cleans offline actions', async () => {
    const id = await queueOfflineAction('battery-control', { powerW: 1200 });
    expect(id).toBeTypeOf('number');

    const pending = await getPendingActions();
    expect(pending).toHaveLength(1);
    expect(pending[0]?.idempotencyKey).toMatch(/^battery-control-/);

    await updateActionStatus(id, 'completed');
    await nexusDb.offlineActions.update(id, { timestamp: Date.now() - 8 * 24 * 60 * 60 * 1000 });
    await cleanupCompletedActions();

    expect(await nexusDb.offlineActions.count()).toBe(0);
  });

  it('creates and updates sync state records', async () => {
    const initial = await getSyncState('settings');
    expect(initial.localRevision).toBe(0);

    await updateSyncState('settings', 'etag-42', false);
    const updated = await getSyncState('settings');
    expect(updated.serverVersion).toBe('etag-42');
    expect(updated.lastSyncedAt).toBeGreaterThan(0);
  });

  it('tracks cache metadata and removes expired entries', async () => {
    await storeCacheMetadata('api-health', '/api/health', 128, 'api', 1000);
    await storeCacheMetadata('stale-image', '/logo.png', 256, 'image', -1000);

    const stats = await getCacheStats();
    expect(stats.totalEntries).toBe(2);
    expect(stats.byType.api).toBe(1);

    await cleanExpiredCache();
    expect(await nexusDb.cacheMetadata.count()).toBe(1);
  });

  it('logs errors and returns recent diagnostics entries', async () => {
    await logError(new Error('adapter timeout'), 'at AdapterPanel', 'high');

    const recent = await getRecentErrors(5);
    expect(recent).toHaveLength(1);
    expect(recent[0]?.message).toBe('adapter timeout');
    expect(recent[0]?.severity).toBe('high');
  });

  it('manages share links with validation and revocation', async () => {
    const link = {
      id: 'share-1',
      token: 'token-abc',
      url: 'https://example.test/share/token-abc',
      permissions: 'view' as const,
      expiresAt: Date.now() + 60_000,
      expiresInLabel: '1h',
      createdBy: 'owner',
      createdAt: Date.now(),
      useCount: 0,
      maxUses: 2,
      active: true,
    };

    await persistShareLink(link);
    expect(await nexusDb.shareLinks.count()).toBe(1);

    const validation = await validateLocalShareToken('token-abc');
    expect(validation.valid).toBe(true);
    expect(validation.permissions).toBe('view');

    await revokeLocalShareLink('share-1');
    expect(await validateLocalShareToken('token-abc')).toEqual({ valid: false });

    await nexusDb.shareLinks.update('share-1', { active: true, expiresAt: Date.now() - 1000 });
    await cleanExpiredShareLinks();
    expect(await nexusDb.shareLinks.count()).toBe(0);
  });

  it('aggregates snapshots and serves range-aware history', async () => {
    const now = Date.now();
    const baseTs = now - 2 * 60 * 60 * 1000;
    await nexusDb.energySnapshots.bulkAdd([
      { ...mockEnergy, pvPower: 1000, timestamp: baseTs },
      { ...mockEnergy, pvPower: 2000, timestamp: baseTs + 5 * 60_000 },
      { ...mockEnergy, pvPower: 3000, timestamp: baseTs + 10 * 60_000 },
    ]);

    const aggregated = await getAggregatedSnapshots(baseTs, now, 15 * 60_000);
    expect(aggregated.length).toBeGreaterThan(0);
    expect(aggregated[0]?.pvPower).toBeGreaterThan(0);

    const history = await getHistory('24h');
    expect(history.length).toBe(3);
    expect(history.every((entry) => entry.resolution === 'raw')).toBe(true);
  });

  it('reads pre-aggregated history for 30-day ranges', async () => {
    const now = Date.now();
    await nexusDb.energyAggregates.bulkAdd([
      {
        resolution: '15m',
        bucketTs: now - 60 * 60_000,
        sampleCount: 4,
        pvPower: 1800,
        batteryPower: -400,
        gridPower: 200,
        houseLoad: 1600,
        batterySoC: 70,
        heatPumpPower: 300,
        evPower: 0,
        gridVoltage: 230,
        batteryVoltage: 52,
        pvYieldToday: 9,
        priceCurrent: 0.2,
      },
      {
        resolution: '15m',
        bucketTs: now - 30 * 60_000,
        sampleCount: 4,
        pvPower: 2200,
        batteryPower: -500,
        gridPower: 100,
        houseLoad: 1700,
        batterySoC: 68,
        heatPumpPower: 350,
        evPower: 0,
        gridVoltage: 231,
        batteryVoltage: 51.8,
        pvYieldToday: 9.2,
        priceCurrent: 0.21,
      },
    ]);

    const history = await getHistory('30d');
    expect(history.length).toBe(2);
    expect(history.every((entry) => entry.resolution === '15m')).toBe(true);
  });

  it('persists EEBUS certificate rows without PEM payloads', async () => {
    await persistEebusLocalCertificateRows([
      {
        id: 1,
        deviceName: 'Local SHIP cert',
        fingerprint: 'abc123',
        validUntil: Date.now() + 86_400_000,
        createdAt: Date.now(),
        status: 'trusted',
        pemData: 'should-be-stripped',
      },
    ]);

    const rows = await loadEebusLocalCertificateRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.deviceName).toBe('Local SHIP cert');
    expect(rows[0]).not.toHaveProperty('pemData');
  });

  it('persists settings, reports database size, and clears operational tables', async () => {
    const settings = {
      ...defaultSettings,
      animations: false,
      compactMode: true,
    };

    await persistSettings(settings);
    const stored = await nexusDb.settings.get('ui-settings');
    expect(stored?.value.compactMode).toBe(true);
    expect(stored?.value.animations).toBe(false);

    vi.stubGlobal('navigator', {
      storage: {
        estimate: vi.fn().mockResolvedValue({ usage: 4096 }),
      },
    });
    await expect(getDatabaseSize()).resolves.toBe(4096);
    vi.unstubAllGlobals();

    await persistSnapshot(mockEnergy);
    await clearAllData();
    expect(await nexusDb.energySnapshots.count()).toBe(0);
    expect(await nexusDb.offlineActions.count()).toBe(0);
  });
});
