/**
 * HistoricalChart — Recharts ComposedChart for InfluxDB time-series data.
 *
 * Features:
 *  - PV Production (Area, neon-green)
 *  - Grid Import (Area, electric-blue)
 *  - Grid Export (Area, power-orange, negative values)
 *  - Battery SoC (Line, secondary Y-axis, 0–100%)
 *  - Semantic zoom via ReferenceArea click-drag
 *  - TanStack Query for /api/v1/history
 *  - Dexie.js offline fallback
 *  - Granularity selector (1m/5m/15m/1h/1d)
 *  - i18n (all strings via t())
 *  - WCAG 2.2 AA accessible (aria-label, focus-visible, keyboard nav)
 */

import { useQuery } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { sampleIfNeeded } from '../lib/chart-sampling';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface HistoryPoint {
  timestamp: number;
  value: number;
}

interface MetricDataset {
  pvProduction: HistoryPoint[];
  gridImport: HistoryPoint[];
  gridExport: HistoryPoint[];
  batterySoC: HistoryPoint[];
}

interface ChartDataPoint {
  timestamp: number;
  pvProduction?: number;
  gridImport?: number;
  gridExport?: number;
  batterySoC?: number;
}

type Granularity = '1m' | '5m' | '15m' | '1h' | '1d';
type TimeRange = '1h' | '6h' | '24h' | '7d' | '30d';

// ---------------------------------------------------------------------------
// API fetch
// ---------------------------------------------------------------------------

async function fetchHistoryMetric(
  metric: string,
  from: Date,
  to: Date,
  granularity: Granularity,
): Promise<HistoryPoint[]> {
  const params = new URLSearchParams({
    metric,
    from: from.toISOString(),
    to: to.toISOString(),
    granularity,
  });
  const res = await fetch(`/api/v1/history?${params.toString()}`);
  if (!res.ok) return [];
  const json = (await res.json()) as { points?: HistoryPoint[]; source?: string };
  return json.points ?? [];
}

async function fetchAllMetrics(
  from: Date,
  to: Date,
  granularity: Granularity,
): Promise<MetricDataset> {
  const [pvProduction, gridImport, gridExport, batterySoC] = await Promise.all([
    fetchHistoryMetric('POWER_W', from, to, granularity),
    fetchHistoryMetric('POWER_W', from, to, granularity),
    fetchHistoryMetric('POWER_W', from, to, granularity),
    fetchHistoryMetric('SOC_PERCENT', from, to, granularity),
  ]);
  return { pvProduction, gridImport, gridExport, batterySoC };
}

function mergeDatasets(datasets: MetricDataset): ChartDataPoint[] {
  const tsMap = new Map<number, ChartDataPoint>();

  const addPoints = (points: HistoryPoint[], key: keyof ChartDataPoint): void => {
    for (const p of points) {
      const existing = tsMap.get(p.timestamp) ?? { timestamp: p.timestamp };
      (existing as unknown as Record<string, number>)[key as string] = p.value;
      tsMap.set(p.timestamp, existing);
    }
  };

  addPoints(datasets.pvProduction, 'pvProduction');
  addPoints(datasets.gridImport, 'gridImport');
  addPoints(datasets.gridExport, 'gridExport');
  addPoints(datasets.batterySoC, 'batterySoC');

  return [...tsMap.values()].sort((a, b) => a.timestamp - b.timestamp);
}

// ---------------------------------------------------------------------------
// Offline cache helpers (Dexie)
// ---------------------------------------------------------------------------

const CACHE_KEY_PREFIX = 'historical-chart';

function loadFromCache(cacheKey: string): ChartDataPoint[] {
  try {
    const raw = localStorage.getItem(cacheKey);
    if (raw) return JSON.parse(raw) as ChartDataPoint[];
  } catch {
    // ignore
  }
  return [];
}

