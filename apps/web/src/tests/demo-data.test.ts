import { describe, expect, it } from 'vitest';
import { DEMO_ENERGY_DATA, getDisplayData } from '../lib/demo-data';
import type { EnergyData } from '../types';

const ZERO_DATA: EnergyData = {
  gridPower: 0,
  pvPower: 0,
  batteryPower: 0,
  houseLoad: 0,
  batterySoC: 0,
  heatPumpPower: 0,
  evPower: 0,
  gridVoltage: 230,
  batteryVoltage: 51.2,
  pvYieldToday: 0,
  priceCurrent: 0.18,
};

const REAL_DATA: EnergyData = {
  gridPower: 500,
  pvPower: 4200,
  batteryPower: -1000,
  houseLoad: 2700,
  batterySoC: 65,
  heatPumpPower: 800,
  evPower: 0,
  gridVoltage: 231,
  batteryVoltage: 52.0,
  pvYieldToday: 18.5,
  priceCurrent: 0.22,
};

describe('Demo Data', () => {
  it('should have realistic demo values', () => {
    expect(DEMO_ENERGY_DATA.pvPower).toBeGreaterThan(0);
    expect(DEMO_ENERGY_DATA.houseLoad).toBeGreaterThan(0);
    expect(DEMO_ENERGY_DATA.batterySoC).toBeGreaterThan(0);
    expect(DEMO_ENERGY_DATA.batterySoC).toBeLessThanOrEqual(100);
    expect(DEMO_ENERGY_DATA.gridVoltage).toBeGreaterThan(200);
  });

  it('should return real data when connected', () => {
    const result = getDisplayData(REAL_DATA, true);
    expect(result).toBe(REAL_DATA);
  });

  it('should return demo data when not connected and zero data', () => {
    const result = getDisplayData(ZERO_DATA, false);
    expect(result).toBe(DEMO_ENERGY_DATA);
  });

  it('should return store data when not connected but has real data', () => {
    const result = getDisplayData(REAL_DATA, false);
    expect(result).toBe(REAL_DATA);
  });

  it('should have energy balance (PV covers load)', () => {
    // Demo scenario: PV (7850) covers house (3180) + HP (850) + EV (3700) + battery (2100) - grid export (1420)
    expect(DEMO_ENERGY_DATA.pvPower).toBeGreaterThan(DEMO_ENERGY_DATA.houseLoad);
  });
});
