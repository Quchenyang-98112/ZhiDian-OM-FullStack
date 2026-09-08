import type { TimeRange, TimeSeriesPoint } from '../types';
import { formatTimestamp } from '../utils';

const COUNTS: Record<TimeRange, number> = {
  '24h': 96,
  '7d': 168,
  '30d': 120,
  '90d': 90,
  '365d': 52,
};

const INTERVALS: Record<TimeRange, number> = {
  '24h': 15 * 60_000,
  '7d': 3600_000,
  '30d': 6 * 3600_000,
  '90d': 86400_000,
  '365d': 7 * 86400_000,
};

/** Deterministic-shape (randomized magnitude) demo history used when InfluxDB is absent. */
export function generateDemoTimeSeries(range: TimeRange): TimeSeriesPoint[] {
  const now = Date.now();
  const n = COUNTS[range];
  const interval = INTERVALS[range];

  return Array.from({ length: n }, (_, i) => {
    const ts = now - (n - i) * interval;
    const hour = new Date(ts).getHours();
    const sunFactor = hour >= 6 && hour <= 20 ? Math.sin(((hour - 6) / 14) * Math.PI) : 0;
    const seasonal = 0.6 + 0.4 * Math.sin((new Date(ts).getMonth() / 12) * 2 * Math.PI);
    return {
      timestamp: ts,
      time: formatTimestamp(ts, range),
      pvPower: Math.round(5200 * sunFactor * seasonal * (0.85 + Math.random() * 0.3)),
      gridPower: Math.round(-400 + Math.random() * 2000 - 1500 * sunFactor),
      batteryPower: Math.round((Math.random() - 0.5) * 3000),
      houseLoad: Math.round(800 + Math.random() * 1500 + (hour >= 17 && hour <= 21 ? 800 : 0)),
      batterySoC: Math.round(20 + Math.random() * 70),
    };
  });
}
