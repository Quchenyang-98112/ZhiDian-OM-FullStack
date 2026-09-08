/**
 * ML Forecast Engine — Time-Series Prediction for Energy Data
 *
 * Implements a lightweight client-side forecasting system using:
 *   1. Triple Exponential Smoothing (Holt-Winters) for seasonal patterns
 *   2. Linear regression for trend extraction
 *   3. Moving average with seasonal decomposition
 *
 * Designed for browser-side execution without heavy ML libraries.
 * For TensorFlow.js LSTM or Prophet.js, the engine exposes a pluggable
 * `ForecastModel` interface that can be swapped in when those libraries
 * are loaded.
 *
 * Input: Historical EnergySnapshot[] from IndexedDB
 * Output: ForecastResult with hourly/daily predictions + confidence intervals
 */

import type { EnergyData } from '../types';
import type { EnergySnapshot } from './db';

// ─── Types ──────────────────────────────────────────────────────────

/** A single forecast data point */
export interface ForecastPoint {
  /** Predicted timestamp (Unix ms) */
  timestamp: number;
  /** Predicted value */
  value: number;
  /** Lower bound of confidence interval (95%) */
  lower: number;
  /** Upper bound of confidence interval (95%) */
  upper: number;
}

/** Result of a forecast run */
export interface ForecastResult {
  /** Name of the metric being forecast */
  metric: keyof EnergyData;
  /** Human-readable metric label */
  label: string;
  /** Unit of the metric */
  unit: string;
  /** Forecast data points */
  points: ForecastPoint[];
  /** Model accuracy metrics */
  accuracy: {
    /** Mean Absolute Error on training data */
    mae: number;
    /** Mean Absolute Percentage Error (%) */
    mape: number;
    /** Root Mean Square Error */
    rmse: number;
    /** R² score (coefficient of determination) */
    r2: number;
  };
  /** Which model produced this forecast */
  model: 'holt-winters' | 'linear-regression' | 'moving-average' | 'tfjs-lstm' | 'prophet';
  /** Training data statistics */
  training: {
    samplesUsed: number;
    timeSpanHours: number;
    seasonalPeriod: number;
  };
}

/** Aggregated historical data point (hourly bucket) */
export interface HourlyAggregate {
  /** Hour bucket start timestamp */
  timestamp: number;
  /** Average value for the metric in this bucket */
  avg: number;
  /** Min value */
  min: number;
  /** Max value */
  max: number;
  /** Number of samples in this bucket */
  count: number;
}

/** Daily aggregated data point */
export interface DailyAggregate {
  /** Day (YYYY-MM-DD) */
  date: string;
  /** Timestamp of day start */
  timestamp: number;
  /** Daily totals / averages per metric */
  pvGenerationKwh: number;
  gridImportKwh: number;
  gridExportKwh: number;
  consumptionKwh: number;
  selfConsumptionRate: number;
  autarkyRate: number;
  co2SavedKg: number;
  costSavingsEur: number;
  avgBatterySoC: number;
  peakPvPowerW: number;
  peakLoadW: number;
}

/** Monthly aggregated data */
export interface MonthlyAggregate {
  /** Month key "YYYY-MM" */
  month: string;
  /** Timestamp of month start */
  timestamp: number;
  /** Totals for the month */
  pvGenerationKwh: number;
  gridImportKwh: number;
  gridExportKwh: number;
  consumptionKwh: number;
  selfConsumptionRate: number;
  autarkyRate: number;
  co2SavedKg: number;
  costSavingsEur: number;
  avgPricePerKwh: number;
  daysWithData: number;
}

// ─── Constants ──────────────────────────────────────────────────────

/** UBA grid emission factor (g CO₂/kWh) — Umweltbundesamt 2025 */
const UBA_CO2_FACTOR_2025 = 380;

/** Forecasting configuration */
const SEASONAL_PERIOD = 24; // 24 hours = daily seasonality
const CONFIDENCE_Z = 1.96; // 95% confidence interval

// ─── Aggregation Functions ──────────────────────────────────────────

/**
 * Aggregate snapshots into hourly buckets for a given metric.
 */
