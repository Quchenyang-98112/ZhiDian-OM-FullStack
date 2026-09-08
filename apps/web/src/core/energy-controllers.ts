/**
 * Dedicated Energy Controllers — Inspired by OpenEMS Controller Architecture
 *
 * Implements granular, independently schedulable controllers that each
 * manage a specific energy strategy. Each controller runs its own control
 * loop and can be composed into a pipeline.
 *
 * Controllers:
 *   1. ESSSymmetricController — Symmetric ESS power control (peak shaving, self-consumption)
 *   2. PeakShavingController — Grid import peak shaving with hysteresis
 *   3. GridOptimizedChargeController — Grid-optimized battery charging (low-tariff windows)
 *   4. SelfConsumptionController — Maximize PV self-consumption
 *   5. BalancingController — Grid power balancing (symmetric/asymmetric)
 *   6. EmergencyCapacityController — Reserve SoC for backup power
 *   7. HeatPumpSGReadyController — SG Ready heat pump control based on PV/tariff
 *   8. EVSmartChargeController — EV charging optimization with tariff/PV awareness
 *
 * Reference: OpenEMS io.openems.edge.controller.*
 */

import type { EnergyData, StoredSettings } from '../types';

// ─── Controller Interface ────────────────────────────────────────────

export type ControllerPriority = 'critical' | 'high' | 'normal' | 'low';

export interface ControllerOutput {
  /** Target ESS power in watts (positive = charge, negative = discharge) */
  essPowerW?: number;
  /** Target EV charge current in amps (≥ 0 = charging) */
  evCurrentA?: number;
  /** Target EV V2G discharge power in watts (> 0 means active discharge) */
  evDischargePowerW?: number;
  /** Target heat pump SG Ready mode (1-4) */
  sgReadyMode?: 1 | 2 | 3 | 4;
  /** Maximum allowed grid import in watts */
  gridLimitW?: number;
  /** Human-readable reason for the decision */
  reason: string;
  /** Controller confidence (0-1) */
  confidence: number;
}

export interface ControllerState {
  id: string;
  name: string;
  enabled: boolean;
  priority: ControllerPriority;
  lastRun: number;
  lastOutput: ControllerOutput | null;
  errorCount: number;
  cycleTimeMs: number;
}

export interface EnergyController {
  readonly id: string;
  readonly name: string;
  readonly priority: ControllerPriority;
  enabled: boolean;
  /** Execute one control cycle */
  run(data: EnergyData, settings?: StoredSettings, dt?: number): ControllerOutput;
  /** Reset internal state */
  reset(): void;
  /** Get current state for monitoring */
  getState(): ControllerState;
}

// ─── 1. ESS Symmetric Power Controller ──────────────────────────────

/** Safe fallback when no per-device battery limit is configured (LOW-11). */
const SAFE_DEFAULT_ESS_W = 10_000;
/**
 * Absolute upper bound for the controller's ESS clamp. Mirrors the
 * `batteryPowerWatts` Zod bound in `command-safety.ts` (±25 kW, §14a EnWG) so a
 * bad user-entered rate can never widen this advisory clamp beyond the hardware
 * ceiling. Kept as a local constant on purpose — the command-safety schema stays
 * the single source of truth for what actually reaches an adapter.
 */
const MAX_ESS_W = 25_000;

/**
 * Resolve an ESS power limit (W) from a configured battery rate (kW). Fails
 * safe: a missing / non-positive / non-finite rate falls back to the
 * `SAFE_DEFAULT_ESS_W` default, and any value is capped at `MAX_ESS_W`. The
 * result therefore only ever *narrows* the clamp per device, never widens it.
 */
function essLimitW(rateKW?: number): number {
  return Number.isFinite(rateKW) && (rateKW as number) > 0
    ? Math.min((rateKW as number) * 1000, MAX_ESS_W)
    : SAFE_DEFAULT_ESS_W;
}

export class ESSSymmetricController implements EnergyController {
  readonly id = 'ess-symmetric';
  readonly name = 'ESS Symmetric Power';
  readonly priority: ControllerPriority = 'high';
  enabled = true;

