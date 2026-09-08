import { describe, expect, it } from 'vitest';
import {
  formatCurrencyPerKwh,
  formatEnergy,
  formatNumber,
  formatPercent,
  formatPower,
} from '../lib/format';

describe('Format Utilities', () => {
  describe('formatNumber', () => {
    it('should format with default fraction digits', () => {
      expect(formatNumber(1234.56, 'en')).toBe('1,234.6');
    });

    it('should respect maximumFractionDigits', () => {
      expect(formatNumber(1.2345, 'en', 3)).toBe('1.235');
    });

    it('should format zero', () => {
      expect(formatNumber(0, 'en')).toBe('0');
    });

    it('should format German locale', () => {
      const result = formatNumber(1234.56, 'de');
      // German uses . as thousands and , as decimal
      expect(result).toContain('1.234');
    });
  });

  describe('formatPower', () => {
    it('should convert W to kW', () => {
      expect(formatPower(3500, 'en')).toBe('3.5 kW');
    });

    it('should show 0 kW for 0 W', () => {
      expect(formatPower(0, 'en')).toBe('0 kW');
    });
  });

  describe('formatEnergy', () => {
    it('should append kWh unit', () => {
      expect(formatEnergy(12.5, 'en')).toBe('12.5 kWh');
    });
  });

  describe('formatCurrencyPerKwh', () => {
    it('should format with 3 decimal places', () => {
      expect(formatCurrencyPerKwh(0.225, 'en')).toBe('0.225 €/kWh');
    });
  });

  describe('formatPercent', () => {
    it('should format percentage', () => {
      expect(formatPercent(85.7, 'en')).toBe('85.7 %');
    });
  });
});
