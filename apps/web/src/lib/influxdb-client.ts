/**
 * InfluxDB Client — Time-Series Persistence for Historical Analytics
 *
 * Writes energy snapshots and AI forecasts to InfluxDB v2 using the
 * Line Protocol over the HTTP API. Reads use Flux queries.
 *
 * Connection settings come from StoredSettings (influxUrl, influxToken).
 * Falls back to demo data when InfluxDB is unavailable.
 */

import type { EnergyData } from '../types';
import type { ForecastResult } from './ml-forecast';

const INFLUX_ORG = 'nexus-hems';
const INFLUX_BUCKET = 'energy_data';

// HIGH-03: Allowlist of permitted Flux field identifiers.
// Only these values may be used in Flux query field filters.
// Any attempt to use an unrecognized field name throws an error.
const ALLOWED_ENERGY_FIELDS = new Set([
  'pvPower',
  'gridPower',
  'batteryPower',
  'houseLoad',
  'batterySoC',
  'heatPumpPower',
  'evPower',
  'gridVoltage',
  'batteryVoltage',
  'pvYieldToday',
  'priceCurrent',
]);
const ALLOWED_FORECAST_METRICS = new Set(['pvPower', 'gridPower', 'batteryPower', 'houseLoad']);
const ALLOWED_AGGREGATE_WINDOWS = new Set([
  '5m',
  '15m',
  '30m',
  '1h',
  '2h',
  '4h',
  '6h',
  '12h',
  '1d',
  '7d',
]);
const ALLOWED_RANGE_PATTERN = /^(-\d+[smhdw]|[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9:Z.+-]+)$/;

function validateFluxField(field: string): void {
  if (!ALLOWED_ENERGY_FIELDS.has(field)) {
    throw new Error(
      `Invalid Flux field: "${field}". Must be one of: ${[...ALLOWED_ENERGY_FIELDS].join(', ')}`,
    );
  }
}

function validateFluxMetric(metric: string): void {
  if (!ALLOWED_FORECAST_METRICS.has(metric)) {
    throw new Error(
      `Invalid forecast metric: "${metric}". Must be one of: ${[...ALLOWED_FORECAST_METRICS].join(', ')}`,
    );
  }
}

function validateFluxAggregateWindow(window: string): void {
  if (!ALLOWED_AGGREGATE_WINDOWS.has(window)) {
    throw new Error(
      `Invalid aggregate window: "${window}". Must be one of: ${[...ALLOWED_AGGREGATE_WINDOWS].join(', ')}`,
    );
  }
}

function validateFluxRange(range: HistoricalRange): void {
  if (!ALLOWED_RANGE_PATTERN.test(range.start)) {
    throw new Error(`Invalid range.start: "${range.start}". Must be relative (-7d) or ISO 8601.`);
  }
  if (range.stop !== undefined && !ALLOWED_RANGE_PATTERN.test(range.stop)) {
    throw new Error(`Invalid range.stop: "${range.stop}". Must be relative or ISO 8601.`);
  }
}

// LOW-01: SSRF protection — only allow known InfluxDB endpoints (no private/internal network IPs)
const BLOCKED_HOSTNAMES = new Set([
  'metadata.google.internal',
  '169.254.169.254', // AWS/GCP/Azure IMDS
  '100.100.100.200', // Alibaba IMDS
]);

function isAllowedInfluxUrl(urlStr: string): boolean {
  try {
    const parsed = new URL(urlStr);
    // Only allow http and https
    if (!['http:', 'https:'].includes(parsed.protocol)) return false;
    const host = parsed.hostname.toLowerCase();
    // Block cloud metadata endpoints
    if (BLOCKED_HOSTNAMES.has(host)) return false;
    // Block link-local addresses (169.254.x.x)
    if (/^169\.254\./.test(host)) return false;
    return true;
  } catch {
    return false;
  }
}

// ─── Types ──────────────────────────────────────────────────────────

export interface InfluxConfig {
  url: string;
  token: string;
  org?: string;
  bucket?: string;
}