  private lastOutput: ControllerOutput | null = null;
  private lastRun = 0;
  private errorCount = 0;
  private cycleTimeMs = 0;
  private integralError = 0;
  private previousError = 0;

  // PID parameters
  private kp = 0.5;
  private ki = 0.01;
  private kd = 0.1;

  run(data: EnergyData, settings: StoredSettings, dt = 1): ControllerOutput {
    const start = performance.now();
    try {
      // Target: zero grid power (self-consumption mode)
      const gridTarget = 0;
      const error = (data.gridPower ?? 0) - gridTarget;

      this.integralError += error * dt;
      // Anti-windup: clamp integral
      const maxIntegral = (settings.maxGridImportKw ?? 10) * 1000;
      this.integralError = Math.max(-maxIntegral, Math.min(maxIntegral, this.integralError));

      const derivative = dt > 0 ? (error - this.previousError) / dt : 0;
      this.previousError = error;

      // PID output
      const pidOutput = this.kp * error + this.ki * this.integralError + this.kd * derivative;

      // Constrain to the configured battery's charge/discharge limits (LOW-11).
      // Sourced from systemConfig.battery (kW → W); fails safe to ±10 kW when a
      // limit is missing/invalid, and is hard-capped at the command-safety bound.
      const battery = settings.systemConfig?.battery;
      const maxChargePower = essLimitW(battery?.maxChargeRateKW);
      const maxDischargePower = essLimitW(battery?.maxDischargeRateKW);
      const essPower = Math.max(-maxDischargePower, Math.min(maxChargePower, pidOutput));

      const soc = data.batterySoC ?? 0;
      const minSoC = settings.batteryMinSoC ?? 10;
      let adjustedPower = essPower;

      if (soc <= minSoC && adjustedPower < 0) {
        adjustedPower = 0; // Don't discharge below min SoC
      }
      if (soc >= 98 && adjustedPower > 0) {
        adjustedPower = Math.min(adjustedPower, 500); // Trickle charge near full
      }

      this.lastOutput = {
        essPowerW: Math.round(adjustedPower),
        reason: `PID grid balance: err=${error.toFixed(0)}W → ESS=${adjustedPower.toFixed(0)}W`,
        confidence: Math.min(0.95, 0.5 + Math.abs(error) / 5000),
      };
      return this.lastOutput;
    } catch {
      this.errorCount++;
      this.lastOutput = { essPowerW: 0, reason: 'Controller error', confidence: 0 };
      return this.lastOutput;
    } finally {
      this.cycleTimeMs = performance.now() - start;
      this.lastRun = Date.now();
    }
  }

  reset(): void {
    this.integralError = 0;
    this.previousError = 0;
    this.lastOutput = null;
  }

  getState(): ControllerState {
    return {
      id: this.id,
      name: this.name,
      enabled: this.enabled,
      priority: this.priority,
      lastRun: this.lastRun,
      lastOutput: this.lastOutput,
      errorCount: this.errorCount,
      cycleTimeMs: this.cycleTimeMs,
    };
  }
}

// ─── 2. Peak Shaving Controller ─────────────────────────────────────

export class PeakShavingController implements EnergyController {
  readonly id = 'peak-shaving';
  readonly name = 'Peak Shaving';
  readonly priority: ControllerPriority = 'critical';
  enabled = true;

  private lastOutput: ControllerOutput | null = null;
  private lastRun = 0;
  private errorCount = 0;
  private cycleTimeMs = 0;
  private peakRecordW = 0;
  private hysteresisW = 200; // 200W hysteresis band