export function aggregateHourly(
  snapshots: EnergySnapshot[],
  metric: keyof EnergyData,
): HourlyAggregate[] {
  if (snapshots.length === 0) return [];

  const buckets = new Map<number, number[]>();

  for (const snap of snapshots) {
    const hourStart = Math.floor(snap.timestamp / 3_600_000) * 3_600_000;
    const values = buckets.get(hourStart) ?? [];
    const value = snap[metric] as number;
    if (typeof value === 'number' && Number.isFinite(value)) {
      values.push(value);
      buckets.set(hourStart, values);
    }
  }

  return Array.from(buckets.entries())
    .sort(([a], [b]) => a - b)
    .map(([timestamp, values]) => ({
      timestamp,
      avg: values.reduce((a, b) => a + b, 0) / values.length,
      min: Math.min(...values),
      max: Math.max(...values),
      count: values.length,
    }));
}

/**
 * Aggregate snapshots into daily summaries.
 */
export function aggregateDaily(
  snapshots: EnergySnapshot[],
  gridPriceAvg: number = 0.25,
  feedInTariff: number = 0.082,
): DailyAggregate[] {
  if (snapshots.length === 0) return [];

  const days = new Map<string, EnergySnapshot[]>();

  for (const snap of snapshots) {
    const date = new Date(snap.timestamp);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    const group = days.get(key) ?? [];
    group.push(snap);
    days.set(key, group);
  }

  return Array.from(days.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, snaps]) => {
      const n = snaps.length;
      const intervalHours =
        n > 1 ? (snaps[n - 1].timestamp - snaps[0].timestamp) / 3_600_000 / (n - 1) : 1 / 60; // assume 1min default

      const avgPv = snaps.reduce((s, d) => s + d.pvPower, 0) / n;
      const avgLoad = snaps.reduce((s, d) => s + d.houseLoad, 0) / n;
      const avgBatSoC = snaps.reduce((s, d) => s + d.batterySoC, 0) / n;

      const pvKwh = (avgPv / 1000) * intervalHours * n;
      const gridImport = snaps.reduce((s, d) => s + Math.max(0, d.gridPower), 0) / n;
      const gridExport = snaps.reduce((s, d) => s + Math.max(0, -d.gridPower), 0) / n;
      const gridImportKwh = (gridImport / 1000) * intervalHours * n;
      const gridExportKwh = (gridExport / 1000) * intervalHours * n;
      const consumptionKwh = (avgLoad / 1000) * intervalHours * n;

      const selfConsumed = Math.max(0, pvKwh - gridExportKwh);
      const selfConsumptionRate = pvKwh > 0 ? (selfConsumed / pvKwh) * 100 : 0;
      const autarkyRate =
        consumptionKwh > 0 ? Math.min(100, (selfConsumed / consumptionKwh) * 100) : 0;

      const co2SavedKg = (selfConsumed * UBA_CO2_FACTOR_2025) / 1000;
      const costSavingsEur = selfConsumed * gridPriceAvg + gridExportKwh * feedInTariff;

      return {
        date,
        timestamp: new Date(date).getTime(),
        pvGenerationKwh: Math.max(0, pvKwh),
        gridImportKwh: Math.max(0, gridImportKwh),
        gridExportKwh: Math.max(0, gridExportKwh),
        consumptionKwh: Math.max(0, consumptionKwh),
        selfConsumptionRate,
        autarkyRate,
        co2SavedKg,
        costSavingsEur,
        avgBatterySoC: avgBatSoC,
        peakPvPowerW: Math.max(...snaps.map((d) => d.pvPower)),
        peakLoadW: Math.max(...snaps.map((d) => d.houseLoad)),
      };
    });
}

/**
 * Aggregate daily data into monthly summaries.
 */