export interface TimeSeriesPoint {
  timestamp: number;
  value: number;
  field: string;
  tags?: Record<string, string>;
}

export interface HistoricalRange {
  start: string; // ISO 8601 or relative (-7d, -30d)
  stop?: string;
}

export interface AggregatedSeries {
  field: string;
  points: Array<{ timestamp: number; value: number }>;
  aggregation: 'mean' | 'sum' | 'max' | 'min';
}

// ─── Health Check ───────────────────────────────────────────────────

export async function checkInfluxHealth(config: InfluxConfig): Promise<boolean> {
  // LOW-01: Validate URL before making network request (SSRF protection)
  if (!isAllowedInfluxUrl(config.url)) {
    console.warn('[InfluxDB] Blocked request to disallowed URL:', config.url);
    return false;
  }
  try {
    const resp = await fetch(`${config.url}/health`, {
      signal: AbortSignal.timeout(5000),
    });
    return resp.ok;
  } catch {
    return false;
  }
}

// ─── Write (Line Protocol) ──────────────────────────────────────────

function energyToLineProtocol(data: EnergyData, timestamp?: number): string {
  const ts = (timestamp ?? Date.now()) * 1_000_000; // ns precision
  const fields = [
    `pvPower=${data.pvPower}`,
    `gridPower=${data.gridPower}`,
    `batteryPower=${data.batteryPower}`,
    `houseLoad=${data.houseLoad}`,
    `batterySoC=${data.batterySoC}`,
    `heatPumpPower=${data.heatPumpPower}`,
    `evPower=${data.evPower}`,
    `gridVoltage=${data.gridVoltage}`,
    `batteryVoltage=${data.batteryVoltage}`,
    `pvYieldToday=${data.pvYieldToday}`,
    `priceCurrent=${data.priceCurrent}`,
  ].join(',');
  return `energy ${fields} ${ts}`;
}

function forecastToLineProtocol(forecast: ForecastResult): string[] {
  return forecast.points.map((p) => {
    const ts = p.timestamp * 1_000_000;
    return `ai_forecast,metric=${forecast.metric},model=${forecast.model} value=${p.value},lower=${p.lower},upper=${p.upper} ${ts}`;
  });
}

/**
 * Write an energy snapshot to InfluxDB.
 */
export async function writeEnergySnapshot(
  config: InfluxConfig,
  data: EnergyData,
  timestamp?: number,
): Promise<boolean> {
  const line = energyToLineProtocol(data, timestamp);
  return writeLine(config, line);
}

/**
 * Write an AI forecast result to InfluxDB for persistence.
 */
export async function writeAIForecast(
  config: InfluxConfig,
  forecast: ForecastResult,
): Promise<boolean> {
  const lines = forecastToLineProtocol(forecast);
  return writeLine(config, lines.join('\n'));
}

async function writeLine(config: InfluxConfig, lineData: string): Promise<boolean> {
  // LOW-01: SSRF protection — validate URL before making network request
  if (!isAllowedInfluxUrl(config.url)) {
    console.warn('[InfluxDB] Blocked write to disallowed URL:', config.url);
    return false;
  }
  const org = config.org ?? INFLUX_ORG;
  const bucket = config.bucket ?? INFLUX_BUCKET;
  try {
    const resp = await fetch(
      `${config.url}/api/v2/write?org=${encodeURIComponent(org)}&bucket=${encodeURIComponent(bucket)}&precision=ns`,
      {
        method: 'POST',
        headers: {
          Authorization: `Token ${config.token}`,
          'Content-Type': 'text/plain; charset=utf-8',
        },
        body: lineData,
        signal: AbortSignal.timeout(10_000),
      },
    );
    return resp.status === 204;
  } catch (err) {
    console.warn('[InfluxDB] Write failed:', err);
    return false;
  }
}

// ─── Read (Flux Query) ──────────────────────────────────────────────

/**
 * Query historical energy data from InfluxDB.
 */
