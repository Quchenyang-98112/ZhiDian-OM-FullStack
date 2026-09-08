import { describe, expect, it } from 'vitest';
import { runDemoForecast } from '../lib/analytics-forecast-demo';

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

describe('runDemoForecast', () => {
  it('returns forecast points for a selected metric', () => {
    const result = runDemoForecast(baseEnergy as never, 'pvPower');
    expect(result.points.length).toBeGreaterThan(0);
    expect(result.metric).toBe('pvPower');
  });
});
