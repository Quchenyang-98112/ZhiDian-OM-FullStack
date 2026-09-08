import type { PriceSlot } from '../types';

// ─── Static data (generated once at module load, outside render) ─────────

export const NOW = new Date();

export const HOURS_48 = Array.from({ length: 48 }, (_, i) => {
  const d = new Date(NOW.getTime() + i * 3600000);
  return {
    hour: `${String(d.getHours()).padStart(2, '0')}:00`,
    day: d.getDate(),
    dayLabel: d.toLocaleDateString('de-DE', { weekday: 'short' }),
    isToday: d.getDate() === NOW.getDate(),
  };
});

/** Simulated 48h price curve with realistic day/night pattern */
export const PRICE_TIMELINE: PriceSlot[] = HOURS_48.map((slot, i) => {
  const h = parseInt(slot.hour, 10);
  const base = 0.18;
  const nightDip = h >= 1 && h <= 5 ? -0.08 : 0;
  const morningPeak = h >= 7 && h <= 9 ? 0.06 : 0;
  const solarDip = h >= 11 && h <= 14 ? -0.04 : 0;
  const eveningPeak = h >= 17 && h <= 20 ? 0.09 : 0;
  const noise = Math.sin(i * 1.7) * 0.015;
  const price = Math.max(0.04, base + nightDip + morningPeak + solarDip + eveningPeak + noise);
  const pvForecast = h >= 6 && h <= 20 ? Math.max(0, Math.sin(((h - 6) / 14) * Math.PI) * 7.5) : 0;
  const renewable = 35 + pvForecast * 3 + Math.sin(i / 5) * 10;
  return {
    time: slot.hour,
    label: `${slot.dayLabel} ${slot.hour}`,
    price: Math.round(price * 1000) / 1000,
    pvForecast: Math.round(pvForecast * 10) / 10,
    renewable: Math.round(Math.min(100, Math.max(0, renewable))),
    isToday: slot.isToday,
  };
});

export const PRICES = PRICE_TIMELINE.map((p) => p.price);
export const PRICE_MIN = Math.min(...PRICES);
export const PRICE_MAX = Math.max(...PRICES);
export const PRICE_AVG = PRICES.reduce((a, b) => a + b, 0) / PRICES.length;
export const PRICE_SPREAD = PRICE_MAX - PRICE_MIN;
