/**
 * Shared SunSpec register → scalar field transforms.
 *
 * Used by `adapter-worker.ts` (off-thread) and `ModbusSunSpecAdapter` (main thread)
 * so MED-12 parity is enforced by a single code path before worker activation.
 */

import type { BatteryData, GridData, PVData, UnifiedEnergyModel } from './adapters/EnergyAdapter';

export function applySunSpecScaleFactor(value: number, sf: number | undefined): number {
  if (sf === undefined || sf === 0) return value;
  return value * 10 ** sf;
}

export type SunSpecInverterScalars = {
  totalPowerW: number;
  yieldTodayKWh: number;
  voltageV?: number;
  currentA?: number;
  frequencyHz?: number;
  state?: number;
};

export type SunSpecBatteryScalars = {
  powerW: number;
  socPercent: number;
  voltageV?: number;
  currentA?: number;
  temperatureC?: number;
  cycleCount?: number;
  stateOfHealthPercent?: number;
};

export type SunSpecMeterScalars = {
  powerW: number;
  voltageV?: number;
  frequencyHz?: number;
  energyImportKWh?: number;
  energyExportKWh?: number;
};

function num(value: unknown, fallback = 0): number {
  return value == null ? fallback : Number(value);
}

function optionalNum(value: unknown): number | undefined {
  return value == null ? undefined : Number(value);
}

/** Parse SunSpec Model 103/124 inverter scalar registers. */
export function parseSunSpecInverterScalars(raw: Record<string, unknown>): SunSpecInverterScalars {
  const W = num(raw.W);
  const WH = num(raw.WH);
  const W_SF = optionalNum(raw.W_SF);
  const WH_SF = optionalNum(raw.WH_SF);
  const voltageV = optionalNum(raw.PhVphA);
  const currentA = optionalNum(raw.A);
  const frequencyHz = optionalNum(raw.Hz);
  const state = optionalNum(raw.St);

  return {
    totalPowerW: applySunSpecScaleFactor(W, W_SF),
    yieldTodayKWh: applySunSpecScaleFactor(WH, WH_SF) / 1000,
    ...(voltageV !== undefined ? { voltageV } : {}),
    ...(currentA !== undefined ? { currentA } : {}),
    ...(frequencyHz !== undefined ? { frequencyHz } : {}),
    ...(state !== undefined ? { state } : {}),
  };
}

/** Parse SunSpec Model 124 battery scalar registers. */
export function parseSunSpecBatteryScalars(raw: Record<string, unknown>): SunSpecBatteryScalars {
  const W = num(raw.W);
  const SoC = num(raw.SoC);
  const W_SF = optionalNum(raw.W_SF);
  const SoC_SF = optionalNum(raw.SoC_SF);
  const voltageV = optionalNum(raw.V);
  const currentA = optionalNum(raw.A);
  const temperatureC = optionalNum(raw.TmpBdy);
  const cycleCount = optionalNum(raw.CycCnt);
  const stateOfHealthPercent = optionalNum(raw.SoH);

  return {
    powerW: applySunSpecScaleFactor(W, W_SF),
    socPercent: applySunSpecScaleFactor(SoC, SoC_SF),
    ...(voltageV !== undefined ? { voltageV } : {}),
    ...(currentA !== undefined ? { currentA } : {}),
    ...(temperatureC !== undefined ? { temperatureC } : {}),
    ...(cycleCount !== undefined ? { cycleCount } : {}),
    ...(stateOfHealthPercent !== undefined ? { stateOfHealthPercent } : {}),
  };
}

