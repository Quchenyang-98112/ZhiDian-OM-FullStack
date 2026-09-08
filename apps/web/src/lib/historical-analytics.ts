/**
 * Historical Analytics — Aggregation, Trends & Data Management
 *
 * Retrieves energy history from IndexedDB, computes aggregated
 * statistics, and provides data for charts and reports.
 *
 * Uses ml-forecast.ts for aggregation and co2-report.ts for CO₂ balance.
 */

import type { EnergyData } from '../types';
import type { AnnualCo2Summary, Co2Balance } from './co2-report';
import { calculateAnnualCo2, calculateCo2Balance } from './co2-report';
import { type EnergySnapshot, nexusDb } from './db';
import type {
  DailyAggregate,
  ForecastResult,
  HourlyAggregate,
  MonthlyAggregate,
} from './ml-forecast';
import {
  aggregateDaily,
  aggregateHourly,
  aggregateMonthly,
  runAllForecasts,
  runForecast,
} from './ml-forecast';

// ─── Re-exports for consumer convenience ────────────────────────────

export type {
  AnnualCo2Summary,
  Co2Balance,
  DailyAggregate,
  ForecastResult,
  HourlyAggregate,
  MonthlyAggregate,
};

// ─── Snapshot Retrieval ─────────────────────────────────────────────

/**
 * Get all snapshots from IndexedDB within a time range.
 */
export async function getSnapshots(
  fromTimestamp: number,
  toTimestamp: number = Date.now(),
): Promise<EnergySnapshot[]> {
  return nexusDb.energySnapshots
    .where('timestamp')
    .between(fromTimestamp, toTimestamp, true, true)
    .toArray();
}

/**
 * Get snapshots for the last N hours.
 */
export async function getRecentSnapshots(hours: number): Promise<EnergySnapshot[]> {
  const from = Date.now() - hours * 3_600_000;
  return getSnapshots(from);
}

/**
 * Get snapshots for a specific month.
 */
export async function getMonthSnapshots(year: number, month: number): Promise<EnergySnapshot[]> {
  const from = new Date(year, month, 1).getTime();
  const to = new Date(year, month + 1, 1).getTime();
  return getSnapshots(from, to);
}

/**
 * Get total snapshot count and time range.
 */
export async function getSnapshotStats(): Promise<{
  count: number;
  oldest: number | null;
  newest: number | null;
  timeSpanHours: number;
}> {
  const count = await nexusDb.energySnapshots.count();
  if (count === 0) return { count: 0, oldest: null, newest: null, timeSpanHours: 0 };

  const oldest = await nexusDb.energySnapshots.orderBy('timestamp').first();
  const newest = await nexusDb.energySnapshots.orderBy('timestamp').reverse().first();

  const timeSpanHours = oldest && newest ? (newest.timestamp - oldest.timestamp) / 3_600_000 : 0;

  return {
    count,
    oldest: oldest?.timestamp ?? null,
    newest: newest?.timestamp ?? null,
    timeSpanHours,
  };
}

// ─── High-Level Analytics API ───────────────────────────────────────

/**
 * Get hourly aggregated data for a metric over the last N hours.
 */
export async function getHourlyData(
  metric: keyof EnergyData,
  hours: number = 24,
): Promise<HourlyAggregate[]> {
  const snapshots = await getRecentSnapshots(hours);
  return aggregateHourly(snapshots, metric);
}

/**
 * Get daily aggregated data for a date range.
 */
export async function getDailyData(
  fromTimestamp: number,
  toTimestamp: number = Date.now(),
  gridPriceAvg: number = 0.25,
  feedInTariff: number = 0.082,
): Promise<DailyAggregate[]> {
  const snapshots = await getSnapshots(fromTimestamp, toTimestamp);
  return aggregateDaily(snapshots, gridPriceAvg, feedInTariff);
}

/**
 * Get monthly aggregated data.
 */
export async function getMonthlyData(
  fromTimestamp: number,
  toTimestamp: number = Date.now(),
  gridPriceAvg: number = 0.25,
  feedInTariff: number = 0.082,
): Promise<MonthlyAggregate[]> {
  const daily = await getDailyData(fromTimestamp, toTimestamp, gridPriceAvg, feedInTariff);
  return aggregateMonthly(daily);
}

/**
 * Get CO₂ balance for a specific month.
 */
export async function getMonthlyCo2Balance(
  year: number,
  month: number,
  gridPriceAvg: number = 0.25,
  feedInTariff: number = 0.082,
  locale: string = 'de-DE',
): Promise<Co2Balance> {
  const snapshots = await getMonthSnapshots(year, month);
  const dailyData = aggregateDaily(snapshots, gridPriceAvg, feedInTariff);
  return calculateCo2Balance(dailyData, year, month, locale);
}

/**
 * Get annual CO₂ summary.
 */
export async function getAnnualCo2Summary(
  year: number,
  gridPriceAvg: number = 0.25,
  feedInTariff: number = 0.082,
  locale: string = 'de-DE',
): Promise<AnnualCo2Summary> {
  const from = new Date(year, 0, 1).getTime();
  const to = new Date(year + 1, 0, 1).getTime();
  const snapshots = await getSnapshots(from, to);
  return calculateAnnualCo2(snapshots, year, gridPriceAvg, feedInTariff, locale);
}

/**
 * Run ML forecast for a metric.
 */
export async function getForecast(
  metric: keyof EnergyData,
  horizonHours: number = 24,
  historyHours: number = 72,
): Promise<ForecastResult> {
  const snapshots = await getRecentSnapshots(historyHours);
  return runForecast(snapshots, metric, horizonHours);
}

/**
 * Run ML forecasts for all key metrics.
 */
export async function getAllForecasts(
  horizonHours: number = 24,
  historyHours: number = 72,
): Promise<ForecastResult[]> {
  const snapshots = await getRecentSnapshots(historyHours);
  return runAllForecasts(snapshots, horizonHours);
}

// ─── Extended Snapshot Persistence ──────────────────────────────────

/**
 * Enhanced snapshot persistence with configurable retention.
 * Keeps up to `maxSnapshots` entries, with daily rollups for older data.
 */
export async function persistSnapshotExtended(
  snapshot: EnergyData,
  maxSnapshots: number = 50_000,
): Promise<void> {
  await nexusDb.energySnapshots.add({ ...snapshot, timestamp: Date.now() });

  const count = await nexusDb.energySnapshots.count();
  if (count > maxSnapshots) {
    const excess = count - maxSnapshots;
    const oldest = await nexusDb.energySnapshots.orderBy('timestamp').limit(excess).primaryKeys();
    await nexusDb.energySnapshots.bulkDelete(oldest);
  }
}

/**
 * Get available months that have data.
 */
export async function getAvailableMonths(): Promise<
  { year: number; month: number; count: number }[]
> {
  const allSnapshots = await nexusDb.energySnapshots.orderBy('timestamp').toArray();
  if (allSnapshots.length === 0) return [];

  const months = new Map<string, number>();
  for (const snap of allSnapshots) {
    const d = new Date(snap.timestamp);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    months.set(key, (months.get(key) ?? 0) + 1);
  }

  return Array.from(months.entries()).map(([key, count]) => {
    const [year, month] = key.split('-').map(Number);
    return { year, month, count };
  });
}
