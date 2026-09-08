import { describe, expect, it } from 'vitest';
import {
  formatTariffPrice,
  formatTariffPriceCompact,
  formatTariffPriceFull,
} from '../lib/format-tariff-price';

describe('formatTariffPrice', () => {
  const en = 'en-US';
  const ctUnit = 'ct/kWh';
  const euroUnit = '€/kWh';

  it('formats compact prices as cent/kWh', () => {
    expect(formatTariffPriceCompact(0.128, en, ctUnit)).toBe('12.8 ct/kWh');
    expect(formatTariffPrice(0.18, { style: 'compact', locale: en, unit: ctUnit })).toEqual({
      value: '18.0',
      unit: 'ct/kWh',
    });
  });

  it('formats full prices as €/kWh with three decimals', () => {
    expect(formatTariffPriceFull(0.128, en, euroUnit)).toBe('0.128 €/kWh');
    expect(formatTariffPrice(0.18, { style: 'full', locale: en, unit: euroUnit })).toEqual({
      value: '0.180',
      unit: '€/kWh',
    });
  });

  it('uses consistent cent conversion across compact surfaces', () => {
    const compact = formatTariffPriceCompact(0.128, en, ctUnit);
    expect(compact).toContain('ct/kWh');
    expect(compact).not.toContain('€');
  });

  it('rounds negative midpoint cent values away from zero', () => {
    expect(formatTariffPriceCompact(-0.0125, en, ctUnit)).toBe('-1.3 ct/kWh');
  });
});
