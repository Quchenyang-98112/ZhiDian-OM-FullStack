/**
 * LiveEnergyAggregator (HIGH-17) unit tests.
 *
 * Verifies the EventBus → EnergyData folding, non-negative clamping, freshness
 * gating, and the resolveBroadcastData live/mock selection in energy.ws.ts.
 */

import type {
  EnergyRole,
  MetricType,
  ProtocolType,
  UnifiedEnergyDatapoint,
} from '@nexus-hems/shared-types';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mockData } from '../data/mock-data.js';
import { LiveEnergyAggregator } from '../services/LiveEnergyAggregator.js';
import { resolveBroadcastData } from '../ws/energy.ws.js';

function dp(
  role: EnergyRole | undefined,
  metric: MetricType,
  value: number,
  timestamp = 1_000_000,
): UnifiedEnergyDatapoint {
  const base = {
    timestamp,
    deviceId: 'test-device',
    protocol: 'modbus-sunspec' as ProtocolType,
    metric,
    value,
    qualityIndicator: 'GOOD' as const,
  };
  return role ? { ...base, role } : base;
}

describe('LiveEnergyAggregator', () => {
  let agg: LiveEnergyAggregator;

  beforeEach(() => {
    agg = new LiveEnergyAggregator();
  });

  it('starts with no live data and a zeroed snapshot', () => {
    expect(agg.hasLiveData(1_000_000)).toBe(false);
    expect(agg.getSnapshot()).toMatchObject({ pvPower: 0, batteryPower: 0, gridPower: 0 });
  });

  it('folds role-tagged datapoints into the matching EnergyData fields', () => {
    agg.onBatch([
      dp('pv', 'POWER_W', 3200),
      dp('battery', 'POWER_W', -450),
      dp('battery', 'SOC_PERCENT', 72),
      dp('battery', 'VOLTAGE_V', 51.4),
      dp('grid', 'POWER_W', -1200),
      dp('load', 'POWER_W', 1800),
      dp('ev', 'POWER_W', 4000),
      dp('heatpump', 'POWER_W', 900),
      dp('pv', 'ENERGY_KWH', 14.2),
    ]);

    const snap = agg.getSnapshot();
    expect(snap.pvPower).toBe(3200);
    expect(snap.batteryPower).toBe(-450); // discharge stays negative
    expect(snap.batterySoC).toBe(72);
    expect(snap.batteryVoltage).toBeCloseTo(51.4);
    expect(snap.gridPower).toBe(-1200); // export stays negative
    expect(snap.houseLoad).toBe(1800);
    expect(snap.evPower).toBe(4000);
    expect(snap.heatPumpPower).toBe(900);
    expect(snap.pvYieldToday).toBeCloseTo(14.2);
  });

  it('clamps non-negative fields and bounds SoC to 0..100', () => {
    agg.onBatch([
      dp('pv', 'POWER_W', -50), // must not go negative
      dp('load', 'POWER_W', -10),
      dp('battery', 'SOC_PERCENT', 140), // clamp to 100
    ]);
    const snap = agg.getSnapshot();
    expect(snap.pvPower).toBe(0);
    expect(snap.houseLoad).toBe(0);
    expect(snap.batterySoC).toBe(100);
  });

  it('ignores datapoints without a role', () => {
    agg.onBatch([dp(undefined, 'POWER_W', 5000)]);
    expect(agg.hasLiveData(1_000_000)).toBe(false);
    expect(agg.getSnapshot().pvPower).toBe(0);
  });

  it('ignores unmapped role/metric combinations', () => {
    // pv has no VOLTAGE_V mapping; load has no SOC_PERCENT mapping
    agg.onBatch([dp('pv', 'VOLTAGE_V', 400), dp('load', 'SOC_PERCENT', 50)]);
    expect(agg.hasLiveData(1_000_000)).toBe(false);
  });

  it('ignores unknown energy roles', () => {
    agg.onBatch([
      {
        timestamp: 1_000_000,
        deviceId: 'tariff-meter',
        protocol: 'modbus-sunspec',
        metric: 'POWER_W',
        value: 100,
        qualityIndicator: 'GOOD',
        role: 'tariff' as EnergyRole,
      },
    ]);
    expect(agg.getSnapshot().pvPower).toBe(0);
    expect(agg.hasLiveData(1_000_000)).toBe(false);
  });

  it('reports fresh data only inside the freshness window', () => {
    const agg2 = new LiveEnergyAggregator(30_000);
    agg2.onBatch([dp('pv', 'POWER_W', 1000, 1_000_000)]);
    expect(agg2.hasLiveData(1_000_000)).toBe(true);
    expect(agg2.hasLiveData(1_020_000)).toBe(true); // 20 s later — still fresh
    expect(agg2.hasLiveData(1_040_000)).toBe(false); // 40 s later — stale
  });

  it('returns a defensive copy from getSnapshot', () => {
    agg.onBatch([dp('pv', 'POWER_W', 1000)]);
    const snap = agg.getSnapshot();
    snap.pvPower = 99;
    expect(agg.getSnapshot().pvPower).toBe(1000);
  });

  it('folds grid voltage into gridVoltage field', () => {
    agg.onBatch([dp('grid', 'VOLTAGE_V', 231.2)]);
    expect(agg.getSnapshot().gridVoltage).toBeCloseTo(231.2);
  });

  it('reset() clears the snapshot and freshness', () => {
    agg.onBatch([dp('pv', 'POWER_W', 1000)]);
    agg.reset();
    expect(agg.hasLiveData(1_000_000)).toBe(false);
    expect(agg.getSnapshot().pvPower).toBe(0);
  });
});