  run(data: EnergyData, settings: StoredSettings): ControllerOutput {
    const start = performance.now();
    try {
      const gridLimitW = (settings.maxGridImportKw ?? 4.2) * 1000;
      const gridPower = data.gridPower ?? 0;

      // Track peak
      if (gridPower > this.peakRecordW) {
        this.peakRecordW = gridPower;
      }

      if (gridPower > gridLimitW + this.hysteresisW) {
        // Grid import exceeds limit → discharge battery
        const excess = gridPower - gridLimitW;
        const dischargePower = Math.min(excess, (data.batterySoC ?? 0) > 10 ? 10000 : 0);

        this.lastOutput = {
          essPowerW: -dischargePower,
          gridLimitW,
          reason: `Peak shaving: grid=${(gridPower / 1000).toFixed(1)}kW > limit=${(gridLimitW / 1000).toFixed(1)}kW, discharging ${(dischargePower / 1000).toFixed(1)}kW`,
          confidence: 0.95,
        };
      } else if (gridPower < gridLimitW - this.hysteresisW && (data.batterySoC ?? 0) < 95) {
        // Below limit with hysteresis → allow normal operation
        this.lastOutput = {
          gridLimitW,
          reason: `Peak shaving: grid within limit (${(gridPower / 1000).toFixed(1)}kW)`,
          confidence: 0.8,
        };
      } else {
        this.lastOutput = {
          gridLimitW,
          reason: `Peak shaving: hysteresis band (${(gridPower / 1000).toFixed(1)}kW ≈ ${(gridLimitW / 1000).toFixed(1)}kW)`,
          confidence: 0.7,
        };
      }

      return this.lastOutput;
    } catch {
      this.errorCount++;
      this.lastOutput = { reason: 'Controller error', confidence: 0 };
      return this.lastOutput;
    } finally {
      this.cycleTimeMs = performance.now() - start;
      this.lastRun = Date.now();
    }
  }

  reset(): void {
    this.peakRecordW = 0;
    this.lastOutput = null;
  }

  getState(): ControllerState {
    return {
      id: this.id,
      name: this.name,
      enabled: this.enabled,
      priority: this.priority,
      lastRun: this.lastRun,
      lastOutput: this.lastOutput,
      errorCount: this.errorCount,
      cycleTimeMs: this.cycleTimeMs,
    };
  }
}

// ─── 3. Grid-Optimized Charge Controller ────────────────────────────

export class GridOptimizedChargeController implements EnergyController {
  readonly id = 'grid-optimized-charge';
  readonly name = 'Grid-Optimized Charging';
  readonly priority: ControllerPriority = 'normal';
  enabled = true;

  private lastOutput: ControllerOutput | null = null;
  private lastRun = 0;
  private errorCount = 0;
  private cycleTimeMs = 0;

  run(data: EnergyData, settings: StoredSettings): ControllerOutput {
    const start = performance.now();
    try {
      const threshold = settings.chargeThreshold;
      const currentPrice = data.priceCurrent ?? 0;
      const soc = data.batterySoC ?? 0;

      if (currentPrice <= threshold && soc < 95) {
        // Low tariff → charge battery from grid
        const chargeRate = soc < 30 ? 5000 : soc < 60 ? 3000 : 1500;
        const priceDelta = threshold - currentPrice;
        const urgency = Math.min(1, priceDelta / 0.1); // Higher urgency for lower prices

        this.lastOutput = {
          essPowerW: chargeRate,
          reason: `Grid charge: price ${currentPrice.toFixed(3)}€ ≤ threshold ${threshold.toFixed(3)}€ (urgency: ${(urgency * 100).toFixed(0)}%)`,
          confidence: 0.85 + urgency * 0.1,
        };
      } else if (currentPrice > threshold * 1.5 && soc > 30) {
        // High tariff → discharge battery to house
        const dischargeRate = Math.min(5000, data.houseLoad ?? 0);

        this.lastOutput = {
          essPowerW: -dischargeRate,
          reason: `Tariff discharge: price ${currentPrice.toFixed(3)}€ >> threshold, SoC ${soc}%`,
          confidence: 0.9,
        };
      } else {
        this.lastOutput = {
          reason: `Grid-optimized: holding (price=${currentPrice.toFixed(3)}€, SoC=${soc}%)`,
          confidence: 0.6,
        };
      }

      return this.lastOutput;
    } catch {
      this.errorCount++;
      this.lastOutput = { reason: 'Controller error', confidence: 0 };
      return this.lastOutput;
    } finally {
      this.cycleTimeMs = performance.now() - start;
      this.lastRun = Date.now();
    }
  }

  reset(): void {
    this.lastOutput = null;
  }

