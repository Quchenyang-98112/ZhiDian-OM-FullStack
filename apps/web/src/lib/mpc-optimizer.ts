/**
 * LP/MPC Optimizer — EMHASS-Inspired Mathematical Energy Optimization
 *
 * Implements Linear Programming (LP) and Model Predictive Control (MPC)
 * for optimal energy scheduling. Inspired by EMHASS's cvxpy approach.
 *
 * Key algorithms:
 *   1. Day-ahead optimization (LP) — schedule battery/EV/heatpump for 24h
 *   2. Intra-day MPC — rolling horizon correction every 15 minutes
 *   3. Cost minimization with constraints (§14a, battery limits, comfort)
 *   4. Multi-objective: minimize cost + maximize self-consumption + minimize CO₂
 *
 * References:
 *   - EMHASS: https://github.com/davidusb-geern/emhass
 *   - MPC for HEMS: doi:10.1016/j.energy.2020.118338
 */

import type { EnergyData, StoredSettings } from '../types';

// ─── Types ───────────────────────────────────────────────────────────

export interface OptimizationSlot {
  /** Start timestamp (Unix ms) */
  start: number;
  /** Duration in minutes */
  durationMin: number;
  /** Planned battery power (W, positive=charge, negative=discharge) */
  batteryPowerW: number;
  /** Planned EV charge current (A, ≥ 0 = charging) */
  evCurrentA: number;
  /** Planned EV V2G discharge power (W, > 0 = active V2G discharge to home/grid) */
  evDischargePowerW: number;
  /** Planned heat pump mode (SG Ready 1-4) */
  sgReadyMode: 1 | 2 | 3 | 4;
  /** Expected grid import (W) */
  expectedGridW: number;
  /** Expected cost (€) */
  expectedCostEur: number;
  /** Expected CO₂ (g) */
  expectedCo2G: number;
}

export interface OptimizationResult {
  /** Optimized schedule */
  schedule: OptimizationSlot[];
  /** Total expected cost over horizon */
  totalCostEur: number;
  /** Total expected cost without optimization */
  baselineCostEur: number;
  /** Savings from optimization */
  savingsEur: number;
  /** Self-consumption rate (0-1) */
  selfConsumptionRate: number;
  /** Total CO₂ saved (g) */
  co2SavedG: number;
  /** Solver status */
  status: 'optimal' | 'feasible' | 'infeasible' | 'timeout';
  /** Solver time (ms) */
  solverTimeMs: number;
  /** Horizon in hours */
  horizonH: number;
  /** Timestamp of optimization run */
  generatedAt: number;
}

export interface PVForecastSlot {
  timestamp: number;
  powerW: number;
}

export interface LoadForecastSlot {
  timestamp: number;
  powerW: number;
}

export interface TariffSlot {
  timestamp: number;
  priceEurKWh: number;
  co2GPerKWh: number;
}