export function aggregateMonthly(dailyData: DailyAggregate[]): MonthlyAggregate[] {
  if (dailyData.length === 0) return [];

  const months = new Map<string, DailyAggregate[]>();

  for (const day of dailyData) {
    const monthKey = day.date.slice(0, 7); // "YYYY-MM"
    const group = months.get(monthKey) ?? [];
    group.push(day);
    months.set(monthKey, group);
  }

  return Array.from(months.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, days]) => {
      const totalPv = days.reduce((s, d) => s + d.pvGenerationKwh, 0);
      const totalImport = days.reduce((s, d) => s + d.gridImportKwh, 0);
      const totalExport = days.reduce((s, d) => s + d.gridExportKwh, 0);
      const totalConsumption = days.reduce((s, d) => s + d.consumptionKwh, 0);
      const totalCo2 = days.reduce((s, d) => s + d.co2SavedKg, 0);
      const totalSavings = days.reduce((s, d) => s + d.costSavingsEur, 0);

      const selfConsumed = Math.max(0, totalPv - totalExport);
      const selfConsumptionRate = totalPv > 0 ? (selfConsumed / totalPv) * 100 : 0;
      const autarkyRate =
        totalConsumption > 0 ? Math.min(100, (selfConsumed / totalConsumption) * 100) : 0;

      return {
        month,
        timestamp: new Date(`${month}-01`).getTime(),
        pvGenerationKwh: totalPv,
        gridImportKwh: totalImport,
        gridExportKwh: totalExport,
        consumptionKwh: totalConsumption,
        selfConsumptionRate,
        autarkyRate,
        co2SavedKg: totalCo2,
        costSavingsEur: totalSavings,
        avgPricePerKwh: totalImport > 0 ? totalSavings / totalImport : 0,
        daysWithData: days.length,
      };
    });
}

// ─── Forecasting Models ─────────────────────────────────────────────

/**
 * Holt-Winters Triple Exponential Smoothing with additive seasonality.
 * Best for data with clear daily patterns (PV, consumption).
 */
export function forecastHoltWinters(
  data: number[],
  seasonLength: number = SEASONAL_PERIOD,
  horizonSteps: number = 24,
  alpha: number = 0.3,
  beta: number = 0.1,
  gamma: number = 0.3,
): ForecastPoint[] {
  if (data.length < seasonLength * 2) {
    // Not enough data — fall back to moving average
    return forecastMovingAverage(data, seasonLength, horizonSteps);
  }

  const n = data.length;

  // Initialize level & trend from first season
  let level = data.slice(0, seasonLength).reduce((a, b) => a + b, 0) / seasonLength;
  let trend = 0;
  if (n >= 2 * seasonLength) {
    const first = data.slice(0, seasonLength).reduce((a, b) => a + b, 0) / seasonLength;
    const second =
      data.slice(seasonLength, 2 * seasonLength).reduce((a, b) => a + b, 0) / seasonLength;
    trend = (second - first) / seasonLength;
  }

  // Initialize seasonal components
  const seasonal = new Array<number>(seasonLength);
  for (let i = 0; i < seasonLength; i++) {
    seasonal[i] = data[i] - level;
  }

  // Fit the model
  const fitted: number[] = [];
  const errors: number[] = [];

  for (let t = 0; t < n; t++) {
    const sIdx = t % seasonLength;
    const predicted = level + trend + seasonal[sIdx];
    fitted.push(predicted);
    errors.push(data[t] - predicted);

    const prevLevel = level;
    level = alpha * (data[t] - seasonal[sIdx]) + (1 - alpha) * (level + trend);
    trend = beta * (level - prevLevel) + (1 - beta) * trend;
    seasonal[sIdx] = gamma * (data[t] - level) + (1 - gamma) * seasonal[sIdx];
  }

  // Calculate error statistics for confidence intervals
  const mse = errors.reduce((s, e) => s + e * e, 0) / errors.length;
  const stdErr = Math.sqrt(mse);

  // Generate forecast
  const now = Date.now();
  const stepMs = 3_600_000; // 1 hour steps

  return Array.from({ length: horizonSteps }, (_, h) => {
    const sIdx = (n + h) % seasonLength;
    const forecast = level + trend * (h + 1) + seasonal[sIdx];
    // Confidence widens as horizon increases
    const intervalWidth = CONFIDENCE_Z * stdErr * Math.sqrt(1 + h / seasonLength);

    return {
      timestamp: now + (h + 1) * stepMs,
      value: Math.max(0, forecast),
      lower: Math.max(0, forecast - intervalWidth),
      upper: forecast + intervalWidth,
    };
  });
}

