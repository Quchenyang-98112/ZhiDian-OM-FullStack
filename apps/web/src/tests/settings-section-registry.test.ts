import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearAdapterSettingsSections,
  getAdapterSettingsSection,
  listAdapterSettingsSections,
  registerAdapterSettingsSection,
  unregisterAdapterSettingsSection,
} from '../core/adapters/settings-section-registry';

const StubSection = () => null;

describe('settings-section-registry', () => {
  beforeEach(() => {
    clearAdapterSettingsSections();
  });

  it('registers and retrieves a section by adapter id', () => {
    registerAdapterSettingsSection({
      adapterId: 'homeassistant-mqtt',
      order: 10,
      Component: StubSection,
    });
    expect(getAdapterSettingsSection('homeassistant-mqtt')?.adapterId).toBe('homeassistant-mqtt');
  });

  it('lists sections sorted by order', () => {
    registerAdapterSettingsSection({
      adapterId: 'b',
      order: 20,
      Component: StubSection,
    });
    registerAdapterSettingsSection({
      adapterId: 'a',
      order: 5,
      Component: StubSection,
    });
    expect(listAdapterSettingsSections().map((s) => s.adapterId)).toEqual(['a', 'b']);
  });

  it('unregisters a section', () => {
    registerAdapterSettingsSection({
      adapterId: 'zigbee2mqtt',
      order: 1,
      Component: StubSection,
    });
    expect(unregisterAdapterSettingsSection('zigbee2mqtt')).toBe(true);
    expect(getAdapterSettingsSection('zigbee2mqtt')).toBeUndefined();
  });
});