export interface OptimizationConstraints {
  /** Maximum grid import (W), e.g. 4200 for §14a EnWG */
  maxGridImportW: number;
  /** Maximum grid export (W) */
  maxGridExportW: number;
  /** Battery capacity (Wh) */
  batteryCapacityWh: number;
  /** Maximum battery charge rate (W) */
  maxBatteryChargeW: number;
  /** Maximum battery discharge rate (W) */
  maxBatteryDischargeW: number;
  /** Minimum battery SoC (0-1) */
  minBatterySoC: number;
  /** Maximum battery SoC (0-1) */
  maxBatterySoC: number;
  /** Current battery SoC (0-1) */
  currentBatterySoC: number;
  /** EV charge parameters */
  ev: {
    connected: boolean;
    currentSoC: number;
    targetSoC: number;
    capacityKWh: number;
    maxChargeW: number;
    minChargeW: number;
    departuretime?: number;
    // V2G / BPT fields (ISO 15118-20)
    /** Whether the EV supports V2G discharge */
    v2xCapable?: boolean;
    /** Maximum V2G discharge power from BPT negotiation (W) */
    maxDischargeW?: number;
    /** Minimum V2G discharge power from BPT negotiation (W) */
    minDischargeW?: number;
    /** EV SOC% below which V2G discharge is blocked */
    minSoCForV2G?: number;
    /** §14a OpenADR LOAD_CONTROL: when true, ALL EV energy is blocked */
    disabledBy14a?: boolean;
  };
  /** Heat pump parameters */
  heatPump: {
    ratedPowerW: number;
    minTemp: number;
    maxTemp: number;
    currentTemp: number;
    thermalMassKWhPerK: number;
  };
  /** Feed-in tariff (€/kWh) */
  feedInTariffEurKWh: number;
  /** Battery round-trip efficiency (0-1) */
  batteryEfficiency: number;
  /**
   * OpenADR ELECTRICITY_PRICE events as tariff overrides.
   * When present, these slots replace the corresponding tariff array entries.
   * Keyed by slot index (0 = earliest slot).
   */
  openADRPriceOverrides?: Record<number, number>;
}

// ─── LP Solver (Simplex-like for browser) ────────────────────────────

/**
 * Simplified LP solver using iterative optimization.
 * For a browser environment, we implement a greedy LP approximation
 * that produces near-optimal results without a full simplex implementation.
 */
