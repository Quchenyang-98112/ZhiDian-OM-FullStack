import { afterEach, describe, expect, it } from 'vitest';
import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import {
  checkMigrationHealth,
  DB_CURRENT_VERSION,
  type EnergySnapshot,
  exportDatabaseBackup,
  NexusDatabase,
  type OfflineAction,
  restoreDatabaseBackup,
} from '../lib/db';

let testDbCounter = 0;

/** Create a fresh NexusDatabase with a unique name to avoid cross-test interference */
function createTestDb(): NexusDatabase {
  testDbCounter++;
  return new NexusDatabase(`nexus-migration-test-${testDbCounter}-${Date.now()}`);
}

/** Simulate an old v1 database (only energySnapshots + settings) */
async function createLegacyV1Db(name: string): Promise<Dexie> {
  const db = new Dexie(name);
  db.version(1).stores({
    energySnapshots: '++id, timestamp',
    settings: 'key',
  });
  await db.open();
  return db;
}

const dbs: Dexie[] = [];

afterEach(async () => {
  for (const db of dbs) {
    try {
      db.close();
      await Dexie.delete(db.name);
    } catch {
      // ignore cleanup errors
    }
  }
  dbs.length = 0;
});

describe('Dexie Migration Safety', () => {
  it('should open at the current version', async () => {
    const db = createTestDb();
    dbs.push(db);
    await db.open();
    expect(db.verno).toBe(DB_CURRENT_VERSION);
  });

  it('should have all expected tables after fresh open', async () => {
    const db = createTestDb();
    dbs.push(db);
    await db.open();

    const tableNames = db.tables.map((t) => t.name).sort();
    expect(tableNames).toContain('energySnapshots');
    expect(tableNames).toContain('sankeySnapshots');
    expect(tableNames).toContain('offlineActions');
    expect(tableNames).toContain('cacheMetadata');
    expect(tableNames).toContain('errorLogs');
    expect(tableNames).toContain('settings');
    expect(tableNames).toContain('aiKeys');
    expect(tableNames).toContain('commandAudit');
    expect(tableNames).toContain('adapterCredentials');
    expect(tableNames).toContain('shareLinks');
    expect(tableNames).toContain('eebusDevices');
    expect(tableNames).toContain('eebusLocalCertificates');
  });

  it('should migrate from v1 to current without data loss', async () => {
    const dbName = `nexus-v1-upgrade-${Date.now()}`;

    // Step 1: Create a v1 database and insert data
    const legacyDb = await createLegacyV1Db(dbName);
    dbs.push(legacyDb);

    await legacyDb.table('energySnapshots').add({
      timestamp: 1000,
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
    });

    await legacyDb.table('settings').put({
      key: 'ui-settings',
      value: { theme: 'ocean-dark' },
    });

    const countBefore = await legacyDb.table('energySnapshots').count();
    expect(countBefore).toBe(1);

    legacyDb.close();

    // Step 2: Re-open with the full NexusDatabase schema (triggers migration)
    const upgraded = new NexusDatabase(dbName);
    dbs.push(upgraded);
    await upgraded.open();

    // Verify version upgraded
    expect(upgraded.verno).toBe(DB_CURRENT_VERSION);

    // Verify data survived the migration
    const snapshots = await upgraded.energySnapshots.toArray();
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0].pvPower).toBe(3500);
    expect(snapshots[0].gridPower).toBe(500);
    expect(snapshots[0].timestamp).toBe(1000);

    // Verify _schemaVersion was backfilled (V9 sets to 9)
    expect(snapshots[0]._schemaVersion).toBe(9);

    // Verify settings survived
    const settings = await upgraded.settings.get('ui-settings');
    expect(settings).toBeDefined();

    // Verify new tables are accessible
    const sankeyCount = await upgraded.sankeySnapshots.count();
    expect(sankeyCount).toBe(0);
  });

  it('should backfill missing EnergyData fields during v8 upgrade', async () => {
    const dbName = `nexus-backfill-${Date.now()}`;

    // Create a v1 database with incomplete data (missing some fields)
    const legacyDb = await createLegacyV1Db(dbName);
    dbs.push(legacyDb);

    await legacyDb.table('energySnapshots').add({
      timestamp: 2000,
      gridPower: 100,
      pvPower: 200,
      // Missing: batteryPower, houseLoad, batterySoC, heatPumpPower, evPower, etc.
    });

    legacyDb.close();

    // Re-open with full schema
    const upgraded = new NexusDatabase(dbName);
    dbs.push(upgraded);
    await upgraded.open();

    const snapshots = await upgraded.energySnapshots.toArray();
    expect(snapshots).toHaveLength(1);

    const snap = snapshots[0];
    // Original values preserved
    expect(snap.gridPower).toBe(100);
    expect(snap.pvPower).toBe(200);
    // Missing fields backfilled with safe defaults
    expect(snap.batteryPower).toBe(0);
    expect(snap.houseLoad).toBe(0);
    expect(snap.batterySoC).toBe(0);
    expect(snap.heatPumpPower).toBe(0);
    expect(snap.evPower).toBe(0);
    expect(snap.gridVoltage).toBe(230);
    expect(snap.batteryVoltage).toBe(48);
    expect(snap.pvYieldToday).toBe(0);
    expect(snap.priceCurrent).toBe(0);
    expect(snap._schemaVersion).toBe(9);
  });

  it('should fix invalid offline action status during migration', async () => {
    const dbName = `nexus-offline-fix-${Date.now()}`;

    // Create a v2 database with an invalid action status
    const db = new Dexie(dbName);
    db.version(1).stores({
      energySnapshots: '++id, timestamp',
      settings: 'key',
    });
    db.version(2).stores({
      energySnapshots: '++id, timestamp',
      sankeySnapshots: '++id, timestamp',
      offlineActions: '++id, timestamp, status, type',
      cacheMetadata: 'key, timestamp, expiresAt, type',
      errorLogs: '++id, timestamp, severity',
      settings: 'key',
    });
    dbs.push(db);
    await db.open();

    // Insert an offline action with a corrupted status
    await db.table('offlineActions').add({
      type: 'ev-control',
      payload: { power: 7000 },
      timestamp: 3000,
      retries: 0,
      status: 'corrupted-value', // invalid status
    });

    db.close();

    // Re-open with full schema
    const upgraded = new NexusDatabase(dbName);
    dbs.push(upgraded);
    await upgraded.open();

    const actions: OfflineAction[] = await upgraded.offlineActions.toArray();
    expect(actions).toHaveLength(1);
    // Invalid status should be fixed to 'failed'
    expect(actions[0].status).toBe('failed');
  });
});

