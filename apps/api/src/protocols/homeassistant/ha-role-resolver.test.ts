import { describe, expect, it } from 'vitest';
import {
  type HAEntityMapping,
  parseHANumericState,
  resolveHAEntityRole,
} from './ha-role-resolver.js';

describe('ha-role-resolver', () => {
  const staticMap = new Map<string, HAEntityMapping>([
    {
      entityId: 'sensor.custom_pv',
      metric: 'POWER_W',
      role: 'pv',
    },
  ]);

  it('prefers static entity map entries', () => {
    const result = resolveHAEntityRole('sensor.custom_pv', '', 'W', staticMap);
    expect(result).toEqual({ metric: 'POWER_W', role: 'pv', scale: 1 });
  });

  it('resolves battery SoC by device class', () => {
    const result = resolveHAEntityRole('sensor.foo', 'battery_soc', '%', staticMap);
    expect(result?.role).toBe('battery');
    expect(result?.metric).toBe('SOC_PERCENT');
  });

  it('parses kW power values into watts', () => {
    const value = parseHANumericState('2.5', 'kW', 'POWER_W', 1);
    expect(value).toBe(2500);
  });

  it('applies scale factor together with kW conversion', () => {
    expect(parseHANumericState('2.5', 'kW', 'POWER_W', 2)).toBe(5000);
  });

  it('classifies house_import as load, not grid', () => {
    const result = resolveHAEntityRole('sensor.house_import', '', 'W', staticMap);
    expect(result?.role).toBe('load');
    expect(result?.metric).toBe('POWER_W');
  });

  it('returns null for non-numeric HA states', () => {
    expect(parseHANumericState('unavailable', 'W', 'POWER_W', 1)).toBeNull();
  });
});
