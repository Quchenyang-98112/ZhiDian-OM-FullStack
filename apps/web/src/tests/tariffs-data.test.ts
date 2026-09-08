import { describe, expect, it } from 'vitest';
import { CHARGE_WINDOWS } from '../components/tariffs/data/chargeWindows';
import {
  PRICE_AVG,
  PRICE_MAX,
  PRICE_MIN,
  PRICE_TIMELINE,
  PRICES,
} from '../components/tariffs/data/constants';
import { HEATMAP_DATA } from '../components/tariffs/data/heatmap';
import { PRICE_BINS } from '../components/tariffs/data/histogram';
import { MONTHLY_DAYS, MONTHLY_TOTAL } from '../components/tariffs/data/monthly';

describe('tariffs static data', () => {
  it('generates a 48-slot price timeline with consistent aggregates', () => {
    expect(PRICE_TIMELINE).toHaveLength(48);
    expect(PRICE_MIN).toBeLessThanOrEqual(PRICE_AVG);
    expect(PRICE_AVG).toBeLessThanOrEqual(PRICE_MAX);
    expect(Math.min(...PRICES)).toBeCloseTo(PRICE_MIN);
  });

  it('bins every price into the histogram (counts sum to the sample size)', () => {
    expect(PRICE_BINS).toHaveLength(10);
    const total = PRICE_BINS.reduce((s, b) => s + b.count, 0);
    expect(total).toBe(PRICES.length);
  });

  it('derives charge windows sorted cheapest-first with valid categories', () => {
    expect(CHARGE_WINDOWS.length).toBeGreaterThan(0);
    expect(CHARGE_WINDOWS.length).toBeLessThanOrEqual(6);
    for (let i = 1; i < CHARGE_WINDOWS.length; i++) {
      expect(CHARGE_WINDOWS[i]!.avgPrice).toBeGreaterThanOrEqual(CHARGE_WINDOWS[i - 1]!.avgPrice);
    }
    for (const w of CHARGE_WINDOWS) {
      expect(['optimal', 'good', 'acceptable']).toContain(w.category);
      expect(w.savings).toBeGreaterThanOrEqual(0);
    }
  });

  it('builds a 7×24 heatmap grid', () => {
    expect(HEATMAP_DATA).toHaveLength(7);
    for (const row of HEATMAP_DATA) {
      expect(row.hours).toHaveLength(24);
    }
  });

  it('tracks 14 monthly days with a positive running total', () => {
    expect(MONTHLY_DAYS).toHaveLength(14);
    expect(MONTHLY_TOTAL).toBeGreaterThan(0);
  });
});