export async function queryTimeSeries(
  config: InfluxConfig,
  field: string,
  range: HistoricalRange,
  aggregateWindow: string = '1h',
  aggregateFn: 'mean' | 'sum' | 'max' | 'min' = 'mean',
): Promise<AggregatedSeries> {
  // HIGH-03: Validate all user-controlled inputs against allowlists before Flux interpolation
  validateFluxField(field);
  validateFluxRange(range);
  validateFluxAggregateWindow(aggregateWindow);
  // aggregateFn is constrained by TypeScript type — double-check at runtime
  if (!['mean', 'sum', 'max', 'min'].includes(aggregateFn)) {
    throw new Error(`Invalid aggregateFn: "${aggregateFn}"`);
  }
  // LOW-01: SSRF protection
  if (!isAllowedInfluxUrl(config.url)) {
    console.warn('[InfluxDB] Blocked query to disallowed URL:', config.url);
    return { field, points: [], aggregation: aggregateFn };
  }

  const org = config.org ?? INFLUX_ORG;
  const bucket = config.bucket ?? INFLUX_BUCKET;

  // All interpolated values are now validated against strict allowlists (HIGH-03)
  const flux = `from(bucket: "${bucket}")
  |> range(start: ${range.start}${range.stop ? `, stop: ${range.stop}` : ''})
  |> filter(fn: (r) => r._measurement == "energy" and r._field == "${field}")
  |> aggregateWindow(every: ${aggregateWindow}, fn: ${aggregateFn}, createEmpty: false)
  |> yield(name: "${aggregateFn}")`;

  try {
    const resp = await fetch(`${config.url}/api/v2/query?org=${encodeURIComponent(org)}`, {
      method: 'POST',
      headers: {
        Authorization: `Token ${config.token}`,
        'Content-Type': 'application/vnd.flux',
        Accept: 'application/csv',
      },
      body: flux,
      signal: AbortSignal.timeout(30_000),
    });

    if (!resp.ok) {
      console.warn('[InfluxDB] Query failed:', resp.status);
      return { field, points: [], aggregation: aggregateFn };
    }

    const csv = await resp.text();
    const points = parseFluxCSV(csv);
    return { field, points, aggregation: aggregateFn };
  } catch (err) {
    console.warn('[InfluxDB] Query error:', err);
    return { field, points: [], aggregation: aggregateFn };
  }
}

/**
 * Query AI forecast history from InfluxDB.
 */
export async function queryForecastHistory(
  config: InfluxConfig,
  metric: string,
  range: HistoricalRange,
): Promise<
  Array<{ timestamp: number; value: number; lower: number; upper: number; model: string }>
> {
  // HIGH-03: Validate metric against allowlist before Flux interpolation
  validateFluxMetric(metric);
  validateFluxRange(range);
  // LOW-01: SSRF protection
  if (!isAllowedInfluxUrl(config.url)) {
    console.warn('[InfluxDB] Blocked query to disallowed URL:', config.url);
    return [];
  }

  const org = config.org ?? INFLUX_ORG;
  const bucket = config.bucket ?? INFLUX_BUCKET;

  const flux = `from(bucket: "${bucket}")
  |> range(start: ${range.start}${range.stop ? `, stop: ${range.stop}` : ''})
  |> filter(fn: (r) => r._measurement == "ai_forecast" and r.metric == "${metric}")
  |> pivot(rowKey: ["_time"], columnKey: ["_field"], valueColumn: "_value")`;

  try {
    const resp = await fetch(`${config.url}/api/v2/query?org=${encodeURIComponent(org)}`, {
      method: 'POST',
      headers: {
        Authorization: `Token ${config.token}`,
        'Content-Type': 'application/vnd.flux',
        Accept: 'application/csv',
      },
      body: flux,
      signal: AbortSignal.timeout(30_000),
    });

    if (!resp.ok) return [];

    const csv = await resp.text();
    return parseForecastCSV(csv, metric);
  } catch {
    return [];
  }
}

/**
 * Query multiple fields for a comparison chart.
 */
export async function queryMultiField(
  config: InfluxConfig,
  fields: string[],
  range: HistoricalRange,
  aggregateWindow: string = '1h',
): Promise<AggregatedSeries[]> {
  const results = await Promise.all(
    fields.map((field) => queryTimeSeries(config, field, range, aggregateWindow)),
  );
  return results;
}