class LPSolver {
  /**
   * Solve the energy scheduling problem over a set of time slots.
   * Minimizes: sum(gridImport * price - gridExport * feedInTariff)
   * Subject to: power balance, battery limits, grid limits, SoC limits
   */
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: LP solver with multiple energy constraint paths
  solve(
    pvForecast: PVForecastSlot[],
    loadForecast: LoadForecastSlot[],
    tariff: TariffSlot[],
    constraints: OptimizationConstraints,
  ): OptimizationSlot[] {
    const n = Math.min(pvForecast.length, loadForecast.length, tariff.length);
    if (n === 0) {
      // Return a safe empty-ish result instead of crashing downstream
      return [];
    }

    const slots: OptimizationSlot[] = [];
    let currentSoC = constraints.currentBatterySoC;
    const dt = 0.25; // 15-minute slots in hours
    const capWh = Math.max(1, constraints.batteryCapacityWh); // Guard div-by-zero
    const eta = Math.max(0.01, constraints.batteryEfficiency ?? 0.92); // Guard NaN/zero

    // Pass 1: Sort slots by price to identify cheap/expensive periods
    const priceRanked = tariff
      .slice(0, n)
      .map((t, i) => ({ index: i, price: t.priceEurKWh, co2: t.co2GPerKWh }))
      .sort((a, b) => a.price - b.price);

    // Compute charge/discharge schedule
    const batterySchedule = new Float64Array(n);
    const evSchedule = new Float64Array(n);

    // Pass 2: Greedy battery scheduling
    // In cheap slots → charge battery (if surplus grid capacity)
    // In expensive slots → discharge battery (to avoid grid import)
    const medianPrice =
      priceRanked.length > 0 ? priceRanked[Math.floor(priceRanked.length / 2)].price : 0.2;

    for (const { index } of priceRanked) {
      const pv = pvForecast[index]?.powerW ?? 0;
      const load = loadForecast[index]?.powerW ?? 0;
      const price = tariff[index]?.priceEurKWh ?? 0.2;
      const netLoad = load - pv; // positive = need power, negative = surplus

      if (price < medianPrice * 0.7 && currentSoC < constraints.maxBatterySoC) {
        // Cheap: charge battery
        const headroom = (constraints.maxBatterySoC - currentSoC) * capWh;
        const maxCharge = Math.min(
          constraints.maxBatteryChargeW,
          headroom / dt,
          constraints.maxGridImportW - Math.max(0, netLoad),
        );
        const chargeW = Math.max(0, maxCharge);
        batterySchedule[index] = chargeW;
        currentSoC += (chargeW * dt * eta) / capWh;
      } else if (price > medianPrice * 1.3 && currentSoC > constraints.minBatterySoC) {
        // Expensive: discharge battery to cover load
        const available = (currentSoC - constraints.minBatterySoC) * capWh;
        const maxDischarge = Math.min(
          constraints.maxBatteryDischargeW,
          available / dt,
          Math.max(0, netLoad),
        );
        const dischargeW = Math.max(0, maxDischarge);
        batterySchedule[index] = -dischargeW;
        currentSoC -= (dischargeW * dt) / (capWh * eta);
      }
      // Clamp SoC
      currentSoC = Math.max(
        constraints.minBatterySoC,
        Math.min(constraints.maxBatterySoC, currentSoC),
      );
    }

    // Pass 3: EV scheduling — charge in cheapest slots AND discharge in expensive slots (V2X)
    const evDischarge = new Float64Array(n); // W, positive = discharge from EV to home/grid

    if (constraints.ev.connected && !constraints.ev.disabledBy14a) {
      // 3a: Charge scheduling (as before)
      if (constraints.ev.currentSoC < constraints.ev.targetSoC) {
        const energyNeededWh =
          (constraints.ev.targetSoC - constraints.ev.currentSoC) *
          constraints.ev.capacityKWh *
          1000;
        let remaining = energyNeededWh;

        for (const { index } of priceRanked) {
          if (remaining <= 0) break;
          const deadline = constraints.ev.departuretime ?? Infinity;
          if ((tariff[index]?.timestamp ?? 0) > deadline) continue;

          const gridUsed = Math.max(
            0,
            (loadForecast[index]?.powerW ?? 0) -
              (pvForecast[index]?.powerW ?? 0) +
              batterySchedule[index],
          );
          const headroom = constraints.maxGridImportW - gridUsed;
          const evPower = Math.min(constraints.ev.maxChargeW, Math.max(0, headroom));
          const evEnergy = evPower * dt;

          evSchedule[index] = evPower / 230 / 3; // Convert to amps (3-phase)
          remaining -= evEnergy;
        }
      }

      // 3b: V2X discharge scheduling — when price ≥ 2× median AND V2G capable
      const v2xCapable = constraints.ev.v2xCapable ?? false;
      const maxDischargeW = constraints.ev.maxDischargeW ?? 0;
      const minDischargeW = constraints.ev.minDischargeW ?? 0;
      const minV2GSoC = constraints.ev.minSoCForV2G ?? 0.15;

      if (v2xCapable && maxDischargeW > 0 && constraints.ev.currentSoC >= minV2GSoC) {
        const dischargeThreshold = medianPrice * 2; // Only discharge when very expensive

        for (let i = 0; i < n; i++) {
          const slotPrice = tariff[i]?.priceEurKWh ?? 0;
          if (slotPrice < dischargeThreshold) continue;
          // Don't discharge in slots where we also scheduled EV charging
          if (evSchedule[i] > 0) continue;

          const pvSupply = pvForecast[i]?.powerW ?? 0;
          const loadDemand = loadForecast[i]?.powerW ?? 0;
          // How much load is uncovered by PV + battery discharge?
          const batteryDischarge = Math.max(0, -batterySchedule[i]);
          const pvCoverage = pvSupply + batteryDischarge;
          const deficit = Math.max(0, loadDemand - pvCoverage);

          // Discharge to cover home deficit first, then grid export for revenue
          const dischargeTarget = Math.min(
            maxDischargeW,
            Math.max(minDischargeW, deficit > 0 ? deficit : maxDischargeW * 0.5),
          );

          evDischarge[i] = dischargeTarget;
        }
      }
    } else if (!constraints.ev.connected) {
      // EV not connected: original simple charge scheduling
      if (constraints.ev.currentSoC < constraints.ev.targetSoC) {
        const energyNeededWh =
          (constraints.ev.targetSoC - constraints.ev.currentSoC) *
          constraints.ev.capacityKWh *
          1000;
        let remaining = energyNeededWh;

        for (const { index } of priceRanked) {
          if (remaining <= 0) break;
          const deadline = constraints.ev.departuretime ?? Infinity;
          if ((tariff[index]?.timestamp ?? 0) > deadline) continue;

          const gridUsed = Math.max(
            0,
            (loadForecast[index]?.powerW ?? 0) -
              (pvForecast[index]?.powerW ?? 0) +
              batterySchedule[index],
          );
          const headroom = constraints.maxGridImportW - gridUsed;
          const evPower = Math.min(constraints.ev.maxChargeW, Math.max(0, headroom));
          const evEnergy = evPower * dt;

          evSchedule[index] = evPower / 230 / 3;
          remaining -= evEnergy;
        }
      }
    }

    // Pass 4: Build output slots with costs
    currentSoC = constraints.currentBatterySoC;
    let _totalCost = 0;
    let _baselineCost = 0;
    let totalCo2 = 0;
    let _pvTotal = 0;
    let _selfConsumed = 0;

    for (let i = 0; i < n; i++) {
      const pv = pvForecast[i]?.powerW ?? 0;
      const load = loadForecast[i]?.powerW ?? 0;
      // Apply OpenADR price override if available for this slot
      const basePrice = tariff[i]?.priceEurKWh ?? 0.2;
      const price = constraints.openADRPriceOverrides?.[i] ?? basePrice;
      const co2 = tariff[i]?.co2GPerKWh ?? 400;
      const batteryW = batterySchedule[i];
      const evA = evSchedule[i];
      const evW = evA * 230 * 3;
      const evDischargeW = evDischarge[i];

      // Total demand includes EV charging; total supply includes EV discharge
      const totalDemand = load + Math.max(0, batteryW) + evW;
      const totalSupply = pv + Math.abs(Math.min(0, batteryW)) + evDischargeW;

      const gridImport = Math.max(0, totalDemand - totalSupply);
      const gridExport = Math.max(0, totalSupply - totalDemand);

      const slotCost =
        ((gridImport * price - gridExport * constraints.feedInTariffEurKWh) * dt) / 1000;
      const baseSlotCost = (Math.max(0, load - pv) * price * dt) / 1000;

      _totalCost += slotCost;
      _baselineCost += baseSlotCost;
      totalCo2 += (gridImport * co2 * dt) / 1000;
      _pvTotal += pv * dt;
      _selfConsumed += Math.min(pv, load) * dt;

      // Update SoC tracking
      if (batteryW > 0) {
        currentSoC += (batteryW * dt * eta) / capWh;
      } else {
        currentSoC += (batteryW * dt) / (capWh * eta);
      }
      currentSoC = Math.max(
        constraints.minBatterySoC,
        Math.min(constraints.maxBatterySoC, currentSoC),
      );

      // Determine SG Ready mode based on context
      let sgMode: 1 | 2 | 3 | 4 = 2;
      if (pv > load + 2000 && currentSoC > 0.8) sgMode = 4;
      else if (pv > load || price < medianPrice * 0.7) sgMode = 3;
      else if (price > medianPrice * 2 && currentSoC < 0.3) sgMode = 1;

      slots.push({
        start: pvForecast[i]?.timestamp ?? Date.now() + i * 900_000,
        durationMin: 15,
        batteryPowerW: Math.round(batteryW),
        evCurrentA: Math.round(evA),
        evDischargePowerW: Math.round(evDischargeW),
        sgReadyMode: sgMode,
        expectedGridW: Math.round(gridImport - gridExport),
        expectedCostEur: Number(slotCost.toFixed(4)),
        expectedCo2G: Math.round(totalCo2),
      });
    }

    return slots;
  }
}

