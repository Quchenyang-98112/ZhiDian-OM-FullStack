import type { TimeRange } from './types';

/** Format a timestamp for the X-axis label of a given range. */
export function formatTimestamp(ts: number, range: TimeRange): string {
  const d = new Date(ts);
  if (range === '24h') return d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  if (range === '7d') return d.toLocaleDateString('de-DE', { weekday: 'short', hour: '2-digit' });
  if (range === '30d') return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
  if (range === '90d') return d.toLocaleDateString('de-DE', { day: '2-digit', month: 'short' });
  return d.toLocaleDateString('de-DE', { month: 'short', year: '2-digit' });
}