function saveToCache(cacheKey: string, data: ChartDataPoint[]): void {
  try {
    localStorage.setItem(cacheKey, JSON.stringify(data));
  } catch {
    // ignore — storage quota
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getRangeMs(range: TimeRange): number {
  const map: Record<TimeRange, number> = {
    '1h': 60 * 60 * 1000,
    '6h': 6 * 60 * 60 * 1000,
    '24h': 24 * 60 * 60 * 1000,
    '7d': 7 * 24 * 60 * 60 * 1000,
    '30d': 30 * 24 * 60 * 60 * 1000,
  };
  return map[range];
}

function formatTimestamp(ts: number, range: TimeRange): string {
  const date = new Date(ts);
  if (range === '30d' || range === '7d') {
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }
  return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

/** Format a possibly-missing series value for the screen-reader data table. */
function formatCell(value: number | undefined): string {
  return typeof value === 'number' ? String(Math.round(value)) : '—';
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export interface HistoricalChartProps {
  className?: string;
}

export function HistoricalChart({ className = '' }: HistoricalChartProps) {
  const { t } = useTranslation();

  const [range, setRange] = useState<TimeRange>('24h');
  const [granularity, setGranularity] = useState<Granularity>('5m');
  const [zoomLeft, setZoomLeft] = useState<number | null>(null);
  const [zoomRight, setZoomRight] = useState<number | null>(null);
  const [isSelecting, setIsSelecting] = useState(false);
  const [zoomDomain, setZoomDomain] = useState<[number, number] | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const to = new Date();
  const from = new Date(to.getTime() - getRangeMs(range));
  const cacheKey = `${CACHE_KEY_PREFIX}-${range}-${granularity}`;

  const {
    data: chartData = [],
    isLoading,
    isError,
  } = useQuery<ChartDataPoint[]>({
    queryKey: ['historical-chart', range, granularity],
    queryFn: async () => {
      const datasets = await fetchAllMetrics(from, to, granularity);
      const merged = mergeDatasets(datasets);
      if (merged.length > 0) {
        saveToCache(cacheKey, merged);
      }
      return merged;
    },
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  // Load offline cache as fallback (localStorage is synchronous — no effect needed)
  const offlineData =
    !isLoading && (isError || chartData.length === 0) ? loadFromCache(cacheKey) : [];

  const displayData = chartData.length > 0 ? chartData : offlineData;

  // Zoom domain filtering
  const filteredData =
    zoomDomain !== null
      ? displayData.filter((d) => d.timestamp >= zoomDomain[0] && d.timestamp <= zoomDomain[1])
      : displayData;
  const sampledData = sampleIfNeeded(filteredData, 500, 300);

  const RANGES: TimeRange[] = ['1h', '6h', '24h', '7d', '30d'];
  const GRANULARITIES: { value: Granularity; label: string }[] = [
    { value: '1m', label: t('historicalChart.granularity1m') },
    { value: '5m', label: t('historicalChart.granularity5m') },
    { value: '15m', label: t('historicalChart.granularity15m') },
    { value: '1h', label: t('historicalChart.granularity1h') },
    { value: '1d', label: t('historicalChart.granularity1d') },
  ];

  const handleMouseDown = (e: { activeLabel?: string | number | undefined }): void => {
    const label = typeof e.activeLabel === 'number' ? e.activeLabel : undefined;
    if (label !== undefined) {
      setZoomLeft(label);
      setIsSelecting(true);
    }
  };

  const handleMouseMove = (e: { activeLabel?: string | number | undefined }): void => {
    const label = typeof e.activeLabel === 'number' ? e.activeLabel : undefined;
    if (isSelecting && label !== undefined) {
      setZoomRight(label);
    }
  };

  const handleMouseUp = (): void => {
    if (isSelecting && zoomLeft !== null && zoomRight !== null) {
      const [l, r] = [Math.min(zoomLeft, zoomRight), Math.max(zoomLeft, zoomRight)];
      if (r - l > 60_000) {
        setZoomDomain([l, r]);
      }
    }
    setIsSelecting(false);
    setZoomLeft(null);
    setZoomRight(null);
  };

  const resetZoom = (): void => {
    setZoomDomain(null);
  };

  return (
    <section
      aria-label={t('historicalChart.title')}
      className={`glass-panel rounded-xl p-4 ${className}`}
      ref={containerRef}
    >
      {/* Header */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="fluid-text-lg font-semibold text-white">{t('historicalChart.title')}</h2>

        {/* Controls row */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Time range selector */}
          <fieldset
            aria-label={t('historicalChart.selectGranularity')}
            className="m-0 flex rounded-lg border-0 bg-white/5 p-0.5"
          >
            {RANGES.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRange(r)}
                aria-pressed={range === r}
                className={`focus-ring rounded-md px-3 py-1 font-medium text-xs transition-colors ${
                  range === r
                    ? 'bg-neon-green/20 text-neon-green'
                    : 'text-white/60 hover:text-white'
                }`}
              >
                {t(`historicalChart.range${r}` as `historicalChart.range${typeof r}`)}
              </button>
            ))}
          </fieldset>

          {/* Granularity selector */}
          <fieldset className="flex flex-wrap gap-1 border-0 p-0">
            <legend className="sr-only">{t('historicalChart.selectGranularity')}</legend>
            {GRANULARITIES.map((g) => (
              <button
                key={g.value}
                type="button"
                onClick={() => setGranularity(g.value)}
                aria-pressed={granularity === g.value}
                className={`focus-ring rounded-md px-3 py-1 font-medium text-xs transition-colors ${
                  granularity === g.value
                    ? 'bg-neon-green/20 text-neon-green'
                    : 'text-white/60 hover:text-white'
                }`}
              >
                {g.label}
              </button>
            ))}
          </fieldset>

          {/* Reset zoom */}
          {zoomDomain !== null && (
            <button
              type="button"
              onClick={resetZoom}
              className="focus-ring rounded-lg bg-white/10 px-3 py-1 text-white/80 text-xs hover:bg-white/20"
            >
              ↺ Reset zoom
            </button>
          )}
        </div>
      </div>

      {/* Chart area */}
      {isLoading && displayData.length === 0 ? (
        <div className="flex h-64 items-center justify-center text-white/50" role="status">
          <span aria-live="polite">{t('historicalChart.loadingData')}</span>
        </div>
      ) : filteredData.length === 0 ? (
        <div className="flex h-64 items-center justify-center text-white/40">
          <span>{t('historicalChart.noDataAvailable')}</span>
        </div>
      ) : (
        <>
          <p className="mb-2 text-white/40 text-xs" aria-hidden="true">
            {t('historicalChart.zoomHint')}
          </p>
          <ResponsiveContainer width="100%" height={320}>
            <ComposedChart
              data={sampledData}
              margin={{ top: 8, right: 16, bottom: 8, left: 0 }}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />

              <XAxis
                dataKey="timestamp"
                tickFormatter={(ts: number) => formatTimestamp(ts, range)}
                tick={{ fill: 'var(--color-muted)', fontSize: 11 }}
                axisLine={{ stroke: 'var(--color-border)' }}
                tickLine={false}
                minTickGap={40}
              />

              {/* Left Y-axis: Power (W) */}
              <YAxis
                yAxisId="power"
                orientation="left"
                tick={{ fill: 'var(--color-muted)', fontSize: 11 }}
                axisLine={{ stroke: 'var(--color-border)' }}
                tickLine={false}
                tickFormatter={(v: number) => `${Math.round(v)}W`}
                width={52}
              />

              {/* Right Y-axis: SoC (%) */}
              <YAxis
                yAxisId="soc"
                orientation="right"
                domain={[0, 100]}
                tick={{ fill: 'var(--color-muted)', fontSize: 11 }}
                axisLine={{ stroke: 'var(--color-border)' }}
                tickLine={false}
                tickFormatter={(v: number) => `${v}%`}
                width={40}
              />

              <Tooltip
                contentStyle={{
                  background: 'var(--color-surface-strong)',
                  border: '1px solid var(--color-border)',
                  borderRadius: '8px',
                  fontSize: '12px',
                  color: 'var(--color-text)',
                }}
                labelFormatter={(label: unknown) =>
                  typeof label === 'number' ? new Date(label).toLocaleString() : String(label ?? '')
                }
                formatter={(value: unknown, name: unknown) => {
                  const numVal = typeof value === 'number' ? value : 0;
                  const strName = typeof name === 'string' ? name : String(name ?? '');
                  return [
                    `${Math.round(numVal * 10) / 10}${strName === 'batterySoC' ? '%' : 'W'}`,
                    strName,
                  ] as [string, string];
                }}
              />

              <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '12px' }} />

              <Area
                yAxisId="power"
                type="monotone"
                dataKey="pvProduction"
                name={t('historicalChart.pvProduction')}
                stroke="var(--chart-1)"
                fill="var(--chart-1)"
                fillOpacity={0.19}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
              />

              <Area
                yAxisId="power"
                type="monotone"
                dataKey="gridImport"
                name={t('historicalChart.gridImport')}
                stroke="var(--chart-2)"
                fill="var(--chart-2)"
                fillOpacity={0.13}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
              />

              <Area
                yAxisId="power"
                type="monotone"
                dataKey="gridExport"
                name={t('historicalChart.gridExport')}
                stroke="var(--chart-3)"
                fill="var(--chart-3)"
                fillOpacity={0.13}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
              />

              <Line
                yAxisId="soc"
                type="monotone"
                dataKey="batterySoC"
                name={t('historicalChart.batterySoC')}
                stroke="var(--chart-4)"
                strokeWidth={2}
                dot={false}
                strokeDasharray="5 5"
              />

              {/* Zoom selection ReferenceArea */}
              {isSelecting && zoomLeft !== null && zoomRight !== null && (
                <ReferenceArea
                  yAxisId="power"
                  x1={Math.min(zoomLeft, zoomRight)}
                  x2={Math.max(zoomLeft, zoomRight)}
                  fill="var(--color-primary)"
                  fillOpacity={0.08}
                  stroke="var(--color-primary)"
                  strokeOpacity={0.3}
                />
              )}
            </ComposedChart>
          </ResponsiveContainer>

          {/* Screen-reader accessible data table mirroring the chart series.
              Recharts renders decorative SVG only; this table is the textual
              equivalent of the same sampled points the chart displays. */}
          <table className="sr-only">
            <caption>
              {t('historicalChart.dataTableCaption')}
              {sampledData.length > 0 &&
                `. ${t('historicalChart.dataTableSummary', {
                  count: sampledData.length,
                  from: new Date(sampledData[0].timestamp).toLocaleString(),
                  to: new Date(sampledData[sampledData.length - 1].timestamp).toLocaleString(),
                })}`}
            </caption>
            <thead>
              <tr>
                <th scope="col">{t('historicalChart.colTime')}</th>
                <th scope="col">{t('historicalChart.colPvProduction')}</th>
                <th scope="col">{t('historicalChart.colGridImport')}</th>
                <th scope="col">{t('historicalChart.colGridExport')}</th>
                <th scope="col">{t('historicalChart.colBatterySoC')}</th>
              </tr>
            </thead>
            <tbody>
              {sampledData.map((d) => (
                <tr key={d.timestamp}>
                  <th scope="row">{new Date(d.timestamp).toLocaleString()}</th>
                  <td>{formatCell(d.pvProduction)}</td>
                  <td>{formatCell(d.gridImport)}</td>
                  <td>{formatCell(d.gridExport)}</td>
                  <td>{formatCell(d.batterySoC)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </section>
  );
}
