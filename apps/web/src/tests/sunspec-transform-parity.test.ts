/**
 * MED-12 — SunSpec worker↔adapter parity golden fixtures.
 *
 * `ModbusSunSpecAdapter` and `adapter-worker` both delegate scalar parsing to
 * `sunspec-transforms.ts`; these tests lock the shared contract.
 */

import { describe, expect, it } from 'vitest';
import {
  mergeSunSpecRegistersToUnified,
  parseSunSpecBatteryScalars,
  parseSunSpecInverterScalars,
  parseSunSpecMeterScalars,
} from '../core/sunspec-transforms';

describe('sunspec-transform parity (MED-12)', () => {
  it('parses inverter registers with scale factors', () => {
    const raw = { W: 100, W_SF: 1, WH: 5000, WH_SF: 0, PhVphA: 230, A: 4.3, Hz: 50, St: 4 };
    expect(parseSunSpecInverterScalars(raw)).toEqual({
      totalPowerW: 1000,
      yieldTodayKWh: 5,
      voltageV: 230,
      currentA: 4.3,
      frequencyHz: 50,
      state: 4,
    });
  });

  it('parses battery registers with signed power and SoC scale', () => {
    const raw = {
      W: -250,
      W_SF: 1,
      SoC: 785,
      SoC_SF: -1,
      V: 51.2,
      A: -4.8,
      TmpBdy: 22,
      CycCnt: 412,
      SoH: 98,
    };
    expect(parseSunSpecBatteryScalars(raw)).toEqual({
      powerW: -2500,
      socPercent: 78.5,
      voltageV: 51.2,
      currentA: -4.8,
      temperatureC: 22,
      cycleCount: 412,
      stateOfHealthPercent: 98,
    });
  });

  it('parses meter import/export energy with TotWh scale', () => {
    const raw = {
      W: 1500,
      W_SF: 0,
      PhV: 231,
      Hz: 49.9,
      TotWhImp: 12_000,
      TotWhExp: 3400,
      TotWh_SF: -1,
    };
    expect(parseSunSpecMeterScalars(raw)).toEqual({
      powerW: 1500,
      voltageV: 231,
      frequencyHz: 49.9,
      energyImportKWh: 1.2,
      energyExportKWh: 0.34,
    });
  });

  it('merges inverter, battery, and meter payloads into a unified partial model', () => {
    const model = mergeSunSpecRegistersToUnified({
      inverter: { W: 100, W_SF: 1, WH: 5000, WH_SF: 0 },
      battery: { W: -200, SoC: 80, W_SF: 0, SoC_SF: 0 },
      meter: { W: 1500, W_SF: 0, TotWhImp: 12_000, TotWh_SF: -1 },
    });
    expect(model.pv?.totalPowerW).toBe(1000);
    expect(model.battery?.socPercent).toBe(80);
    expect(model.grid?.energyImportKWh).toBe(1.2);
    expect(model.timestamp).toBeTypeOf('number');
  });

  it('treats zero scale factor as identity (adapter-worker edge case)', () => {
    const raw = { W: 3200, W_SF: 0, WH: 18_500, WH_SF: 0 };
    expect(parseSunSpecInverterScalars(raw)).toMatchObject({
      totalPowerW: 3200,
      yieldTodayKWh: 18.5,
    });
  });
});