  getState(): ControllerState {
    return {
      id: this.id,
      name: this.name,
      enabled: this.enabled,
      priority: this.priority,
      lastRun: this.lastRun,
      lastOutput: this.lastOutput,
      errorCount: this.errorCount,
      cycleTimeMs: this.cycleTimeMs,
    };
  }
}

// ─── 4. Self-Consumption Maximizer ──────────────────────────────────

export class SelfConsumptionController implements EnergyController {
  readonly id = 'self-consumption';
  readonly name = 'Self-Consumption Optimizer';
  readonly priority: ControllerPriority = 'normal';
  enabled = true;

  private lastOutput: ControllerOutput | null = null;
  private lastRun = 0;
  private errorCount = 0;
  private cycleTimeMs = 0;

  run(data: EnergyData, settings: StoredSettings): ControllerOutput {
    const start = performance.now();
    try {
      const pvSurplus = Math.max(0, (data.pvPower ?? 0) - (data.houseLoad ?? 0));
      const soc = data.batterySoC ?? 0;
      const minSoC = settings.batteryMinSoC ?? 10;

      if (pvSurplus > 100 && soc < 98) {
        // PV surplus → charge battery
        this.lastOutput = {
          essPowerW: Math.min(pvSurplus, 10000),
          reason: `Self-consumption: ${(pvSurplus / 1000).toFixed(1)}kW PV surplus → battery`,
          confidence: 0.92,
        };
      } else if (pvSurplus <= 0 && soc > minSoC) {
        // No PV → discharge battery to cover load
        const deficit = Math.abs(data.gridPower);
        const dischargePower = Math.min(deficit, 10000);

        this.lastOutput = {
          essPowerW: -dischargePower,
          reason: `Self-consumption: no PV, discharge ${(dischargePower / 1000).toFixed(1)}kW from battery`,
          confidence: 0.85,
        };
      } else {
        this.lastOutput = {
          reason: `Self-consumption: balanced (PV surplus=${(pvSurplus / 1000).toFixed(1)}kW, SoC=${soc}%)`,
          confidence: 0.7,
        };
      }

      return this.lastOutput;
    } catch {
      this.errorCount++;
      this.lastOutput = { reason: 'Controller error', confidence: 0 };
      return this.lastOutput;
    } finally {
      this.cycleTimeMs = performance.now() - start;
      this.lastRun = Date.now();
    }
  }

  reset(): void {
    this.lastOutput = null;
  }

  getState(): ControllerState {
    return {
      id: this.id,
      name: this.name,
      enabled: this.enabled,
      priority: this.priority,
      lastRun: this.lastRun,
      lastOutput: this.lastOutput,
      errorCount: this.errorCount,
      cycleTimeMs: this.cycleTimeMs,
    };
  }
}

// ─── 5. Emergency Capacity Controller ───────────────────────────────

export class EmergencyCapacityController implements EnergyController {
  readonly id = 'emergency-capacity';
  readonly name = 'Emergency Reserve';
  readonly priority: ControllerPriority = 'critical';
  enabled = true;

  private lastOutput: ControllerOutput | null = null;
  private lastRun = 0;
  private errorCount = 0;
  private cycleTimeMs = 0;
  private reserveSoCPercent = 20;

  run(data: EnergyData, _settings?: StoredSettings): ControllerOutput {
    const start = performance.now();
    try {
      const soc = data.batterySoC ?? 0;

      if (soc < this.reserveSoCPercent) {
        // Below reserve → force charge
        const chargeRate = (this.reserveSoCPercent - soc) * 100; // Proportional
        this.lastOutput = {
          essPowerW: Math.min(chargeRate, 3000),
          reason: `Emergency reserve: SoC ${soc}% < reserve ${this.reserveSoCPercent}% → force charge`,
          confidence: 0.99,
        };
      } else if (soc === this.reserveSoCPercent) {
        // At reserve → block discharge
        this.lastOutput = {
          essPowerW: 0,
          reason: `Emergency reserve: SoC at minimum (${soc}%), blocking discharge`,
          confidence: 0.95,
        };
      } else {
        this.lastOutput = {
          reason: `Emergency reserve: SoC ${soc}% above reserve ${this.reserveSoCPercent}%`,
          confidence: 0.5,
        };
      }

      return this.lastOutput;
    } catch {
      this.errorCount++;
      this.lastOutput = { reason: 'Controller error', confidence: 0 };
      return this.lastOutput;
    } finally {
      this.cycleTimeMs = performance.now() - start;
      this.lastRun = Date.now();
    }
  }

