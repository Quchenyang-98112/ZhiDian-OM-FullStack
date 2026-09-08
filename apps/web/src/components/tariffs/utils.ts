import { PRICE_MIN, PRICE_SPREAD } from './data/constants';

/** Maps a price onto the discrete price-zone CSS custom property. */
export function getPriceColor(price: number): string {
  const ratio = (price - PRICE_MIN) / (PRICE_SPREAD || 1);
  if (ratio < 0.3) return 'var(--price-low)';
  if (ratio < 0.6) return 'var(--price-mid)';
  if (ratio < 0.8) return 'var(--price-elevated)';
  return 'var(--price-high)';
}

/** Maps a price onto a translucent heatmap-cell background (fixed 0.04–0.30 scale). */
export function getHeatmapBg(price: number): string {
  const min = 0.04;
  const max = 0.3;
  const ratio = Math.min(1, Math.max(0, (price - min) / (max - min)));
  if (ratio < 0.2) return 'color-mix(in srgb, var(--price-low) 60%, transparent)';
  if (ratio < 0.4) return 'color-mix(in srgb, var(--price-low) 30%, transparent)';
  if (ratio < 0.6) return 'color-mix(in srgb, var(--price-mid) 40%, transparent)';
  if (ratio < 0.8) return 'color-mix(in srgb, var(--price-elevated) 45%, transparent)';
  return 'color-mix(in srgb, var(--price-high) 55%, transparent)';
}
