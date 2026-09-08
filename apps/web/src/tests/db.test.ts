import { beforeEach, describe, expect, it } from 'vitest';
import 'fake-indexeddb/auto';
import { nexusDb, persistSnapshot } from '../lib/db';
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

describe('Database (Dexie)', () => {
  beforeEach(async () => {
    await nexusDb.energySnapshots.clear();
  });

  it('should persist energy snapshot', async () => {
    await persistSnapshot(mockEnergy);
    const count = await nexusDb.energySnapshots.count();
    expect(count).toBe(1);
  });

  it('should store snapshot with timestamp', async () => {
    await persistSnapshot(mockEnergy);
    const snap = await nexusDb.energySnapshots.toCollection().first();
    expect(snap?.pvPower).toBe(3500);
    expect(snap?.timestamp).toBeTypeOf('number');
  });

  it('should have aiKeys table', () => {
    expect(nexusDb.aiKeys).toBeDefined();
  });
});
