/**
 * LiveEnergyAggregator (HIGH-17) — EventBus → WebSocket bridge.
 *
 * The backend protocol adapters (Modbus, MQTT) emit metric-centric
 * `UnifiedEnergyDatapoint`s into the EventBus, but the browser consumes the
 * role-centric `EnergyData` shape (pvPower, batteryPower, …). Historically the
 * WebSocket gateway never subscribed to the EventBus, so real adapter data never
 * reached the UI and "live mode" showed mock data.
 *
 * This subscriber folds role-tagged datapoints into a single latest-value
 * `EnergyData` snapshot. `energy.ws.ts` broadcasts that snapshot when the
 * effective adapter mode is `live` AND fresh live data exists; otherwise it
 * falls back to the mock stream. See ADR-018 and docs/Audit-Report-2026-07-02.md.
 *
 * Only role-tagged datapoints contribute (see `EnergyRole`). Datapoints without
 * a `role`, or with an unmapped role/metric pair, are ignored here (they still
 * flow to InfluxDB + the optimizer via the other EventBus subscribers).
 */

import type {
  EnergyData,
  EventBusSubscriber,
  UnifiedEnergyDatapoint,
} from '@nexus-hems/shared-types';

/** A datapoint older than this (relative to now) no longer counts as "live". */
const DEFAULT_FRESH_WINDOW_MS = 30_000;

/** Clamp to non-negative — several `EnergyData` fields forbid negatives. */
function nonNeg(value: number): number {
  return value < 0 ? 0 : value;
}

/** Clamp to a closed range (used for battery SoC 0–100). */
function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function createEmptySnapshot(): EnergyData {
  return {
    gridPower: 0,
    pvPower: 0,
    batteryPower: 0,
    houseLoad: 0,
    batterySoC: 0,
    heatPumpPower: 0,
    evPower: 0,
    gridVoltage: 0,
    batteryVoltage: 0,
    pvYieldToday: 0,
    priceCurrent: 0,
  };
}

export class LiveEnergyAggregator implements EventBusSubscriber {
  private snapshot: EnergyData = createEmptySnapshot();
  private lastUpdateMs = 0;
  private readonly freshWindowMs: number;

  constructor(freshWindowMs: number = DEFAULT_FRESH_WINDOW_MS) {
    this.freshWindowMs = freshWindowMs;
  }

  /** EventBusSubscriber contract — called on every 500 ms flush. */
  onBatch(datapoints: UnifiedEnergyDatapoint[]): void {
    for (const dp of datapoints) {
      if (this.applyDatapoint(dp)) {
        this.lastUpdateMs = Math.max(this.lastUpdateMs, dp.timestamp);
      }
    }
  }

  /**
   * Fold one datapoint into the snapshot. Returns true if it mapped to a field
   * (and therefore counts as fresh live data), false if it was ignored.
   */
  private applyDatapoint(dp: UnifiedEnergyDatapoint): boolean {
    const { role, metric, value } = dp;
    if (role === undefined) return false;

    switch (role) {
      case 'pv':
        if (metric === 'POWER_W') return this.set('pvPower', nonNeg(value));
        if (metric === 'ENERGY_KWH') return this.set('pvYieldToday', nonNeg(value));
        return false;
      case 'battery':
        if (metric === 'POWER_W') return this.set('batteryPower', value);
        if (metric === 'SOC_PERCENT') return this.set('batterySoC', clamp(value, 0, 100));
        if (metric === 'VOLTAGE_V') return this.set('batteryVoltage', nonNeg(value));
        return false;
      case 'grid':
        if (metric === 'POWER_W') return this.set('gridPower', value);
        if (metric === 'VOLTAGE_V') return this.set('gridVoltage', nonNeg(value));
        return false;
      case 'load':
        if (metric === 'POWER_W') return this.set('houseLoad', nonNeg(value));
        return false;
      case 'ev':
        if (metric === 'POWER_W') return this.set('evPower', nonNeg(value));
        return false;
      case 'heatpump':
        if (metric === 'POWER_W') return this.set('heatPumpPower', nonNeg(value));
        return false;
      default:
        return false;
    }
  }

  private set(field: keyof EnergyData, value: number): boolean {
    this.snapshot[field] = value;
    return true;
  }

  /** True when at least one mapped datapoint arrived within the fresh window. */
  hasLiveData(now: number = Date.now()): boolean {
    return this.lastUpdateMs > 0 && now - this.lastUpdateMs <= this.freshWindowMs;
  }

  /** Defensive copy of the current live snapshot. */
  getSnapshot(): EnergyData {
    return { ...this.snapshot };
  }

  /** Unix ms of the most recent mapped datapoint (0 if none yet). */
  getLastUpdateMs(): number {
    return this.lastUpdateMs;
  }

  /** Clear all accumulated state (used by tests). */
  reset(): void {
    this.snapshot = createEmptySnapshot();
    this.lastUpdateMs = 0;
  }
}

/** Singleton shared by the EventBus subscription and the WebSocket gateway. */
export const liveEnergyAggregator = new LiveEnergyAggregator();