  reset(): void {
    this.lastOutput = null;
  }

  getState(): ControllerState {
    return {
      id: this.id,
      name: this.name,
      enabled: this.enabled,
      priority: this.priority,
      lastRun: this.lastRun,
      lastOutput: this.lastOutput,
      errorCount: this.errorCount,
      cycleTimeMs: this.cycleTimeMs,
    };
  }
}

// ─── 6. Heat Pump SG Ready Controller ───────────────────────────────

export class HeatPumpSGReadyController implements EnergyController {
  readonly id = 'heatpump-sg-ready';
  readonly name = 'Heat Pump SG Ready';
  readonly priority: ControllerPriority = 'normal';
  enabled = true;

  private lastOutput: ControllerOutput | null = null;
  private lastRun = 0;
  private errorCount = 0;
  private cycleTimeMs = 0;
  private lockoutCooldownMs = 0;
  private lastModeChange = 0;

  run(data: EnergyData, settings: StoredSettings): ControllerOutput {
    const start = performance.now();
    try {
      const pvSurplus = Math.max(
        0,
        (data.pvPower ?? 0) - (data.houseLoad ?? 0) - (data.evPower ?? 0),
      );
      const price = data.priceCurrent ?? 0;
      const threshold = settings.chargeThreshold;
      const soc = data.batterySoC ?? 0;
      const now = Date.now();

      // Prevent mode oscillation (minimum 5 minutes between changes)
      const minInterval = 300_000;
      const canChange = now - this.lastModeChange > minInterval;

      let mode: 1 | 2 | 3 | 4 = 2; // Default: normal operation
      let reason = 'Normal operation';
      let confidence = 0.7;

      // Mode 4: Forced start — high PV surplus + battery full-ish
      if (pvSurplus > 2000 && soc > 80) {
        mode = 4;
        reason = `Forced start: ${(pvSurplus / 1000).toFixed(1)}kW PV surplus, SoC ${soc}%`;
        confidence = 0.92;
      }
      // Mode 3: Recommendation — moderate PV surplus or cheap tariff
      else if (pvSurplus > 500 || (price < threshold && soc > 50)) {
        mode = 3;
        reason =
          pvSurplus > 500
            ? `Recommended: ${(pvSurplus / 1000).toFixed(1)}kW PV surplus`
            : `Recommended: low tariff ${price.toFixed(3)}€/kWh`;
        confidence = 0.85;
      }
      // Mode 1: Lockout — very expensive tariff + low battery
      else if (price > threshold * 2 && soc < 30 && this.lockoutCooldownMs <= 0) {
        mode = 1;
        reason = `Lockout: price ${price.toFixed(3)}€ >> threshold, SoC only ${soc}%`;
        confidence = 0.88;
        if (canChange) this.lockoutCooldownMs = 900_000; // 15min max lockout
      }

      if (canChange) this.lastModeChange = now;
      if (this.lockoutCooldownMs > 0) this.lockoutCooldownMs -= 1000;

      this.lastOutput = { sgReadyMode: mode, reason, confidence };
      return this.lastOutput;
    } catch {
      this.errorCount++;
      this.lastOutput = { sgReadyMode: 2, reason: 'Controller error', confidence: 0 };
      return this.lastOutput;
    } finally {
      this.cycleTimeMs = performance.now() - start;
      this.lastRun = Date.now();
    }
  }

  reset(): void {
    this.lastOutput = null;
    this.lockoutCooldownMs = 0;
    this.lastModeChange = 0;
  }

  getState(): ControllerState {
    return {
      id: this.id,
      name: this.name,
      enabled: this.enabled,
      priority: this.priority,
      lastRun: this.lastRun,
      lastOutput: this.lastOutput,
      errorCount: this.errorCount,
      cycleTimeMs: this.cycleTimeMs,
    };
  }
}