/** Parse SunSpec Model 201–204 meter scalar registers. */
export function parseSunSpecMeterScalars(raw: Record<string, unknown>): SunSpecMeterScalars {
  const W = num(raw.W);
  const W_SF = optionalNum(raw.W_SF);
  const TotWh_SF = optionalNum(raw.TotWh_SF);
  const TotWhImp = optionalNum(raw.TotWhImp);
  const TotWhExp = optionalNum(raw.TotWhExp);
  const voltageV = optionalNum(raw.PhV);
  const frequencyHz = optionalNum(raw.Hz);
  const energyImportKWh =
    TotWhImp != null ? applySunSpecScaleFactor(TotWhImp, TotWh_SF) / 1000 : undefined;
  const energyExportKWh =
    TotWhExp != null ? applySunSpecScaleFactor(TotWhExp, TotWh_SF) / 1000 : undefined;

  return {
    powerW: applySunSpecScaleFactor(W, W_SF),
    ...(voltageV !== undefined ? { voltageV } : {}),
    ...(frequencyHz !== undefined ? { frequencyHz } : {}),
    ...(energyImportKWh !== undefined ? { energyImportKWh } : {}),
    ...(energyExportKWh !== undefined ? { energyExportKWh } : {}),
  };
}

function parseInverterPvData(regs: Record<string, unknown>): PVData | undefined {
  const core = parseSunSpecInverterScalars(regs);
  const stringsRaw = regs.strings;
  const strings = Array.isArray(stringsRaw)
    ? stringsRaw.flatMap((entry, index) => {
        if (!entry || typeof entry !== 'object') return [];
        const s = entry as Record<string, unknown>;
        return [
          {
            id: index + 1,
            powerW: num(s.DCW),
            voltageV: num(s.DCV),
            currentA: num(s.DCA),
          },
        ];
      })
    : undefined;

  return {
    totalPowerW: core.totalPowerW,
    yieldTodayKWh: core.yieldTodayKWh,
    ...(strings && strings.length > 0 ? { strings } : {}),
  };
}

function parseBatteryData(regs: Record<string, unknown>): BatteryData | undefined {
  const core = parseSunSpecBatteryScalars(regs);
  return {
    powerW: core.powerW,
    socPercent: core.socPercent,
    voltageV: core.voltageV ?? num(regs.V),
    currentA: core.currentA ?? num(regs.A),
    temperatureC: core.temperatureC,
    cycleCount: core.cycleCount,
    stateOfHealthPercent: core.stateOfHealthPercent,
  };
}

function parseGridData(regs: Record<string, unknown>): GridData | undefined {
  const core = parseSunSpecMeterScalars(regs);
  const phasesRaw = regs.phases;
  const phases = Array.isArray(phasesRaw)
    ? phasesRaw.flatMap((entry) => {
        if (!entry || typeof entry !== 'object') return [];
        const p = entry as Record<string, unknown>;
        return [
          {
            voltageV: num(p.PhV),
            currentA: num(p.A),
            powerW: num(p.W),
          },
        ];
      })
    : undefined;

  return {
    powerW: core.powerW,
    voltageV: core.voltageV ?? num(regs.PhV),
    frequencyHz: core.frequencyHz,
    energyImportKWh: core.energyImportKWh,
    energyExportKWh: core.energyExportKWh,
    ...(phases && phases.length > 0 ? { phases } : {}),
  };
}

/**
 * Merge optional SunSpec register payloads into a partial unified model.
 * Shared by `ModbusSunSpecAdapter.poll()` and the adapter worker (MED-12).
 */
export function mergeSunSpecRegistersToUnified(input: {
  inverter?: Record<string, unknown> | null;
  battery?: Record<string, unknown> | null;
  meter?: Record<string, unknown> | null;
}): Partial<UnifiedEnergyModel> {
  const pv = input.inverter ? parseInverterPvData(input.inverter) : undefined;
  const battery = input.battery ? parseBatteryData(input.battery) : undefined;
  const grid = input.meter ? parseGridData(input.meter) : undefined;

  return {
    timestamp: Date.now(),
    ...(pv ? { pv } : {}),
    ...(battery ? { battery } : {}),
    ...(grid ? { grid } : {}),
  };
}
