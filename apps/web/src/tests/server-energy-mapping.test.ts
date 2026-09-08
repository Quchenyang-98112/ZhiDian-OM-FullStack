/**
 * server-energy-mapping — flat EnergyData → nested UnifiedEnergyModel projection.
 */

import type { EnergyData } from '@nexus-hems/shared-types';
import { describe, expect, it } from 'vitest';
import { mapServerEnergyDataToUnified } from '../core/server-energy-mapping';

const baseData: EnergyData = {
  gridPower: 1200,
  pvPower: 3400,
  batteryPower: -800, // discharging
  houseLoad: 2600,
  batterySoC: 72,
  heatPumpPower: 900,
  evPower: 1100,
  gridVoltage: 230,
  batteryVoltage: 51.2,
  pvYieldToday: 18.5,
  priceCurrent: 0.284,
};

describe('mapServerEnergyDataToUnified', () => {
  it('projects every flat field into the matching nested slot', () => {
    const model = mapServerEnergyDataToUnified(baseData);

    expect(model.pv).toEqual({ totalPowerW: 3400, yieldTodayKWh: 18.5 });
    expect(model.grid).toEqual({ powerW: 1200, voltageV: 230 });
    expect(model.battery?.powerW).toBe(-800);
    expect(model.battery?.socPercent).toBe(72);
    expect(model.battery?.voltageV).toBe(51.2);
    expect(model.load).toEqual({
      totalPowerW: 2600,
      heatPumpPowerW: 900,
      evPowerW: 1100,
      otherPowerW: 600, // 2600 - 900 - 1100
    });
    expect(model.tariff).toEqual({ currentPriceEurKWh: 0.284, provider: 'none' });
  });

  it('derives battery current from power / voltage', () => {
    const model = mapServerEnergyDataToUnified(baseData);
    // -800 W / 51.2 V ≈ -15.625 A
    expect(model.battery?.currentA).toBeCloseTo(-800 / 51.2, 5);
  });

  it('returns 0 current when battery voltage is non-positive (no divide-by-zero)', () => {
    const model = mapServerEnergyDataToUnified({ ...baseData, batteryVoltage: 0 });
    expect(model.battery?.currentA).toBe(0);
    expect(Number.isFinite(model.battery?.currentA ?? Number.NaN)).toBe(true);
  });

  it('clamps otherPowerW to 0 when sub-loads exceed the house total', () => {
    const model = mapServerEnergyDataToUnified({
      ...baseData,
      houseLoad: 500,
      heatPumpPower: 900,
      evPower: 1100,
    });
    expect(model.load?.otherPowerW).toBe(0);
  });

  it('stamps a positive integer-friendly timestamp', () => {
    const model = mapServerEnergyDataToUnified(baseData);
    expect(typeof model.timestamp).toBe('number');
    expect(model.timestamp).toBeGreaterThan(0);
  });

  it('omits fields absent from the flat wire format (evCharger, knx)', () => {
    const model = mapServerEnergyDataToUnified(baseData);
    expect(model.evCharger).toBeUndefined();
    expect(model.knx).toBeUndefined();
  });
});
