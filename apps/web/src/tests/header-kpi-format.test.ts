import { describe, expect, it } from 'vitest';
import {
  batterySocTextClass,
  formatHeaderPower,
  gridPowerTextClass,
} from '../components/layout/header-kpi-format';

describe('header-kpi-format', () => {
  it('formats sub-kilowatt values in watts', () => {
    expect(formatHeaderPower(850)).toBe('850 W');
    expect(formatHeaderPower(-420)).toBe('420 W');
  });

  it('formats kilowatt values with one decimal', () => {
    expect(formatHeaderPower(1420)).toBe('1.4 kW');
    expect(formatHeaderPower(-7850)).toBe('7.8 kW');
  });

  it('maps battery SoC to threshold color classes', () => {
    expect(batterySocTextClass(72)).toBe('text-(--color-neon-green)');
    expect(batterySocTextClass(35)).toBe('text-amber-400');
    expect(batterySocTextClass(12)).toBe('text-red-400');
  });

  it('maps grid import vs export to color classes', () => {
    expect(gridPowerTextClass(1200)).toBe('text-red-400');
    expect(gridPowerTextClass(-900)).toBe('text-(--color-neon-green)');
    expect(gridPowerTextClass(0)).toBe('text-red-400');
  });
});
