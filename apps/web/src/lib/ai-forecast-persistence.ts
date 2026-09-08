/**
 * AI Forecast Persistence — Stores forecasts to Dexie + InfluxDB
 *
 * Uses the configured BYOK AI provider for enhanced energy forecasts.
 * Results are persisted to:
 *   1. Dexie.js (IndexedDB) — offline-first local cache
 *   2. InfluxDB — long-term time-series storage (when configured)
 *
 * Retention: max 500 forecast records in Dexie, InfluxDB uses bucket retention.
 */

import { callAI } from '../core/aiClient';
import type { EnergyData } from '../types';
import { type AIForecastRecord, nexusDb } from './db';
import { checkInfluxHealth, type InfluxConfig, writeAIForecast } from './influxdb-client';
import type { ForecastResult } from './ml-forecast';

const MAX_FORECAST_RECORDS = 500;

// ─── AI-Enhanced Forecast ───────────────────────────────────────────

/**
 * Generate an AI-enhanced energy forecast using the active BYOK provider.
 * Combines real-time data with ML forecasts for improved accuracy.
 */
export async function generateAIForecast(
  energyData: EnergyData,
  mlForecast: ForecastResult,
): Promise<{ analysis: string; adjustedPoints: ForecastResult['points'] }> {
  const prompt = `Analyze this HEMS energy data and ML forecast. Return JSON only.

Current state:
- PV: ${energyData.pvPower}W, Grid: ${energyData.gridPower}W
- Battery: ${energyData.batterySoC}%, House: ${energyData.houseLoad}W
- Price: ${energyData.priceCurrent} €/kWh
- Heat Pump: ${energyData.heatPumpPower}W, EV: ${energyData.evPower}W

ML Forecast (${mlForecast.metric}, ${mlForecast.model}, R²=${mlForecast.accuracy.r2.toFixed(3)}):
${JSON.stringify(mlForecast.points.slice(0, 12).map((p) => ({ h: new Date(p.timestamp).getHours(), v: Math.round(p.value) })))}

Return JSON: { "analysis": "string with optimization insights", "adjustmentFactors": [numbers for each of 24 hours, 1.0 = no change] }`;

  try {
    const result = await callAI({ prompt, temperature: 0.3, maxTokens: 512 });
    const text = result.text;

    // Extract JSON from markdown code block if present
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return { analysis: text, adjustedPoints: mlForecast.points };
    }

    const parsed = JSON.parse(jsonMatch[0]) as {
      analysis: string;
      adjustmentFactors?: number[];
    };

    const adjustedPoints = mlForecast.points.map((p, i) => {
      const factor = parsed.adjustmentFactors?.[i] ?? 1.0;
      const clampedFactor = Math.max(0.5, Math.min(1.5, factor));
      return {
        ...p,
        value: p.value * clampedFactor,
        lower: p.lower * clampedFactor,
        upper: p.upper * clampedFactor,
      };
    });

    return { analysis: parsed.analysis, adjustedPoints };
  } catch (err) {
    console.warn('[AI] Forecast enhancement failed:', err);
    return {
      analysis: 'AI enhancement unavailable. Using ML forecast.',
      adjustedPoints: mlForecast.points,
    };
  }
}

// ─── Persistence ────────────────────────────────────────────────────

/**
 * Persist a forecast result to Dexie and optionally to InfluxDB.
 */
export async function persistForecast(
  forecast: ForecastResult,
  influxConfig?: InfluxConfig,
): Promise<void> {
  // Write to Dexie (always)
  const record: AIForecastRecord = {
    metric: forecast.metric,
    model: forecast.model,
    createdAt: Date.now(),
    horizonHours: forecast.points.length,
    accuracy: forecast.accuracy,
    points: forecast.points,
    persistedToInflux: false,
  };

  await nexusDb.aiForecastHistory.add(record);

  // Enforce retention limit
  const count = await nexusDb.aiForecastHistory.count();
  if (count > MAX_FORECAST_RECORDS) {
    const excess = count - MAX_FORECAST_RECORDS;
    const oldestKeys = await nexusDb.aiForecastHistory
      .orderBy('createdAt')
      .limit(excess)
      .primaryKeys();
    await nexusDb.aiForecastHistory.bulkDelete(oldestKeys);
  }

  // Write to InfluxDB (if configured)
  if (influxConfig?.url && influxConfig?.token) {
    const healthy = await checkInfluxHealth(influxConfig);
    if (healthy) {
      const written = await writeAIForecast(influxConfig, forecast);
      if (written) {
        // Mark the Dexie record as synced
        const lastId = await nexusDb.aiForecastHistory.orderBy('createdAt').reverse().first();
        if (lastId?.id) {
          await nexusDb.aiForecastHistory.update(lastId.id, { persistedToInflux: true });
        }
      }
    }
  }
}

/**
 * Get recent forecast history from Dexie.
 */
export async function getForecastHistory(
  metric?: string,
  limit: number = 20,
): Promise<AIForecastRecord[]> {
  const query = nexusDb.aiForecastHistory.orderBy('createdAt').reverse();
  if (metric) {
    const all = await query.toArray();
    return all.filter((r) => r.metric === metric).slice(0, limit);
  }
  return query.limit(limit).toArray();
}

/**
 * Get the last forecast for a specific metric.
 */
export async function getLastForecast(metric: string): Promise<AIForecastRecord | undefined> {
  const results = await getForecastHistory(metric, 1);
  return results[0];
}

/**
 * Sync unsynced forecasts to InfluxDB (background batch job).
 */
export async function syncPendingForecasts(influxConfig: InfluxConfig): Promise<number> {
  const unsynced = await nexusDb.aiForecastHistory
    .filter((r) => !r.persistedToInflux)
    .limit(50)
    .toArray();

  if (unsynced.length === 0) return 0;

  const healthy = await checkInfluxHealth(influxConfig);
  if (!healthy) return 0;

  let synced = 0;
  for (const record of unsynced) {
    const forecastResult: ForecastResult = {
      metric: record.metric as keyof EnergyData,
      model: record.model as ForecastResult['model'],
      points: record.points,
      label: record.metric,
      unit: '',
      accuracy: record.accuracy,
      training: { samplesUsed: 0, timeSpanHours: 0, seasonalPeriod: 0 },
    };
    const written = await writeAIForecast(influxConfig, forecastResult);
    if (written && record.id) {
      await nexusDb.aiForecastHistory.update(record.id, { persistedToInflux: true });
      synced++;
    }
  }

  return synced;
}