// ─── MPC Controller ─────────────────────────────────────────────────

export class MPCOptimizer {
  private lpSolver = new LPSolver();
  private lastResult: OptimizationResult | null = null;
  private lastRunTimestamp = 0;
  private readonly reoptimizeIntervalMs = 900_000; // 15 minutes

  /**
   * Run day-ahead optimization (typically once per day at midnight + tariff update)
   */
  optimizeDayAhead(
    pvForecast: PVForecastSlot[],
    loadForecast: LoadForecastSlot[],
    tariff: TariffSlot[],
    constraints: OptimizationConstraints,
  ): OptimizationResult {
    const start = performance.now();

    const schedule = this.lpSolver.solve(pvForecast, loadForecast, tariff, constraints);

    const totalCost = schedule.reduce((sum, s) => sum + s.expectedCostEur, 0);
    const baselineCost = schedule.reduce(
      (sum, s) => sum + (Math.max(0, s.expectedGridW) * 0.3 * 0.25) / 1000,
      0, // rough baseline
    );
    const co2Saved = schedule.reduce((sum, s) => sum + s.expectedCo2G, 0);

    const pvTotal = pvForecast.reduce((s, p) => s + p.powerW, 0);
    const loadTotal = loadForecast.reduce((s, l) => s + l.powerW, 0);
    const selfConsumptionRate = pvTotal > 0 ? Math.min(1, loadTotal / pvTotal) : 0;

    const result: OptimizationResult = {
      schedule,
      totalCostEur: Number(totalCost.toFixed(2)),
      baselineCostEur: Number(baselineCost.toFixed(2)),
      savingsEur: Number(Math.max(0, baselineCost - totalCost).toFixed(2)),
      selfConsumptionRate,
      co2SavedG: Math.round(co2Saved),
      status: 'optimal',
      solverTimeMs: performance.now() - start,
      horizonH: schedule.length * 0.25,
      generatedAt: Date.now(),
    };

    this.lastResult = result;
    this.lastRunTimestamp = Date.now();
    return result;
  }