/**
 * Simple linear regression forecast.
 * Good for trend-dominant metrics (cumulative yield, prices).
 */
export function forecastLinearRegression(
  data: number[],
  horizonSteps: number = 24,
): ForecastPoint[] {
  const n = data.length;
  if (n < 3) return [];

  // Calculate linear regression: y = mx + b
  let sumX = 0,
    sumY = 0,
    sumXY = 0,
    sumX2 = 0;
  for (let i = 0; i < n; i++) {
    sumX += i;
    sumY += data[i];
    sumXY += i * data[i];
    sumX2 += i * i;
  }

  const det = n * sumX2 - sumX * sumX;
  if (det === 0) return [];

  const slope = (n * sumXY - sumX * sumY) / det;
  const intercept = (sumY - slope * sumX) / n;

  // Calculate residuals for confidence interval
  let sse = 0;
  for (let i = 0; i < n; i++) {
    const residual = data[i] - (slope * i + intercept);
    sse += residual * residual;
  }
  const stdErr = Math.sqrt(sse / (n - 2));

  const now = Date.now();
  const stepMs = 3_600_000;

  return Array.from({ length: horizonSteps }, (_, h) => {
    const x = n + h;
    const forecast = slope * x + intercept;
    const intervalWidth = CONFIDENCE_Z * stdErr * Math.sqrt(1 + 1 / n + (x - n / 2) ** 2 / sumX2);

    return {
      timestamp: now + (h + 1) * stepMs,
      value: Math.max(0, forecast),
      lower: Math.max(0, forecast - intervalWidth),
      upper: forecast + intervalWidth,
    };
  });
}

/**
 * Moving average forecast with seasonal decomposition.
 * Fallback when too little data for Holt-Winters.
 */
export function forecastMovingAverage(
  data: number[],
  window: number = SEASONAL_PERIOD,
  horizonSteps: number = 24,
): ForecastPoint[] {
  const n = data.length;
  if (n === 0) return [];

  const effWindow = Math.min(window, n);
  const recent = data.slice(-effWindow);
  const avg = recent.reduce((a, b) => a + b, 0) / effWindow;

  // Standard deviation for confidence
  const variance = recent.reduce((s, v) => s + (v - avg) ** 2, 0) / effWindow;
  const std = Math.sqrt(variance);

  const now = Date.now();
  const stepMs = 3_600_000;

  return Array.from({ length: horizonSteps }, (_, h) => {
    // Apply seasonal pattern from available data
    const seasonIdx = h % Math.min(n, window);
    const seasonValue = n > window ? data[n - window + seasonIdx] : data[seasonIdx % n];
    const forecast = avg + (seasonValue - avg) * 0.5; // blend toward mean

    const intervalWidth = CONFIDENCE_Z * std * Math.sqrt(1 + (h + 1) / effWindow);

    return {
      timestamp: now + (h + 1) * stepMs,
      value: Math.max(0, forecast),
      lower: Math.max(0, forecast - intervalWidth),
      upper: forecast + intervalWidth,
    };
  });
}

// ─── Model Accuracy Metrics ─────────────────────────────────────────

/**
 * Calculate forecast accuracy metrics via cross-validation.
 */
export function calculateAccuracy(
  actual: number[],
  predicted: number[],
): ForecastResult['accuracy'] {
  const n = Math.min(actual.length, predicted.length);
  if (n === 0) return { mae: 0, mape: 0, rmse: 0, r2: 0 };

  let sumAbsError = 0;
  let sumAbsPercentError = 0;
  let sumSquaredError = 0;
  let sumActual = 0;

  for (let i = 0; i < n; i++) {
    const error = actual[i] - predicted[i];
    sumAbsError += Math.abs(error);
    sumSquaredError += error * error;
    sumActual += actual[i];
    if (actual[i] !== 0) {
      sumAbsPercentError += Math.abs(error / actual[i]);
    }
  }

  const meanActual = sumActual / n;
  let ssTot = 0;
  for (let i = 0; i < n; i++) {
    ssTot += (actual[i] - meanActual) ** 2;
  }

  return {
    mae: sumAbsError / n,
    mape: (sumAbsPercentError / n) * 100,
    rmse: Math.sqrt(sumSquaredError / n),
    r2: ssTot > 0 ? 1 - sumSquaredError / ssTot : 0,
  };
}

