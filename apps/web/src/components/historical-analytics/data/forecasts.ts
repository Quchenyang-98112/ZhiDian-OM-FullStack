import type { AIForecastRecord } from '../../../lib/db';

/** Demo AI-forecast history used when Dexie has no persisted forecasts. */
export function generateDemoForecasts(): AIForecastRecord[] {
  const now = Date.now();
  return Array.from({ length: 10 }, (_, i) => ({
    id: i + 1,
    metric: ['pvPower', 'houseLoad', 'gridPower'][i % 3],
    model: i % 2 === 0 ? 'holt-winters' : 'linear-regression',
    createdAt: now - i * 3600_000 * 6,
    horizonHours: 24,
    accuracy: {
      mae: 80 + Math.random() * 120,
      mape: 5 + Math.random() * 15,
      rmse: 100 + Math.random() * 150,
      r2: 0.75 + Math.random() * 0.2,
    },
    points: Array.from({ length: 24 }, (__, h) => ({
      timestamp: now - i * 3600_000 * 6 + h * 3600_000,
      value: 1000 + Math.random() * 3000,
      lower: 800 + Math.random() * 2500,
      upper: 1200 + Math.random() * 3500,
    })),
    persistedToInflux: i < 5,
  }));
}
