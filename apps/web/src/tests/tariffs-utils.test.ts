import { describe, expect, it } from 'vitest';
import { PRICE_MIN, PRICE_SPREAD } from '../components/tariffs/data/constants';
import { getHeatmapBg, getPriceColor } from '../components/tariffs/utils';

describe('tariffs getPriceColor', () => {
  const at = (ratio: number) => PRICE_MIN + ratio * (PRICE_SPREAD || 1);

  it('maps price ratio onto the four price-zone tokens', () => {
    expect(getPriceColor(at(0))).toBe('var(--price-low)'); // ratio 0
    expect(getPriceColor(at(0.45))).toBe('var(--price-mid)');
    expect(getPriceColor(at(0.7))).toBe('var(--price-elevated)');
    expect(getPriceColor(at(1))).toBe('var(--price-high)'); // ratio 1
  });
});

describe('tariffs getHeatmapBg', () => {
  it('maps price onto five translucent heatmap backgrounds (0.04–0.30 scale)', () => {
    expect(getHeatmapBg(0.04)).toContain('var(--price-low) 60%');
    expect(getHeatmapBg(0.118)).toContain('var(--price-low) 30%');
    expect(getHeatmapBg(0.17)).toContain('var(--price-mid) 40%');
    expect(getHeatmapBg(0.222)).toContain('var(--price-elevated) 45%');
    expect(getHeatmapBg(0.3)).toContain('var(--price-high) 55%');
  });

  it('clamps out-of-range prices to the end buckets', () => {
    expect(getHeatmapBg(-1)).toContain('var(--price-low) 60%');
    expect(getHeatmapBg(99)).toContain('var(--price-high) 55%');
  });
});
