/**
 * ai-worker.ts — Off-main-thread AI & optimization computation.
 *
 * Offloads CPU-intensive tasks from the main thread:
 *   - Optimizer recommendations (rule-based, per-tick)
 *   - Price history generation (48-point arrays)
 *   - Forecast analysis (min/max/avg/trend over large arrays)
 *   - Predictive AI recommendations (multi-variable analysis)
 *
 * With 10+ devices these computations cause visible jank on mobile.
 * Running them in a dedicated worker keeps the UI thread free for
 * 60 fps animations and D3 rendering.
 *
 * Uses Comlink for type-safe RPC.
 */

import * as Comlink from 'comlink';
import type {
  AIWorkerAPI,
  EnergyDataFull,
  ForecastSummary,
  OptimizerRecommendation,
  OptimizerSettings,
  PredictiveInput,
  PredictiveResult,
  PricePoint,
} from './worker-types';

// ─── Optimizer (ported from src/lib/optimizer.ts) ────────────────────

function computeRecommendations(
  energyData: EnergyDataFull,
  settings: OptimizerSettings,
): OptimizerRecommendation[] {
  const recommendations: OptimizerRecommendation[] = [];
  const pvSurplus = Math.max(
    0,
    energyData.pvPower - energyData.houseLoad - energyData.heatPumpPower - energyData.evPower,
  );

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

// ─── Price History (ported from src/lib/predictive-ai.ts) ────────────

function computePriceHistory(hours: number): PricePoint[] {
  const now = Date.now();
  return Array.from({ length: hours }, (_, i) => ({
    timestamp: now + i * 3600000,
    price: 0.15 + Math.sin(i / 4) * 0.08 + Math.random() * 0.03,
  }));
}

// ─── Forecast Analysis (ported from src/lib/predictive-ai.ts) ────────

function computeForecast(prices: PricePoint[]): ForecastSummary {
  const values = prices.map((p) => p.price);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const avg = values.reduce((a, b) => a + b, 0) / (values.length || 1);

  const half = Math.floor(values.length / 2);
  const first = values.slice(0, half);
  const second = values.slice(half);
  const firstAvg = first.reduce((a, b) => a + b, 0) / (first.length || 1);
  const secondAvg = second.reduce((a, b) => a + b, 0) / (second.length || 1);
  const trend: ForecastSummary['trend'] =
    secondAvg > firstAvg * 1.05 ? 'rising' : secondAvg < firstAvg * 0.95 ? 'falling' : 'stable';

  return { min, max, avg, trend };
}

// ─── Predictive AI (ported from src/lib/predictive-ai.ts) ────────────

function computePredictive(input: PredictiveInput): PredictiveResult {
  const { energyData, forecast, chargeThreshold } = input;

  // Find optimal time slot (lowest price in next 24h)
  const sortedForecast = [...forecast].sort((a, b) => a.pricePerKwh - b.pricePerKwh);
  const optimalSlot = sortedForecast[0];

  if (!optimalSlot) {
    return {
      action: 'wait',
      confidence: 0.5,
      reasoning: 'No forecast data available.',
      optimalTimeSlot: { start: Date.now(), end: Date.now() + 3600000, expectedPrice: 0 },
      estimatedSavings: 0,
    };
  }

  const currentPrice = energyData.priceCurrent;
  const potentialSavings = (currentPrice - optimalSlot.pricePerKwh) * 20;

  let action: PredictiveResult['action'] = 'wait';
  let reasoning = 'Monitoring tariff trends...';
  let confidence = 0.6;

  if (currentPrice < chargeThreshold) {
    action = 'charge_battery';
    reasoning = `Current price (${currentPrice.toFixed(3)} €/kWh) is below threshold. Excellent charging opportunity.`;
    confidence = 0.92;
  } else if (energyData.batterySoC > 70 && currentPrice < 0.18) {
    action = 'preheat';
    reasoning = 'Battery full, moderate prices. Preheat thermal storage via heat pump.';
    confidence = 0.85;
  } else if (potentialSavings > 2.0) {
    action = 'wait';
    reasoning = `Wait for optimal slot at ${new Date(optimalSlot.timestamp).toLocaleTimeString()} (save €${potentialSavings.toFixed(2)})`;
    confidence = 0.88;
  } else if (energyData.pvPower > 3000) {
    action = 'charge_ev';
    reasoning = 'High PV generation. Charge EV with surplus solar energy.';
    confidence = 0.95;
  }

  return {
    action,
    confidence,
    reasoning,
    optimalTimeSlot: {
      start: optimalSlot.timestamp,
      end: optimalSlot.timestamp + 3600000,
      expectedPrice: optimalSlot.pricePerKwh,
    },
    estimatedSavings: Math.max(0, potentialSavings),
  };
}

// ─── Comlink-exposed API ─────────────────────────────────────────────

const api: AIWorkerAPI = {
  computeRecommendations,
  computePriceHistory,
  computeForecast,
  computePredictive,
};

Comlink.expose(api);
