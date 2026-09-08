import { describe, expect, it } from 'vitest';
import type { EnergySnapshot } from '../lib/db';
import {
  aggregateDaily,
  aggregateHourly,
  aggregateMonthly,
  calculateAccuracy,
  forecastHoltWinters,
  forecastLinearRegression,
  forecastMovingAverage,
  getForecastableMetrics,
  runAllForecasts,
  runForecast,
} from '../lib/ml-forecast';

function makeSnapshots(count: number, hourStepMs = 3_600_000): EnergySnapshot[] {
  const start = Date.UTC(2026, 0, 1, 0, 0, 0);
  return Array.from({ length: count }, (_, index) => {
    const hour = index % 24;
    const sunFactor = hour >= 6 && hour <= 20 ? Math.sin(((hour - 6) / 14) * Math.PI) : 0;
    return {
      timestamp: start + index * hourStepMs,
      gridPower: 400 + index * 5,
      pvPower: Math.round(3000 * sunFactor + index * 10),
      batteryPower: -300 + (index % 5) * 40,
      houseLoad: 1200 + (hour >= 17 && hour <= 21 ? 500 : 0),
      batterySoC: 40 + (index % 30),
      heatPumpPower: 500,
      evPower: hour >= 22 || hour <= 5 ? 2000 : 0,
      gridVoltage: 230,
      batteryVoltage: 52,
      pvYieldToday: 8,
      priceCurrent: 0.2 + (index % 10) * 0.01,
    };
  });
}

describe('ml-forecast aggregation', () => {
  it('returns empty aggregates for empty input', () => {
    expect(aggregateHourly([], 'pvPower')).toEqual([]);
    expect(aggregateDaily([])).toEqual([]);
    expect(aggregateMonthly([])).toEqual([]);
  });

  it('aggregates hourly, daily, and monthly energy metrics', () => {
    const snapshots = makeSnapshots(72);
    const hourly = aggregateHourly(snapshots, 'pvPower');
    expect(hourly.length).toBeGreaterThan(0);
    expect(hourly[0]?.count).toBeGreaterThan(0);

    const daily = aggregateDaily(snapshots, 0.28, 0.08);
    expect(daily.length).toBeGreaterThan(0);
    expect(daily[0]?.pvGenerationKwh).toBeGreaterThanOrEqual(0);

    const monthly = aggregateMonthly(daily);
    expect(monthly.length).toBeGreaterThan(0);
    expect(monthly[0]?.daysWithData).toBe(daily.length);
  });
});

describe('ml-forecast models', () => {
  const series = Array.from({ length: 60 }, (_, index) => 1000 + Math.sin(index / 4) * 250);

  it('produces forecast points from each model family', () => {
    const holt = forecastHoltWinters(series, 24, 12);
    const linear = forecastLinearRegression(series, 12);
    const moving = forecastMovingAverage(series, 12, 8);

    expect(holt).toHaveLength(12);
    expect(linear).toHaveLength(12);
    expect(moving).toHaveLength(8);
    expect(holt[0]?.value).toBeGreaterThanOrEqual(0);
    expect(holt[0]?.lower).toBeLessThanOrEqual(holt[0]?.upper ?? 0);
  });

  it('calculates accuracy metrics for aligned actual/predicted arrays', () => {
    const accuracy = calculateAccuracy([10, 20, 30], [12, 18, 33]);
    expect(accuracy.mae).toBeGreaterThan(0);
    expect(accuracy.rmse).toBeGreaterThan(0);
    expect(accuracy.mape).toBeGreaterThan(0);
    expect(accuracy.r2).toBeLessThanOrEqual(1);
  });

  it('falls back to moving average when Holt-Winters lacks seasonal depth', () => {
    const shortSeries = [100, 120, 110, 130];
    const points = forecastHoltWinters(shortSeries, 24, 6);
    expect(points).toHaveLength(6);
  });
});

describe('ml-forecast high-level API', () => {
  it('exposes forecastable metrics metadata', () => {
    const metrics = getForecastableMetrics();
    expect(metrics.some((metric) => metric.key === 'pvPower')).toBe(true);
    expect(metrics.some((metric) => metric.key === 'houseLoad')).toBe(true);
  });

  it('selects Holt-Winters for sufficiently long histories', () => {
    const result = runForecast(makeSnapshots(72), 'pvPower', 24);
    expect(result.model).toBe('holt-winters');
    expect(result.points).toHaveLength(24);
    expect(result.training.samplesUsed).toBeGreaterThanOrEqual(48);
  });

  it('uses lighter models for short histories', () => {
    const shortResult = runForecast(makeSnapshots(8), 'houseLoad', 6);
    expect(['linear-regression', 'moving-average']).toContain(shortResult.model);
    expect(shortResult.points).toHaveLength(6);
  });

  it('runs forecasts for all configured metrics', () => {
    const results = runAllForecasts(makeSnapshots(72), 12);
    expect(results).toHaveLength(getForecastableMetrics().length);
    expect(results.every((result) => result.points.length === 12)).toBe(true);
  });
});
