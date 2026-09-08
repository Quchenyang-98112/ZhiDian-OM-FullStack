import { describe, expect, it } from 'vitest';
import {
  generateEnergyBalance,
  generateMonthlyComparison,
  isPeakElectricityHour,
  isSolarPeakHour,
} from '../lib/analytics-chart-data';

describe('analytics-chart-data', () => {
  it('generates 24 hourly balance points with future flags', () => {
    const rows = generateEnergyBalance(5000, 3000, new Date('2026-07-04T14:00:00'));
    expect(rows).toHaveLength(24);
    expect(rows[14]?.isFuture).toBe(false);
    expect(rows[20]?.isFuture).toBe(true);
    expect(rows[12]?.pv).toBeGreaterThan(0);
    expect(rows[2]?.pv).toBe(0);
  });

  it('uses default yield when pvYieldToday is zero', () => {
    const rows = generateMonthlyComparison(0);
    expect(rows).toHaveLength(12);
    expect(rows[5]?.production).toBeGreaterThan(rows[0]?.production ?? 0);
  });

  it('scales monthly production with measured yield', () => {
    const low = generateMonthlyComparison(5);
    const high = generateMonthlyComparison(20);
    expect(high[6]?.production).toBeGreaterThan(low[6]?.production ?? 0);
  });

  it('classifies peak and solar hours', () => {
    expect(isPeakElectricityHour(18)).toBe(true);
    expect(isPeakElectricityHour(12)).toBe(false);
    expect(isSolarPeakHour(12)).toBe(true);
    expect(isSolarPeakHour(18)).toBe(false);
  });
});
