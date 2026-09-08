import { useEffect, useState } from 'react';
import { getForecastHistory, syncPendingForecasts } from '../../../lib/ai-forecast-persistence';
import { sampleIfNeeded } from '../../../lib/chart-sampling';
import type { AIForecastRecord } from '../../../lib/db';
import {
  checkInfluxHealth,
  type InfluxConfig,
  queryTimeSeries,
} from '../../../lib/influxdb-client';
import { useAppStoreShallow } from '../../../store';
import { AGGREGATE_WINDOWS } from '../data/constants';
import { generateDemoForecasts } from '../data/forecasts';
import { generateDemoTimeSeries } from '../data/timeSeries';
import type { ForecastAccuracyRow, TimeRange, TimeSeriesPoint } from '../types';
import { formatTimestamp } from '../utils';

const MASKED_TOKEN = '••••••••••••••••';

function toInfluxConfig(url: string | undefined, token: string | undefined): InfluxConfig | null {
  return url && token && token !== MASKED_TOKEN ? { url, token } : null;
}

function average(values: number[]): number {
  return values.length > 0 ? Math.round(values.reduce((s, n) => s + n, 0) / values.length) : 0;
}

/**
 * Holds range state, InfluxDB-vs-demo data selection, forecast history and the
 * derived summary stats so HistoricalAnalyticsPage stays a thin orchestrator.
 */
export function useHistoricalAnalytics() {
  const { influxUrl, influxToken } = useAppStoreShallow((s) => ({
    influxUrl: s.settings.influxUrl,
    influxToken: s.settings.influxToken,
  }));

  const [timeRange, setTimeRange] = useState<TimeRange>('7d');
  const [influxHealthy, setInfluxHealthy] = useState<boolean | null>(null);
  const [timeSeriesData, setTimeSeriesData] = useState<TimeSeriesPoint[]>([]);
  const [forecastHistory, setForecastHistory] = useState<AIForecastRecord[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const influxConfig = toInfluxConfig(influxUrl, influxToken);

  useEffect(() => {
    let cancelled = false;
    const config = toInfluxConfig(influxUrl, influxToken);

    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: InfluxDB data loading with multiple fallback paths
    async function loadData() {
      setIsLoading(true);

      if (config) {
        const healthy = await checkInfluxHealth(config);
        if (!cancelled) setInfluxHealthy(healthy);

        if (healthy) {
          try {
            const [pv, grid, battery, house, soc] = await Promise.all([
              queryTimeSeries(
                config,
                'pvPower',
                { start: `-${timeRange}` },
                AGGREGATE_WINDOWS[timeRange],
              ),
              queryTimeSeries(
                config,
                'gridPower',
                { start: `-${timeRange}` },
                AGGREGATE_WINDOWS[timeRange],
              ),
              queryTimeSeries(
                config,
                'batteryPower',
                { start: `-${timeRange}` },
                AGGREGATE_WINDOWS[timeRange],
              ),
              queryTimeSeries(
                config,
                'houseLoad',
                { start: `-${timeRange}` },
                AGGREGATE_WINDOWS[timeRange],
              ),
              queryTimeSeries(
                config,
                'batterySoC',
                { start: `-${timeRange}` },
                AGGREGATE_WINDOWS[timeRange],
                'mean',
              ),
            ]);

            if (pv.points.length > 0 && !cancelled) {
              const merged: TimeSeriesPoint[] = pv.points.map((p, i) => ({
                timestamp: p.timestamp,
                time: formatTimestamp(p.timestamp, timeRange),
                pvPower: Math.round(p.value),
                gridPower: Math.round(grid.points[i]?.value ?? 0),
                batteryPower: Math.round(battery.points[i]?.value ?? 0),
                houseLoad: Math.round(house.points[i]?.value ?? 0),
                batterySoC: Math.round(soc.points[i]?.value ?? 50),
              }));
              setTimeSeriesData(merged);
              setIsLoading(false);

              const forecasts = await getForecastHistory(undefined, 20);
              if (!cancelled) setForecastHistory(forecasts);
              return;
            }
          } catch {
            // Fall through to demo data
          }
        }
      } else if (!cancelled) setInfluxHealthy(null);

      // Fallback: demo data
      if (!cancelled) {
        setTimeSeriesData(generateDemoTimeSeries(timeRange));

        try {
          const forecasts = await getForecastHistory(undefined, 20);
          if (!cancelled)
            setForecastHistory(forecasts.length > 0 ? forecasts : generateDemoForecasts());
        } catch {
          if (!cancelled) setForecastHistory(generateDemoForecasts());
        }

        setIsLoading(false);
      }
    }

    loadData();
    return () => {
      cancelled = true;
    };
  }, [timeRange, influxUrl, influxToken]);

  async function handleSync() {
    if (!influxConfig || syncing) return;
    setSyncing(true);
    setSyncResult(null);
    const count = await syncPendingForecasts(influxConfig);
    setSyncResult(count);
    setSyncing(false);

    const forecasts = await getForecastHistory(undefined, 20);
    setForecastHistory(forecasts);
  }

  const sampledTimeSeriesData = sampleIfNeeded(timeSeriesData, 120, 96);
  const forecastAccuracyData: ForecastAccuracyRow[] = sampleIfNeeded(
    forecastHistory.map((forecast) => ({
      timestamp: forecast.createdAt,
      label: `${forecast.metric} (${new Date(forecast.createdAt).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit' })})`,
      r2: Math.round(forecast.accuracy.r2 * 100),
      mape: Math.round(forecast.accuracy.mape * 10) / 10,
      model: forecast.model,
      synced: forecast.persistedToInflux,
    })),
    24,
    18,
  );

  return {
    timeRange,
    setTimeRange,
    influxHealthy,
    isLoading,
    sampledTimeSeriesData,
    forecastHistory,
    forecastAccuracyData,
    syncing,
    syncResult,
    handleSync,
    influxConfigured: influxConfig !== null,
    avgPv: average(timeSeriesData.map((d) => d.pvPower)),
    avgLoad: average(timeSeriesData.map((d) => d.houseLoad)),
    peakPv: timeSeriesData.length > 0 ? Math.max(...timeSeriesData.map((d) => d.pvPower)) : 0,
    avgSoC: average(timeSeriesData.map((d) => d.batterySoC)),
    unsyncedCount: forecastHistory.filter((f) => !f.persistedToInflux).length,
  };
}
