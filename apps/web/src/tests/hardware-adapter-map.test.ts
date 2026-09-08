import { describe, expect, it } from 'vitest';
import { registerBuiltinAdapters } from '../core/adapters/adapter-registry';
import { getDeviceById } from '../core/hardware-registry';
import {
  defaultHostForDevice,
  defaultPortForAdapter,
  suggestAdapterIdForDevice,
} from '../lib/hardware-adapter-map';

describe('hardware-adapter-map', () => {
  it('suggests a registered adapter for a known Victron device', () => {
    registerBuiltinAdapters();
    const device = getDeviceById('victron-multiplus-ii-48-5000');
    expect(device).toBeDefined();
    const adapterId = suggestAdapterIdForDevice(device!);
    expect(adapterId).toBe('victron-mqtt');
  });

  it('returns sensible default ports', () => {
    expect(defaultPortForAdapter('victron-mqtt')).toBe(9001);
    expect(defaultPortForAdapter('knx')).toBe(3671);
    expect(defaultPortForAdapter('unknown-adapter')).toBe(8080);
  });

  it('prefers the device default port when provided', () => {
    const device = getDeviceById('victron-multiplus-ii-48-5000');
    expect(device).toBeDefined();
    const withPort = { ...device!, defaultPort: 4711 };
    expect(defaultPortForAdapter('victron-mqtt', withPort)).toBe(4711);
  });

  it('returns null when no registered adapter matches the device protocols', () => {
    const adapterId = suggestAdapterIdForDevice({
      id: 'custom-unknown',
      manufacturer: 'Test',
      model: 'Unknown',
      category: 'inverter',
      protocols: ['custom-protocol' as never],
    });
    expect(adapterId).toBeNull();
  });

  it('returns a default LAN host only when a device is provided', () => {
    const device = getDeviceById('victron-multiplus-ii-48-5000');
    expect(defaultHostForDevice()).toBe('');
    expect(defaultHostForDevice(device!)).toBe('192.168.1.100');
  });
});
