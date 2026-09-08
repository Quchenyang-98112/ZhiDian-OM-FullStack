import { describe, expect, it } from 'vitest';
import {
  getWritablePropertyAllowlist,
  isSafeComponentId,
  isSafePropertyName,
  sanitizePropertyValue,
  sanitizeWritableProperties,
} from './openems-writable-rules.js';

describe('openems-writable-rules', () => {
  it('validates safe component and property ids', () => {
    expect(isSafeComponentId('evcs0')).toBe(true);
    expect(isSafeComponentId('bad id')).toBe(false);
    expect(isSafePropertyName('setChargePowerLimit')).toBe(true);
    expect(isSafePropertyName('bad name!')).toBe(false);
  });

  it('sanitizes property values', () => {
    expect(sanitizePropertyValue(42)).toBe(42);
    expect(sanitizePropertyValue(true)).toBe(true);
    expect(sanitizePropertyValue(null)).toBeNull();
    expect(sanitizePropertyValue({})).toBeNull();
    expect(sanitizePropertyValue('x'.repeat(300)).length).toBe(256);
  });

  it('returns allowlists for known component ids', () => {
    expect(getWritablePropertyAllowlist('evcs0')?.has('setChargePowerLimit')).toBe(true);
    expect(getWritablePropertyAllowlist('ctrlEvcs0')?.has('enabledCharging')).toBe(true);
    expect(getWritablePropertyAllowlist('unknown-device')).toBeNull();
  });

  it('filters properties against the component allowlist', () => {
    const safe = sanitizeWritableProperties('evcs0', [
      { name: 'setChargePowerLimit', value: 11000 },
      { name: 'dangerous', value: 1 },
    ]);
    expect(safe).toEqual([{ name: 'setChargePowerLimit', value: 11000 }]);
  });

  it('allows only ctrlIoHeatPumpSgReady components for SgReady writes', () => {
    expect(getWritablePropertyAllowlist('ctrlIoHeatPumpSgReady0')?.has('mode')).toBe(true);
    expect(getWritablePropertyAllowlist('ctrlEssFixActivePower0')).not.toBeNull();
    expect(getWritablePropertyAllowlist('ctrlHeatPump0')).toBeNull();
  });
});