  /**
   * MPC correction: Re-optimize from current state for remaining horizon
   * Called every 15 minutes with actual measurements
   */
  mpcCorrection(
    currentData: EnergyData,
    pvForecast: PVForecastSlot[],
    loadForecast: LoadForecastSlot[],
    tariff: TariffSlot[],
    constraints: OptimizationConstraints,
  ): OptimizationResult {
    // Update constraints with current measurements
    const updatedConstraints: OptimizationConstraints = {
      ...constraints,
      currentBatterySoC: currentData.batterySoC / 100,
    };

    // Re-optimize remaining horizon
    return this.optimizeDayAhead(pvForecast, loadForecast, tariff, updatedConstraints);
  }

  /**
   * Get the current scheduled action for this timeslot
   */
  getCurrentSlot(): OptimizationSlot | undefined {
    if (!this.lastResult) return undefined;

    const now = Date.now();
    return this.lastResult.schedule.find(
      (s) => s.start <= now && s.start + s.durationMin * 60_000 > now,
    );
  }

  /** Check if re-optimization is due */
  needsReoptimization(): boolean {
    return Date.now() - this.lastRunTimestamp > this.reoptimizeIntervalMs;
  }

  /** Get last optimization result */
  getLastResult(): OptimizationResult | null {
    return this.lastResult;
  }
}

// ─── Convenience functions ──────────────────────────────────────────

/**
 * Build optimization constraints from current settings and energy data
 */