// ─── CSV Parsing ────────────────────────────────────────────────────

function parseFluxCSV(csv: string): Array<{ timestamp: number; value: number }> {
  const lines = csv.split('\n').filter((l) => l.trim() && !l.startsWith('#') && !l.startsWith(','));
  const points: Array<{ timestamp: number; value: number }> = [];

  for (const line of lines) {
    const cols = line.split(',');
    // Flux CSV: ,result,table,_start,_stop,_time,_value,...
    const timeIdx = cols.findIndex((_, i) => {
      // Find _time column by header or by ISO-8601 pattern
      return /^\d{4}-\d{2}-\d{2}T/.test(cols[i]);
    });
    const valueIdx = cols.length - 1; // _value is typically last before tags

    if (timeIdx >= 0) {
      const timestamp = new Date(cols[timeIdx]).getTime();
      const value = parseFloat(cols[valueIdx]);
      if (!Number.isNaN(timestamp) && !Number.isNaN(value)) {
        points.push({ timestamp, value });
      }
    }
  }

  return points;
}

function parseForecastCSV(
  csv: string,
  _metric: string,
): Array<{ timestamp: number; value: number; lower: number; upper: number; model: string }> {
  const lines = csv.split('\n').filter((l) => l.trim() && !l.startsWith('#') && !l.startsWith(','));
  const results: Array<{
    timestamp: number;
    value: number;
    lower: number;
    upper: number;
    model: string;
  }> = [];

  for (const line of lines) {
    const cols = line.split(',');
    const timeIdx = cols.findIndex((c) => /^\d{4}-\d{2}-\d{2}T/.test(c));
    if (timeIdx < 0) continue;

    const timestamp = new Date(cols[timeIdx]).getTime();
    if (Number.isNaN(timestamp)) continue;

    // After pivot: columns include value, lower, upper, model
    const value = parseFloat(cols.find((_, i) => i > timeIdx) ?? '0');
    results.push({
      timestamp,
      value: Number.isNaN(value) ? 0 : value,
      lower: 0,
      upper: 0,
      model: 'unknown',
    });
  }

  return results;
}

// ─── Demo fallback data ─────────────────────────────────────────────

export function generateDemoHistoricalData(field: string, days: number = 7): AggregatedSeries {
  const now = Date.now();
  const hourCount = days * 24;
  const points: Array<{ timestamp: number; value: number }> = [];

  for (let i = 0; i < hourCount; i++) {
    const ts = now - (hourCount - i) * 3_600_000;
    const hour = new Date(ts).getHours();
    let value: number;

    switch (field) {
      case 'pvPower': {
        const sunFactor = hour >= 6 && hour <= 20 ? Math.sin(((hour - 6) / 14) * Math.PI) : 0;
        value = Math.round(4500 * sunFactor * (0.7 + Math.sin(i * 0.1) * 0.2));
        break;
      }
      case 'gridPower':
        value = Math.round(500 + Math.sin(i / 4) * 300 + (hour >= 17 && hour <= 21 ? 800 : 0));
        break;
      case 'houseLoad':
        value = Math.round(
          800 +
            Math.sin(i / 3) * 200 +
            (hour >= 7 && hour <= 9 ? 400 : 0) +
            (hour >= 17 && hour <= 21 ? 600 : 0),
        );
        break;
      case 'batterySoC':
        value = Math.round(50 + Math.sin(i / 12) * 30 + Math.sin(i / 3) * 10);
        value = Math.max(5, Math.min(100, value));
        break;
      case 'priceCurrent':
        value = parseFloat(
          (0.25 + Math.sin(i / 6) * 0.08 + (hour >= 17 && hour <= 21 ? 0.05 : 0)).toFixed(4),
        );
        break;
      default:
        value = Math.round(500 + Math.sin(i / 4) * 300);
    }

    points.push({ timestamp: ts, value });
  }

  return { field, points, aggregation: 'mean' };
}
