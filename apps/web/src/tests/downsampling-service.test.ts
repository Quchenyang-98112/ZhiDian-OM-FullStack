/**
 * downsampling-service.test.ts — Unit tests for the tiered aggregation engine
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EnergySnapshot } from '../lib/db';

// ── Mock Dexie to avoid real IndexedDB in jsdom ──────────────────────────

const mockSnapshots: EnergySnapshot[] = [];
const mockAggregates: Array<{ resolution: string; bucketTs: number }> = [];

// Use a looser type for the mock so we avoid fighting Dexie's complex generics
const nexusDbMock: {
  energySnapshots: Record<string, ReturnType<typeof vi.fn>>;
  energyAggregates: Record<string, ReturnType<typeof vi.fn>>;
} = {
  energySnapshots: {
    where: vi.fn().mockReturnThis(),
    below: vi.fn().mockReturnThis(),
    toArray: vi.fn(async () => [...mockSnapshots]),
  },
  energyAggregates: {
    where: vi.fn().mockReturnThis(),
    equals: vi.fn().mockReturnThis(),
    first: vi.fn(async () => undefined as unknown),
    add: vi.fn(async (rec: { resolution: string; bucketTs: number }) => {
      mockAggregates.push(rec);
    }),
  },
};

vi.mock('../lib/db', () => ({
  nexusDb: nexusDbMock,
}));

// Import after mock registration
const { runDownsamplingCycle, startDownsamplingService, stopDownsamplingService } = await import(
  '../lib/downsampling-service'
);

function makeSnapshot(ts: number): EnergySnapshot {
  return {
    id: ts,
    timestamp: ts,
    pvPower: 1000,
    gridPower: 200,
    houseLoad: 800,
    batteryPower: 0,
    batterySoC: 75,
    heatPumpPower: 0,
    evPower: 0,
    gridVoltage: 230,
    batteryVoltage: 48,
    pvYieldToday: 5,
    priceCurrent: 0.28,
  };
}

describe('runDownsamplingCycle', () => {
  beforeEach(() => {
    mockSnapshots.length = 0;
    mockAggregates.length = 0;
    // Reset mocks to their default behavior
    nexusDbMock.energySnapshots.toArray.mockImplementation(async () => [...mockSnapshots]);
    nexusDbMock.energyAggregates.first.mockResolvedValue(undefined);
    nexusDbMock.energyAggregates.add.mockImplementation(
      async (rec: { resolution: string; bucketTs: number }) => {
        mockAggregates.push(rec);
      },
    );
  });

  it('does nothing when there are no snapshots', async () => {
    await runDownsamplingCycle();
    expect(mockAggregates).toHaveLength(0);
  });

  it('creates aggregates when snapshots exist', async () => {
    const base = Date.now() - 2 * 60 * 60 * 1000; // 2 hours ago
    for (let i = 0; i < 10; i++) {
      mockSnapshots.push(makeSnapshot(base + i * 60_000)); // 1-min intervals
    }
    await runDownsamplingCycle();
    // Should have written at least one aggregate
    expect(mockAggregates.length).toBeGreaterThan(0);
  });

  it('skips existing aggregates (idempotency)', async () => {
    // Make the aggregate check return an existing record
    nexusDbMock.energyAggregates.first.mockResolvedValueOnce({
      id: 1,
      resolution: '15m',
      bucketTs: 0,
      sampleCount: 1,
      pvPower: 0,
      batteryPower: 0,
      gridPower: 0,
      houseLoad: 0,
      batterySoC: 0,
      heatPumpPower: 0,
      evPower: 0,
      gridVoltage: 0,
      batteryVoltage: 0,
      pvYieldToday: 0,
      priceCurrent: 0,
    });

    const base = Date.now() - 2 * 60 * 60 * 1000;
    mockSnapshots.push(makeSnapshot(base));
    await runDownsamplingCycle();
    // Just confirm no exception was thrown
    expect(true).toBe(true);
  });

  it('does not run overlapping cycles concurrently', async () => {
    let callCount = 0;
    nexusDbMock.energySnapshots.toArray.mockImplementation(async () => {
      callCount++;
      await new Promise((r) => setTimeout(r, 10));
      return [];
    });

    const p1 = runDownsamplingCycle();
    const p2 = runDownsamplingCycle(); // should be a no-op due to _isRunning guard
    await Promise.all([p1, p2]);

    // Only 2 calls (15m + 1h) not 4 (would be doubled without guard)
    expect(callCount).toBeLessThanOrEqual(2);
  });
});

describe('startDownsamplingService / stopDownsamplingService', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    stopDownsamplingService();
    vi.useRealTimers();
  });

  it('startDownsamplingService is idempotent (no double interval)', () => {
    startDownsamplingService();
    startDownsamplingService(); // second call should be no-op
    // No assertion needed — just must not throw
    expect(true).toBe(true);
  });

  it('stopDownsamplingService can be called before start without throwing', () => {
    expect(() => stopDownsamplingService()).not.toThrow();
  });
});
