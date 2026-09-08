import { describe, expect, it } from 'vitest';
import { computeAnalyticsDashboardMetrics } from '../lib/analytics-derived-metrics';

const baseEnergy = {
  pvPower: 4000,
  houseLoad: 2500,
  heatPumpPower: 500,
  evPower: 0,
  pvYieldToday: 12,
  priceCurrent: 0.3,
  gridPower: -500,
  batterySoC: 55,
};

describe('computeAnalyticsDashboardMetrics', () => {
  it('derives KPI and CO2 balance from energy data', () => {
    const metrics = computeAnalyticsDashboardMetrics(
      baseEnergy as never,
      ((k: string) => k) as never,
    );
    expect(metrics.selfRate).toBeGreaterThan(0);
    expect(metrics.costAllocation.length).toBeGreaterThan(0);
    expect(metrics.monthlyCo2.totalSaved).toBeGreaterThanOrEqual(0);
    expect(metrics.isSolarPeak).toBeTypeOf('boolean');
  });
});