describe('resolveBroadcastData (energy.ws)', () => {
  const origMode = process.env.ADAPTER_MODE;
  const origAllow = process.env.ALLOW_LIVE_HARDWARE;

  afterEach(() => {
    if (origMode === undefined) delete process.env.ADAPTER_MODE;
    else process.env.ADAPTER_MODE = origMode;
    if (origAllow === undefined) delete process.env.ALLOW_LIVE_HARDWARE;
    else process.env.ALLOW_LIVE_HARDWARE = origAllow;
  });

  it('returns mock data when no aggregator is provided', () => {
    expect(resolveBroadcastData()).toBe(mockData);
  });

  it('returns mock data in mock mode even when the aggregator has fresh data', () => {
    process.env.ADAPTER_MODE = 'mock';
    delete process.env.ALLOW_LIVE_HARDWARE;
    const agg = new LiveEnergyAggregator();
    agg.onBatch([dp('pv', 'POWER_W', 1234, Date.now())]);
    expect(resolveBroadcastData(agg)).toBe(mockData);
  });

  it('returns mock data in live mode until fresh live data exists', () => {
    process.env.ADAPTER_MODE = 'live';
    process.env.ALLOW_LIVE_HARDWARE = 'true';
    const agg = new LiveEnergyAggregator();
    expect(resolveBroadcastData(agg)).toBe(mockData); // no data yet
  });

  it('returns the live snapshot in live mode once fresh data exists', () => {
    process.env.ADAPTER_MODE = 'live';
    process.env.ALLOW_LIVE_HARDWARE = 'true';
    const agg = new LiveEnergyAggregator();
    agg.onBatch([dp('pv', 'POWER_W', 4321, Date.now())]);
    const result = resolveBroadcastData(agg);
    expect(result).not.toBe(mockData);
    expect(result.pvPower).toBe(4321);
  });

  it('falls back to mock when a live snapshot fails EnergyData validation (R2)', () => {
    process.env.ADAPTER_MODE = 'live';
    process.env.ALLOW_LIVE_HARDWARE = 'true';
    // Stub aggregator that reports fresh data but emits an out-of-contract
    // snapshot (batterySoC > 100). resolveBroadcastData must not ship it.
    const badSnapshot = { ...mockData, batterySoC: 150 };
    const stub = {
      hasLiveData: () => true,
      getSnapshot: () => badSnapshot,
    } as unknown as LiveEnergyAggregator;
    expect(resolveBroadcastData(stub)).toBe(mockData);
  });
});
