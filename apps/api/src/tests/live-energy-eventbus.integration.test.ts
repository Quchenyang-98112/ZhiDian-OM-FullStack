/**
 * P2-01 — EventBus → LiveEnergyAggregator integration (multi-adapter fold).
 *
 * Simulates Modbus PV + MQTT battery + heatpump adapters emitting role-tagged
 * datapoints into the shared EventBus; verifies the aggregator snapshot after flush.
 */

import type {
  EnergyRole,
  MetricType,
  ProtocolType,
  UnifiedEnergyDatapoint,
} from '@nexus-hems/shared-types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventBus } from '../core/EventBus.js';
import { LiveEnergyAggregator } from '../services/LiveEnergyAggregator.js';
import { resolveBroadcastData } from '../ws/energy.ws.js';

function dp(
  protocol: ProtocolType,
  role: EnergyRole,
  metric: MetricType,
  value: number,
  deviceId: string,
  timestamp = 2_000_000,
): UnifiedEnergyDatapoint {
  return {
    timestamp,
    deviceId,
    protocol,
    metric,
    value,
    qualityIndicator: 'GOOD',
    role,
  };
}

describe('EventBus → LiveEnergyAggregator (multi-adapter)', () => {
  let bus: EventBus;
  let agg: LiveEnergyAggregator;

  beforeEach(() => {
    vi.useFakeTimers();
    bus = new EventBus();
    agg = new LiveEnergyAggregator(30_000);
    bus.subscribe('live-energy', agg);
  });

  afterEach(() => {
    bus.destroy();
    agg.reset();
    vi.useRealTimers();
  });

  it('folds a multi-protocol batch into one EnergyData snapshot', () => {
    // Modbus inverter (PV)
    bus.emit(dp('modbus-sunspec', 'pv', 'POWER_W', 4500, 'inverter-01'));
    bus.emit(dp('modbus-sunspec', 'pv', 'ENERGY_KWH', 18.5, 'inverter-01'));
    // Victron MQTT (battery)
    bus.emit(dp('victron-mqtt', 'battery', 'POWER_W', -800, 'cerbo-bat'));
    bus.emit(dp('victron-mqtt', 'battery', 'SOC_PERCENT', 65, 'cerbo-bat'));
    bus.emit(dp('victron-mqtt', 'grid', 'POWER_W', 200, 'cerbo-grid'));
    bus.emit(dp('victron-mqtt', 'grid', 'VOLTAGE_V', 230.5, 'cerbo-grid'));
    // Heat pump backend
    bus.emit(dp('heatpump', 'heatpump', 'POWER_W', 1200, 'hp-viessmann'));
    // evcc wallbox
    bus.emit(dp('evcc', 'ev', 'POWER_W', 7400, 'wallbox-1'));
    // House load
    bus.emit(dp('knx', 'load', 'POWER_W', 2100, 'knx-main'));

    vi.advanceTimersByTime(500);

    const snap = agg.getSnapshot();
    expect(snap.pvPower).toBe(4500);
    expect(snap.pvYieldToday).toBeCloseTo(18.5);
    expect(snap.batteryPower).toBe(-800);
    expect(snap.batterySoC).toBe(65);
    expect(snap.gridPower).toBe(200);
    expect(snap.gridVoltage).toBeCloseTo(230.5);
    expect(snap.heatPumpPower).toBe(1200);
    expect(snap.evPower).toBe(7400);
    expect(snap.houseLoad).toBe(2100);
    expect(agg.hasLiveData(2_000_000)).toBe(true);
  });

  it('latest value wins when multiple adapters update the same role', () => {
    bus.emit(dp('modbus-sunspec', 'pv', 'POWER_W', 1000, 'inv-a', 2_000_000));
    vi.advanceTimersByTime(500);
    bus.emit(dp('victron-mqtt', 'pv', 'POWER_W', 2500, 'cerbo-pv', 2_000_100));
    vi.advanceTimersByTime(500);

    expect(agg.getSnapshot().pvPower).toBe(2500);
  });

  it('resolveBroadcastData returns live snapshot after EventBus fold in live mode', () => {
    const origMode = process.env.ADAPTER_MODE;
    const origAllow = process.env.ALLOW_LIVE_HARDWARE;
    process.env.ADAPTER_MODE = 'live';
    process.env.ALLOW_LIVE_HARDWARE = 'true';

    try {
      bus.emit(dp('modbus-sunspec', 'pv', 'POWER_W', 9999, 'inv', Date.now()));
      vi.advanceTimersByTime(500);

      const result = resolveBroadcastData(agg);
      expect(result.pvPower).toBe(9999);
    } finally {
      if (origMode === undefined) delete process.env.ADAPTER_MODE;
      else process.env.ADAPTER_MODE = origMode;
      if (origAllow === undefined) delete process.env.ALLOW_LIVE_HARDWARE;
      else process.env.ALLOW_LIVE_HARDWARE = origAllow;
    }
  });
});
