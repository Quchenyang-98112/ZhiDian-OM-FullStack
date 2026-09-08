import { describe, expect, it } from 'vitest';
import { classifySettingsKey } from '../data/settings-sync-keys.js';

describe('settings-sync-keys', () => {
  it('classifies appearance keys as userPreferences', () => {
    expect(classifySettingsKey('animations')).toBe('userPreferences');
    expect(classifySettingsKey('compactMode')).toBe('userPreferences');
  });

  it('classifies hardware and network keys as deviceSettings', () => {
    expect(classifySettingsKey('victronIp')).toBe('deviceSettings');
    expect(classifySettingsKey('knxIp')).toBe('deviceSettings');
    expect(classifySettingsKey('systemConfig')).toBe('deviceSettings');
  });
});
