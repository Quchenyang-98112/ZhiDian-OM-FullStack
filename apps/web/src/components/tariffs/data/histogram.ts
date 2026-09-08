import type { PriceBin } from '../types';
import { PRICE_MAX, PRICE_MIN, PRICES } from './constants';

/** Price distribution histogram */
export const PRICE_BINS: PriceBin[] = (() => {
  const binCount = 10;
  const binWidth = (PRICE_MAX - PRICE_MIN) / binCount || 0.01;
  const bins: PriceBin[] = Array.from({ length: binCount }, (_, i) => ({
    range: `${((PRICE_MIN + i * binWidth) * 100).toFixed(1)}`,
    rangeEnd: `${((PRICE_MIN + (i + 1) * binWidth) * 100).toFixed(1)}`,
    count: 0,
    label: `${((PRICE_MIN + i * binWidth) * 100).toFixed(1)}–${((PRICE_MIN + (i + 1) * binWidth) * 100).toFixed(1)}`,
  }));
  for (const p of PRICES) {
    const idx = Math.min(Math.floor((p - PRICE_MIN) / binWidth), binCount - 1);
    const bin = bins[idx];
    if (bin) bin.count++;
  }
  return bins;
})();