// ─── 7. EV Smart Charge Controller ──────────────────────────────────

export class EVSmartChargeController implements EnergyController {
  readonly id = 'ev-smart-charge';
  readonly name = 'EV Smart Charging';
  readonly priority: ControllerPriority = 'normal';
  enabled = true;

  private lastOutput: ControllerOutput | null = null;
  private lastRun = 0;
  private errorCount = 0;
  private cycleTimeMs = 0;

  run(data: EnergyData, settings: StoredSettings): ControllerOutput {
    const start = performance.now();
    try {
      const pvSurplus = Math.max(
        0,
        (data.pvPower ?? 0) - (data.houseLoad ?? 0) - (data.heatPumpPower ?? 0),
      );
      const price = data.priceCurrent ?? 0;
      const threshold = settings.chargeThreshold;

      // Calculate available current for EV (3-phase, 230V)
      const maxCurrentA = 32;
      const minCurrentA = 6;
      let targetCurrentA = 0;
      let reason = 'EV charging paused';
      let confidence = 0.7;

      // PV surplus charging
      if (pvSurplus > 1380) {
        // Min 6A * 230V = 1380W
        const surplusCurrent = Math.floor(pvSurplus / 230 / 3); // 3-phase
        targetCurrentA = Math.max(minCurrentA, Math.min(maxCurrentA, surplusCurrent));
        reason = `PV surplus: ${(pvSurplus / 1000).toFixed(1)}kW → ${targetCurrentA}A`;
        confidence = 0.92;
      }
      // Low-tariff grid charging
      else if (price < threshold) {
        targetCurrentA = maxCurrentA;
        reason = `Low tariff: ${price.toFixed(3)}€ → max ${maxCurrentA}A`;
        confidence = 0.88;
      }
      // Grid-limited § 14a EnWG
      else {
        const gridLimit = (settings.maxGridImportKw ?? 4.2) * 1000;
        const available = gridLimit - (data.gridPower ?? 0) + (data.evPower ?? 0);
        if (available > 1380) {
          targetCurrentA = Math.min(maxCurrentA, Math.floor(available / 230 / 3));
          reason = `Grid-limited: ${targetCurrentA}A (§14a headroom)`;
          confidence = 0.8;
        }
      }

      this.lastOutput = {
        evCurrentA: targetCurrentA,
        reason,
        confidence,
      };
      return this.lastOutput;
    } catch {
      this.errorCount++;
      this.lastOutput = { evCurrentA: 0, reason: 'Controller error', confidence: 0 };
      return this.lastOutput;
    } finally {
      this.cycleTimeMs = performance.now() - start;
      this.lastRun = Date.now();
    }
  }

  reset(): void {
    this.lastOutput = null;
  }

  getState(): ControllerState {
    return {
      id: this.id,
      name: this.name,
      enabled: this.enabled,
      priority: this.priority,
      lastRun: this.lastRun,
      lastOutput: this.lastOutput,
      errorCount: this.errorCount,
      cycleTimeMs: this.cycleTimeMs,
    };
  }
}

// ─── 8. EV V2G Discharge Controller ─────────────────────────────────

/**
 * EVV2GDischargeController — ISO 15118-20 BPT bidirectional discharge loop
 *
 * Decides when and how much to discharge the EV battery back to the grid/home
 * based on:
 *   1. SOC guardrails (never discharge below V2G_MIN_SOC, ISO 15118-20 §9.8)
 *   2. BPT negotiated power limits (evMaximumDischargePowerW from adapter)
 *   3. Grid price threshold (discharge when price ≥ 2× normal price)
 *   4. OpenADR LOAD_CONTROL override (discharge when §14a event active)
 *   5. PV deficit cover (discharge to avoid grid import during low PV)
 *
 * Output: `evDischargePowerW` (> 0 = active V2G discharge)
 */
export class EVV2GDischargeController implements EnergyController {
  readonly id = 'ev-v2g-discharge';
  readonly name = 'EV V2G Discharge';
  readonly priority: ControllerPriority = 'high';
  enabled = false; // Off by default — user must enable after confirming BPT support