// ─── High-Level Forecast API ────────────────────────────────────────

/** Metrics available for forecasting */
const FORECASTABLE_METRICS: {
  key: keyof EnergyData;
  label: string;
  unit: string;
}[] = [
  { key: 'pvPower', label: 'PV-Leistung', unit: 'W' },
  { key: 'houseLoad', label: 'Hausverbrauch', unit: 'W' },
  { key: 'gridPower', label: 'Netzleistung', unit: 'W' },
  { key: 'batteryPower', label: 'Batterieleistung', unit: 'W' },
  { key: 'priceCurrent', label: 'Strompreis', unit: '€/kWh' },
  { key: 'batterySoC', label: 'Batterie-SoC', unit: '%' },
];

/**
 * Run forecast on historical snapshots for a given metric.
 * Automatically selects the best model based on data availability.
 */
export function runForecast(
  snapshots: EnergySnapshot[],
  metric: keyof EnergyData,
  horizonHours: number = 24,
): ForecastResult {
  const metaInfo = FORECASTABLE_METRICS.find((m) => m.key === metric) ?? {
    key: metric,
    label: metric,
    unit: '',
  };

  // Aggregate to hourly data
  const hourly = aggregateHourly(snapshots, metric);
  const values = hourly.map((h) => h.avg);

  const timeSpanHours =
    hourly.length > 1 ? (hourly[hourly.length - 1].timestamp - hourly[0].timestamp) / 3_600_000 : 0;

  // Select model based on data availability
  let points: ForecastPoint[];
  let modelName: ForecastResult['model'];

  if (values.length >= SEASONAL_PERIOD * 2) {
    // Enough data for Holt-Winters (48+ hourly points)
    points = forecastHoltWinters(values, SEASONAL_PERIOD, horizonHours);
    modelName = 'holt-winters';
  } else if (values.length >= 6) {
    // Some data — use linear regression
    points = forecastLinearRegression(values, horizonHours);
    modelName = 'linear-regression';
  } else {
    // Very little data — moving average
    points = forecastMovingAverage(values, Math.min(values.length, 12), horizonHours);
    modelName = 'moving-average';
  }

  // Cross-validation: use last 20% as test set
  const splitIdx = Math.floor(values.length * 0.8);
  const trainValues = values.slice(0, splitIdx);
  const testValues = values.slice(splitIdx);

  let accuracy: ForecastResult['accuracy'] = { mae: 0, mape: 0, rmse: 0, r2: 0 };
  if (trainValues.length >= 6 && testValues.length >= 2) {
    const testPredictions =
      trainValues.length >= SEASONAL_PERIOD * 2
        ? forecastHoltWinters(trainValues, SEASONAL_PERIOD, testValues.length)
        : forecastLinearRegression(trainValues, testValues.length);
    accuracy = calculateAccuracy(
      testValues,
      testPredictions.map((p) => p.value),
    );
  }

  return {
    metric,
    label: metaInfo.label,
    unit: metaInfo.unit,
    points,
    accuracy,
    model: modelName,
    training: {
      samplesUsed: values.length,
      timeSpanHours,
      seasonalPeriod: SEASONAL_PERIOD,
    },
  };
}

/**
 * Run forecasts for all key metrics.
 */
export function runAllForecasts(
  snapshots: EnergySnapshot[],
  horizonHours: number = 24,
): ForecastResult[] {
  return FORECASTABLE_METRICS.map((m) => runForecast(snapshots, m.key, horizonHours));
}

/**
 * Get the list of forecastable metrics.
 */
export function getForecastableMetrics() {
  return FORECASTABLE_METRICS;
}
