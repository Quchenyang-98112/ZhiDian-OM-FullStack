import { describe, expect, it } from 'vitest';
import {
  formatUptime,
  generateSystemLoadHistory,
  severityClasses,
  statusBg,
  statusColor,
} from './utils';

describe('monitoring utils', () => {
  describe('statusColor', () => {
    it('returns correct color classes', () => {
      expect(statusColor('crit')).toBe('text-red-400');
      expect(statusColor('warn')).toBe('text-yellow-400');
      expect(statusColor('ok')).toBe('text-emerald-400');
    });
  });

  describe('statusBg', () => {
    it('returns correct background classes', () => {
      expect(statusBg('crit')).toBe('bg-red-500/10');
      expect(statusBg('warn')).toBe('bg-yellow-500/10');
      expect(statusBg('ok')).toBe('bg-emerald-500/10');
    });
  });

  describe('severityClasses', () => {
    it('returns correct severity classes', () => {
      expect(severityClasses('critical')).toBe('bg-red-500/15 text-red-400');
      expect(severityClasses('warning')).toBe('bg-orange-500/15 text-orange-400');
      expect(severityClasses('info')).toBe('bg-blue-500/15 text-blue-400');
    });
  });

  describe('formatUptime', () => {
    it('formats less than a day as hours and minutes', () => {
      expect(formatUptime(3661)).toBe('1h 1m');
      expect(formatUptime(7200)).toBe('2h 0m');
    });

    it('formats a day or more with days, hours and minutes', () => {
      expect(formatUptime(90061)).toBe('1d 1h 1m');
      expect(formatUptime(172800)).toBe('2d 0h 0m');
    });
  });

  describe('generateSystemLoadHistory', () => {
    it('generates 24 hourly data points with expected shape', () => {
      const history = generateSystemLoadHistory(3000);
      expect(history).toHaveLength(24);

      const first = history[0];
      expect(first).toHaveProperty('hour');
      expect(first).toHaveProperty('load');
      expect(first).toHaveProperty('cpu');
      expect(first).toHaveProperty('memory');
      expect(first).toHaveProperty('isFuture');
      expect(typeof first?.isFuture).toBe('boolean');
    });

    it('marks future hours correctly', () => {
      const currentHour = new Date().getHours();
      const history = generateSystemLoadHistory(3000);
      expect(history[currentHour]?.isFuture).toBe(false);
      expect(history[(currentHour + 1) % 24]?.isFuture).toBe(currentHour !== 23);
    });
  });
});