  private lastOutput: ControllerOutput | null = null;
  private lastRun = 0;
  private errorCount = 0;
  private cycleTimeMs = 0;

  /** SOC% below which V2G discharge is unconditionally blocked */
  private readonly V2G_MIN_SOC = 15;
  /** SOC% at which V2G stops (safety ceiling — don't deplete too much) */
  private readonly V2G_STOP_SOC = 20;

  run(data: EnergyData, settings: StoredSettings): ControllerOutput {
    const start = performance.now();
    try {
      const evSoc = data.evSocPercent ?? 0;
      const evMaxDischarge = data.evMaxDischargePowerW ?? 0;
      const price = data.priceCurrent ?? 0;
      const chargeThreshold = settings.chargeThreshold;

      // ── Hard-block conditions ──────────────────────────────────────
      if (evMaxDischarge <= 0) {
        // No BPT data or EV has no V2G capability
        this.lastOutput = {
          evDischargePowerW: 0,
          reason: 'V2G inactive: no BPT discharge capability reported',
          confidence: 1,
        };
        return this.lastOutput;
      }

      if (evSoc > 0 && evSoc < this.V2G_MIN_SOC) {
        this.lastOutput = {
          evDischargePowerW: 0,
          reason: `V2G blocked: EV SOC ${evSoc}% < minimum ${this.V2G_MIN_SOC}%`,
          confidence: 0.99,
        };
        return this.lastOutput;
      }

      if (evSoc > 0 && evSoc <= this.V2G_STOP_SOC) {
        this.lastOutput = {
          evDischargePowerW: 0,
          reason: `V2G stopped: EV SOC ${evSoc}% at safety floor (${this.V2G_STOP_SOC}%)`,
          confidence: 0.99,
        };
        return this.lastOutput;
      }

      // §14a OpenADR LOAD_CONTROL: EV charging blocked → skip discharge too
      // (the LOAD_CONTROL event may require full isolation from grid)
      if (data.evDisabledBy14a) {
        this.lastOutput = {
          evDischargePowerW: 0,
          reason: 'V2G blocked: §14a OpenADR LOAD_CONTROL event active',
          confidence: 0.99,
        };
        return this.lastOutput;
      }

      // ── Discharge decision ─────────────────────────────────────────
      const dischargeThreshold = chargeThreshold * 2; // Discharge when price is ≥ 2×
      const pvDeficit = Math.max(0, (data.houseLoad ?? 0) - (data.pvPower ?? 0));
      let dischargePowerW = 0;
      let reason = 'V2G standby';
      let confidence = 0.5;

      if (price >= dischargeThreshold) {
        // High tariff window → export to grid for revenue
        dischargePowerW = Math.min(evMaxDischarge, 7400); // Max 7.4 kW (typical V2G single-phase)
        reason = `V2G: high tariff ${price.toFixed(3)}€/kWh ≥ threshold ${dischargeThreshold.toFixed(3)}€ → ${(dischargePowerW / 1000).toFixed(1)}kW discharge`;
        confidence = 0.9;
      } else if (pvDeficit > 1000 && (data.batterySoC ?? 100) < 30) {
        // PV deficit AND low stationary battery → use EV to cover home load
        dischargePowerW = Math.min(evMaxDischarge, pvDeficit);
        reason = `V2G: PV deficit ${(pvDeficit / 1000).toFixed(1)}kW, low ESS → EV covers ${(dischargePowerW / 1000).toFixed(1)}kW`;
        confidence = 0.85;
      }

      // Clamp to BPT negotiated limit
      dischargePowerW = Math.min(dischargePowerW, evMaxDischarge);

      this.lastOutput = {
        evDischargePowerW: Math.round(dischargePowerW),
        reason,
        confidence,
      };
      return this.lastOutput;
    } catch {
      this.errorCount++;
      this.lastOutput = { evDischargePowerW: 0, reason: 'Controller error', confidence: 0 };
      return this.lastOutput;
    } finally {
      this.cycleTimeMs = performance.now() - start;
      this.lastRun = Date.now();
    }
  }

