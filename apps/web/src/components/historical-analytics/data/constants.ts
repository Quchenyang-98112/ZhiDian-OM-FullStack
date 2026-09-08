import type { TimeRange } from '../types';

export const TIME_RANGES: { value: TimeRange; labelKey: string }[] = [
  { value: '24h', labelKey: 'historicalAnalytics.range24h' },
  { value: '7d', labelKey: 'historicalAnalytics.range7d' },
  { value: '30d', labelKey: 'historicalAnalytics.range30d' },
  { value: '90d', labelKey: 'historicalAnalytics.range90d' },
  { value: '365d', labelKey: 'historicalAnalytics.range365d' },
];

/** InfluxDB downsampling window per range. */
export const AGGREGATE_WINDOWS: Record<TimeRange, string> = {
  '24h': '15m',
  '7d': '1h',
  '30d': '6h',
  '90d': '1d',
  '365d': '7d',
};
