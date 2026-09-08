import type { MonthlyDay } from '../types';
import { NOW } from './constants';

/** Monthly cost tracking */
export const MONTHLY_DAYS: MonthlyDay[] = Array.from({ length: 14 }, (_, i) => {
  const d = new Date(NOW.getFullYear(), NOW.getMonth(), i + 1);
  const baseCost = 2.2 + Math.sin(i * 0.9) * 0.8;
  const optimizedCost = baseCost * (0.7 + Math.random() * 0.15);
  return {
    day: d.toLocaleDateString('de-DE', { day: '2-digit' }),
    actual: Math.round(baseCost * 100) / 100,
    optimized: Math.round(optimizedCost * 100) / 100,
    savings: Math.round((baseCost - optimizedCost) * 100) / 100,
  };
});

export const MONTHLY_TOTAL = MONTHLY_DAYS.reduce((s, d) => s + d.actual, 0);
export const MONTHLY_SAVINGS = MONTHLY_DAYS.reduce((s, d) => s + d.savings, 0);