  reset(): void {
    this.lastOutput = null;
  }

  getState(): ControllerState {
    return {
      id: this.id,
      name: this.name,
      enabled: this.enabled,
      priority: this.priority,
      lastRun: this.lastRun,
      lastOutput: this.lastOutput,
      errorCount: this.errorCount,
      cycleTimeMs: this.cycleTimeMs,
    };
  }
}

// ─── Controller Pipeline (Scheduler) ────────────────────────────────

const PRIORITY_ORDER: Record<ControllerPriority, number> = {
  critical: 0,
  high: 1,
  normal: 2,
  low: 3,
};

export class ControllerPipeline {
  private controllers: EnergyController[] = [];
  private lastResults: Map<string, ControllerOutput> = new Map();
  private loopInterval: ReturnType<typeof setInterval> | null = null;

  constructor() {
    // Register default controllers
    this.controllers = [
      new EmergencyCapacityController(),
      new PeakShavingController(),
      new ESSSymmetricController(),
      new GridOptimizedChargeController(),
      new SelfConsumptionController(),
      new HeatPumpSGReadyController(),
      new EVSmartChargeController(),
      new EVV2GDischargeController(), // Disabled by default; enabled when BPT negotiated
    ];
  }

  /** Run all enabled controllers in priority order and merge outputs */
  run(data: EnergyData, settings: StoredSettings): ControllerOutput {
    const sorted = [...this.controllers]
      .filter((c) => c.enabled)
      .sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);

    const merged: ControllerOutput = {
      reason: '',
      confidence: 0,
    };

    const reasons: string[] = [];
    let highestConfidence = 0;

    for (const controller of sorted) {
      try {
        const output = controller.run(data, settings, 1);
        this.lastResults.set(controller.id, output);

        // Higher priority controllers override lower ones
        if (output.essPowerW !== undefined && merged.essPowerW === undefined) {
          merged.essPowerW = output.essPowerW;
        }
        if (output.evCurrentA !== undefined && merged.evCurrentA === undefined) {
          merged.evCurrentA = output.evCurrentA;
        }
        if (output.evDischargePowerW !== undefined && merged.evDischargePowerW === undefined) {
          merged.evDischargePowerW = output.evDischargePowerW;
        }
        if (output.sgReadyMode !== undefined && merged.sgReadyMode === undefined) {
          merged.sgReadyMode = output.sgReadyMode;
        }
        if (output.gridLimitW !== undefined && merged.gridLimitW === undefined) {
          merged.gridLimitW = output.gridLimitW;
        }

        if (output.confidence > highestConfidence) {
          highestConfidence = output.confidence;
        }
        reasons.push(`[${controller.id}] ${output.reason}`);
      } catch {
        // Individual controller failure doesn't stop pipeline
      }
    }

    merged.reason = reasons.join(' | ');
    merged.confidence = highestConfidence;

    return merged;
  }

  /** Start automatic control loop */
  start(getData: () => EnergyData, getSettings: () => StoredSettings, intervalMs = 1000): void {
    this.stop();
    this.loopInterval = setInterval(() => {
      this.run(getData(), getSettings());
    }, intervalMs);
  }

  /** Stop automatic control loop */
  stop(): void {
    if (this.loopInterval) {
      clearInterval(this.loopInterval);
      this.loopInterval = null;
    }
  }

  /** Get status of all controllers */
  getStates(): ControllerState[] {
    return this.controllers.map((c) => c.getState());
  }

  /** Get last result for a specific controller */
  getLastResult(controllerId: string): ControllerOutput | undefined {
    return this.lastResults.get(controllerId);
  }

  /** Enable/disable a specific controller */
  setEnabled(controllerId: string, enabled: boolean): void {
    const c = this.controllers.find((c) => c.id === controllerId);
    if (c) c.enabled = enabled;
  }

  /** Reset all controllers */
  resetAll(): void {
    for (const c of this.controllers) c.reset();
    this.lastResults.clear();
  }

  /** Get controller list */
  getControllers(): EnergyController[] {
    return [...this.controllers];
  }
}

/** Singleton pipeline instance */
export const controllerPipeline = new ControllerPipeline();
