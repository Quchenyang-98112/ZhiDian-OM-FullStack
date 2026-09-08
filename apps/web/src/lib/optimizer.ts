import type { EnergyData, OptimizerRecommendation, StoredSettings } from '../types';
import type { OptimizationResult, TariffSlot } from './mpc-optimizer';
import {
  buildConstraints,
  generateLoadForecast,
  generatePVForecast,
  mpcOptimizer,
} from './mpc-optimizer';

// ─── MPC-enhanced optimization cache ────────────────────────────────

let lastMpcRun = 0;
let cachedMpcResult: OptimizationResult | null = null;
let lastSettingsHash = '';
const MPC_INTERVAL_MS = 15 * 60 * 1000; // Re-optimize every 15 min

/** Simple hash of settings fields that affect MPC optimization */
function settingsHash(s: StoredSettings): string {
  return `${s.pvPeakKw}-${s.batteryCapacityKWh}-${s.batteryMaxChargeKW}-${s.batteryMinSoC}-${s.maxGridImportKw}-${s.chargeThreshold}-${s.feedInTariffEurKWh}`;
}

/**
 * Run MPC day-ahead optimization (non-blocking, cached).
 * Runs in background at 15-min intervals and caches result.
 */
export function runMpcOptimization(
  energyData: EnergyData,
  settings: StoredSettings,
): OptimizationResult | null {
  const now = Date.now();
  const currentHash = settingsHash(settings);
  // Invalidate cache if settings changed
  if (currentHash !== lastSettingsHash) {
    cachedMpcResult = null;
    lastSettingsHash = currentHash;
  }
  if (cachedMpcResult && now - lastMpcRun < MPC_INTERVAL_MS) {
    return cachedMpcResult;
  }

  try {
    const pvPeakW = (settings.pvPeakKw ?? 10) * 1000;
    const baseLoadW = energyData.houseLoad || 500;
    const horizonSlots = 96; // 24h × 4 slots/h

    const pvForecast = generatePVForecast(horizonSlots, pvPeakW);
    const loadForecast = generateLoadForecast(horizonSlots, baseLoadW);
    const constraints = buildConstraints(energyData, settings);

    // Generate tariff slots from current price
    const tariff: TariffSlot[] = pvForecast.map((pv) => ({
      timestamp: pv.timestamp,
      priceEurKWh: energyData.priceCurrent ?? 0.3,
      co2GPerKWh: 400,
    }));

    const result = mpcOptimizer.optimizeDayAhead(pvForecast, loadForecast, tariff, constraints);

    cachedMpcResult = result;
    lastMpcRun = now;
    return result;
  } catch {
    return cachedMpcResult;
  }
}

/**
 * Get MPC recommendations for the current slot, if available.
 */
function getMpcRecommendations(): OptimizerRecommendation[] {
  if (!cachedMpcResult) return [];

  const recs: OptimizerRecommendation[] = [];
  const now = Date.now();

  // Find current slot
  const currentSlot = cachedMpcResult.schedule.find(
    (s) => s.start <= now && s.start + s.durationMin * 60_000 > now,
  );

  if (currentSlot) {
    if (currentSlot.batteryPowerW > 500) {
      recs.push({
        id: 'mpc-charge',
        severity: 'positive',
        titleKey: 'optimizer.mpcBatteryCharge',
        descriptionKey: 'optimizer.mpcChargeDesc',
        value: `${(currentSlot.batteryPowerW / 1000).toFixed(1)} kW`,
      });
    }

    if (currentSlot.batteryPowerW < -500) {
      recs.push({
        id: 'mpc-discharge',
        severity: 'warning',
        titleKey: 'optimizer.mpcBatteryDischarge',
        descriptionKey: 'optimizer.mpcDischargeDesc',
        value: `${(Math.abs(currentSlot.batteryPowerW) / 1000).toFixed(1)} kW`,
      });
    }

    if (currentSlot.expectedGridW < 200) {
      recs.push({
        id: 'mpc-self-consumption',
        severity: 'positive',
        titleKey: 'optimizer.mpcSelfConsumption',
        descriptionKey: 'optimizer.mpcSelfConsumptionDesc',
        value: `${Math.round(cachedMpcResult.selfConsumptionRate * 100)}%`,
      });
    }
  }

  // Overall savings
  if (cachedMpcResult.totalCostEur > 0) {
    recs.push({
      id: 'mpc-savings',
      severity: 'neutral',
      titleKey: 'optimizer.mpcDayCost',
      descriptionKey: 'optimizer.mpcDayCostDesc',
      value: `${cachedMpcResult.totalCostEur.toFixed(2)} €`,
    });
  }

  return recs;
}

// ─── Rule-based + MPC recommendations ───────────────────────────────

export function buildOptimizerRecommendations(
  energyData: EnergyData,
  settings: StoredSettings,
): OptimizerRecommendation[] {
  const recommendations: OptimizerRecommendation[] = [];
  const pvSurplus = Math.max(
    0,
    energyData.pvPower - energyData.houseLoad - energyData.heatPumpPower - energyData.evPower,
  );

  // MPC-enhanced recommendations (from cached result)
  const mpcRecs = getMpcRecommendations();
  recommendations.push(...mpcRecs);

  if (energyData.priceCurrent <= settings.chargeThreshold) {
    recommendations.push({
      id: 'charge-window',
      severity: 'positive',
      titleKey: 'ai.batteryStrategy',
      descriptionKey: 'ai.statusCharge',
      value: `${energyData.priceCurrent.toFixed(3)} €/kWh`,
    });
  }

  if (pvSurplus > 1800) {
    recommendations.push({
      id: 'pv-surplus',
      severity: 'positive',
      titleKey: 'ai.evStrategy',
      descriptionKey: 'ai.statusOptimal',
      value: `${Math.round(pvSurplus)} W`,
    });
  }

  if (energyData.batterySoC > 65 && energyData.priceCurrent < settings.chargeThreshold + 0.03) {
    recommendations.push({
      id: 'sg-ready',
      severity: 'warning',
      titleKey: 'ai.heatPumpStrategy',
      descriptionKey: 'ai.statusHeatPump',
      value: 'SG Ready',
    });
  }

  if (energyData.gridPower / 1000 > settings.maxGridImportKw) {
    recommendations.push({
      id: 'grid-limit',
      severity: 'critical',
      titleKey: 'ai.nextBestAction',
      descriptionKey: 'ai.statusCaution',
      value: `${(energyData.gridPower / 1000).toFixed(1)} kW`,
    });
  }

  if (recommendations.length === 0) {
    recommendations.push({
      id: 'balanced',
      severity: 'neutral',
      titleKey: 'ai.forecast',
      descriptionKey: 'dashboard.refreshed',
      value: `${energyData.priceCurrent.toFixed(3)} €/kWh`,
    });
  }

  return recommendations;
}