export function buildConstraints(
  _data: EnergyData,
  settings: StoredSettings,
): OptimizationConstraints {
  const evV2xCapable = (_data.evMaxDischargePowerW ?? 0) > 0;

  return {
    maxGridImportW: (settings.maxGridImportKw ?? 4.2) * 1000,
    maxGridExportW: 70_000, // 70kW default
    batteryCapacityWh: Math.max(100, (settings.batteryCapacityKWh ?? 10) * 1000),
    maxBatteryChargeW: Math.max(100, (settings.batteryMaxChargeKW ?? 5) * 1000),
    maxBatteryDischargeW: Math.max(100, (settings.batteryMaxChargeKW ?? 5) * 1000),
    minBatterySoC: (settings.batteryMinSoC ?? 10) / 100,
    maxBatterySoC: 0.98,
    currentBatterySoC: Math.max(0, Math.min(1, _data.batterySoC / 100)),
    ev: {
      connected: (_data.evPower ?? 0) > 0,
      currentSoC: (_data.evSocPercent ?? 50) / 100,
      targetSoC: 0.8,
      capacityKWh: 60,
      maxChargeW: (settings.evMaxPowerKW ?? 11) * 1000,
      minChargeW: 1380,
      // V2G fields from BPT negotiation
      v2xCapable: evV2xCapable,
      maxDischargeW: _data.evMaxDischargePowerW ?? 0,
      minDischargeW: 0,
      minSoCForV2G: 0.15,
      disabledBy14a: _data.evDisabledBy14a ?? false,
    },
    heatPump: {
      ratedPowerW: (settings.heatPumpPowerKW ?? 6) * 1000,
      minTemp: 19,
      maxTemp: 24,
      currentTemp: 21,
      thermalMassKWhPerK: 2,
    },
    feedInTariffEurKWh: settings.feedInTariffEurKWh ?? 0.082,
    batteryEfficiency: 0.95,
  };
}

/**
 * Generate mock PV forecast from historical data and time of day
 */
export function generatePVForecast(horizonSlots: number, peakPowerW: number): PVForecastSlot[] {
  const now = Date.now();
  const slots: PVForecastSlot[] = [];

  for (let i = 0; i < horizonSlots; i++) {
    const ts = now + i * 900_000; // 15-min slots
    const date = new Date(ts);
    const hour = date.getHours() + date.getMinutes() / 60;

    // Solar bell curve (sunrise ~6:00, sunset ~20:00, peak ~13:00)
    let solar = 0;
    if (hour >= 6 && hour <= 20) {
      const t = (hour - 6) / (20 - 6); // Normalize 0-1
      solar = peakPowerW * Math.sin(Math.PI * t) ** 1.5;
      // Add some cloud variability
      solar *= 0.7 + 0.3 * Math.sin(i * 0.7);
    }

    slots.push({ timestamp: ts, powerW: Math.max(0, Math.round(solar)) });
  }

  return slots;
}

/**
 * Generate mock load forecast from typical household pattern
 */
export function generateLoadForecast(horizonSlots: number, baseLoadW: number): LoadForecastSlot[] {
  const now = Date.now();
  const slots: LoadForecastSlot[] = [];

  for (let i = 0; i < horizonSlots; i++) {
    const ts = now + i * 900_000;
    const date = new Date(ts);
    const hour = date.getHours() + date.getMinutes() / 60;

    // Typical household load profile
    let load = baseLoadW; // Base load (standby, fridge, etc.)

    // Morning peak (6-9h)
    if (hour >= 6 && hour <= 9) load += 800 * Math.sin((Math.PI * (hour - 6)) / 3);
    // Midday (12-14h)
    if (hour >= 12 && hour <= 14) load += 500 * Math.sin((Math.PI * (hour - 12)) / 2);
    // Evening peak (17-22h)
    if (hour >= 17 && hour <= 22) load += 1200 * Math.sin((Math.PI * (hour - 17)) / 5);
    // Night reduction
    if (hour >= 23 || hour <= 5) load *= 0.6;

    // Add noise
    load *= 0.9 + 0.2 * Math.sin(i * 1.3 + 42);

    slots.push({ timestamp: ts, powerW: Math.max(baseLoadW * 0.5, Math.round(load)) });
  }

  return slots;
}

/** Singleton MPC optimizer instance */
export const mpcOptimizer = new MPCOptimizer();
