import type { HeatmapRow } from '../types';
import { NOW } from './constants';

/** 7-day × 24h heatmap data */
export const HEATMAP_DATA: HeatmapRow[] = Array.from({ length: 7 }, (_, dayIdx) => {
  const d = new Date(NOW.getTime() - (6 - dayIdx) * 86400000);
  return {
    day: d.toLocaleDateString('de-DE', { weekday: 'short' }),
    date: d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }),
    hours: Array.from({ length: 24 }, (__, h) => {
      const base = 0.18;
      const nightDip = h >= 1 && h <= 5 ? -0.07 : 0;
      const morningPeak = h >= 7 && h <= 9 ? 0.05 : 0;
      const solarDip = h >= 11 && h <= 14 ? -0.03 : 0;
      const eveningPeak = h >= 17 && h <= 20 ? 0.08 : 0;
      const dayNoise = Math.sin(dayIdx * 2.3 + h * 0.8) * 0.02;
      return Math.max(0.04, base + nightDip + morningPeak + solarDip + eveningPeak + dayNoise);
    }),
  };
});
