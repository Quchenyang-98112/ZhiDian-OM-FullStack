/**
 * server-energy-mapping — flat backend `EnergyData` → nested `UnifiedEnergyModel`.
 *
 * The Express WebSocket gateway broadcasts the role-centric, FLAT `EnergyData`
 * snapshot (`gridPower`, `pvPower`, …) produced by `LiveEnergyAggregator`
 * (HIGH-17 / ADR-018). The frontend store (`useEnergyStore`) accumulates the
 * NESTED `UnifiedEnergyModel` shape (`pv`, `battery`, `grid`, `load`, …).
 *
 * These two shapes are structurally different, so a server frame cannot be
 * merged verbatim — it must be projected into the nested model first. This
 * pure function is that projection, kept separate so it can be unit-tested in
 * isolation and reused by the `useServerWebSocket` consumer.
 *
 * Fields absent from the flat wire format (`evCharger`, `knx`, granular grid
 * phases) are intentionally omitted — the resulting `Partial` merges
 * additively into whatever the store already holds.
 */

import type { EnergyData } from '@nexus-hems/shared-types';
import type { UnifiedEnergyModel } from './adapters/EnergyAdapter';

/**
 * Derive a plausible current (A) from power (W) and voltage (V).
 * Returns 0 when voltage is non-positive to avoid divide-by-zero / Infinity.
 */
function deriveCurrentA(powerW: number, voltageV: number): number {
  if (!Number.isFinite(voltageV) || voltageV <= 0) return 0;
  const current = powerW / voltageV;
  return Number.isFinite(current) ? current : 0;
}

/**
 * Project a flat backend `EnergyData` snapshot into a nested
 * `Partial<UnifiedEnergyModel>` suitable for `useEnergyStore.mergeData()`.
 *
 * Every nested sub-object is emitted complete (satisfying its Zod sub-schema)
 * so the merge never produces an under-specified branch.
 */
export function mapServerEnergyDataToUnified(data: EnergyData): Partial<UnifiedEnergyModel> {
  const otherLoad = Math.max(0, data.houseLoad - data.heatPumpPower - data.evPower);

  return {
    timestamp: Date.now(),
    pv: {
      totalPowerW: data.pvPower,
      yieldTodayKWh: data.pvYieldToday,
    },
    battery: {
      powerW: data.batteryPower,
      socPercent: data.batterySoC,
      voltageV: data.batteryVoltage,
      currentA: deriveCurrentA(data.batteryPower, data.batteryVoltage),
    },
    grid: {
      powerW: data.gridPower,
      voltageV: data.gridVoltage,
    },
    load: {
      totalPowerW: data.houseLoad,
      heatPumpPowerW: data.heatPumpPower,
      evPowerW: data.evPower,
      otherPowerW: otherLoad,
    },
    tariff: {
      currentPriceEurKWh: data.priceCurrent,
      provider: 'none',
    },
  };
}