describe('checkMigrationHealth', () => {
  it('should report healthy for a fresh database', async () => {
    const db = createTestDb();
    dbs.push(db);
    await db.open();

    const result = await checkMigrationHealth(db);
    expect(result.ok).toBe(true);
    expect(result.currentVersion).toBe(DB_CURRENT_VERSION);
    expect(result.expectedVersion).toBe(DB_CURRENT_VERSION);
    expect(result.errors).toHaveLength(0);
    expect(result.tableCounts).toHaveProperty('energySnapshots', 0);
    expect(result.tableCounts).toHaveProperty('settings', 0);
    expect(result.tableCounts).toHaveProperty('shareLinks', 0);
  });

  it('should include correct table counts', async () => {
    const db = createTestDb();
    dbs.push(db);
    await db.open();

    await db.energySnapshots.add({
      timestamp: Date.now(),
      gridPower: 0,
      pvPower: 0,
      batteryPower: 0,
      houseLoad: 0,
      batterySoC: 0,
      heatPumpPower: 0,
      evPower: 0,
      gridVoltage: 230,
      batteryVoltage: 48,
      pvYieldToday: 0,
      priceCurrent: 0,
    });

    const result = await checkMigrationHealth(db);
    expect(result.ok).toBe(true);
    expect(result.tableCounts.energySnapshots).toBe(1);
  });
});

describe('Database Backup & Restore', () => {
  it('should export all table data', async () => {
    const db = createTestDb();
    dbs.push(db);
    await db.open();

    await db.energySnapshots.add({
      timestamp: 5000,
      gridPower: 100,
      pvPower: 200,
      batteryPower: 0,
      houseLoad: 300,
      batterySoC: 50,
      heatPumpPower: 0,
      evPower: 0,
      gridVoltage: 230,
      batteryVoltage: 48,
      pvYieldToday: 5,
      priceCurrent: 0.15,
    });

    const backup = await exportDatabaseBackup(db);
    expect(backup.version).toBe(DB_CURRENT_VERSION);
    expect(backup.timestamp).toBeTypeOf('number');
    expect(backup.tables.energySnapshots).toHaveLength(1);
    expect((backup.tables.energySnapshots[0] as EnergySnapshot).pvPower).toBe(200);
  });

  it('should restore data from backup', async () => {
    const db1 = createTestDb();
    dbs.push(db1);
    await db1.open();

    // Add data
    await db1.energySnapshots.add({
      timestamp: 6000,
      gridPower: 400,
      pvPower: 3000,
      batteryPower: -500,
      houseLoad: 2500,
      batterySoC: 80,
      heatPumpPower: 0,
      evPower: 0,
      gridVoltage: 232,
      batteryVoltage: 52,
      pvYieldToday: 12,
      priceCurrent: 0.22,
    });

    const backup = await exportDatabaseBackup(db1);
    db1.close();

    // Create a new DB and restore into it
    const db2 = createTestDb();
    dbs.push(db2);
    await db2.open();

    // Verify empty before restore
    expect(await db2.energySnapshots.count()).toBe(0);

    await restoreDatabaseBackup(backup, db2);

    // Verify data restored
    const snaps = await db2.energySnapshots.toArray();
    expect(snaps).toHaveLength(1);
    expect(snaps[0].pvPower).toBe(3000);
    expect(snaps[0].batterySoC).toBe(80);
  });

  it('should clear existing data before restoring', async () => {
    const db = createTestDb();
    dbs.push(db);
    await db.open();

    // Add pre-existing data
    await db.energySnapshots.add({
      timestamp: 7000,
      gridPower: 999,
      pvPower: 0,
      batteryPower: 0,
      houseLoad: 0,
      batterySoC: 0,
      heatPumpPower: 0,
      evPower: 0,
      gridVoltage: 230,
      batteryVoltage: 48,
      pvYieldToday: 0,
      priceCurrent: 0,
    });

    const backup = await exportDatabaseBackup(db);

    // Add more data after backup
    await db.energySnapshots.add({
      timestamp: 8000,
      gridPower: 111,
      pvPower: 0,
      batteryPower: 0,
      houseLoad: 0,
      batterySoC: 0,
      heatPumpPower: 0,
      evPower: 0,
      gridVoltage: 230,
      batteryVoltage: 48,
      pvYieldToday: 0,
      priceCurrent: 0,
    });

    expect(await db.energySnapshots.count()).toBe(2);

    // Restore should clear the extra record
    await restoreDatabaseBackup(backup, db);
    expect(await db.energySnapshots.count()).toBe(1);
    const snaps = await db.energySnapshots.toArray();
    expect(snaps[0].gridPower).toBe(999);
  });
});
