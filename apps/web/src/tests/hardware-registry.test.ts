import { describe, expect, it } from 'vitest';
import {
  type DeviceCategory,
  getAllDevices,
  getDeviceById,
  getDeviceCount,
  getDeviceStats,
  getDevicesByCategory,
  getDevicesByManufacturer,
  getDevicesByProtocol,
  getEvccCompatibleDevices,
  getManufacturers,
  getOpenEmsCompatibleDevices,
  searchDevices,
} from '../core/hardware-registry';

const CATEGORIES: DeviceCategory[] = ['inverter', 'wallbox', 'meter', 'battery', 'heatpump'];

describe('hardware-registry', () => {
  const all = getAllDevices();
  const first = all[0];

  it('exposes a non-empty catalog whose size matches getDeviceCount()', () => {
    expect(all.length).toBeGreaterThan(0);
    expect(getDeviceCount()).toBe(all.length);
  });

  it('has unique, kebab-case device ids', () => {
    const ids = all.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(id).toMatch(/^[a-z0-9-]+$/);
    }
  });

  it('every device declares a known category and at least one protocol', () => {
    for (const d of all) {
      expect(CATEGORIES).toContain(d.category);
      expect(d.protocols.length).toBeGreaterThan(0);
    }
  });

  it('getDevicesByCategory returns only devices of that category', () => {
    for (const category of CATEGORIES) {
      const devices = getDevicesByCategory(category);
      for (const d of devices) expect(d.category).toBe(category);
    }
  });

  it('getDeviceStats sums to the total device count', () => {
    const stats = getDeviceStats();
    const sum = CATEGORIES.reduce((acc, c) => acc + stats[c], 0);
    expect(sum).toBe(getDeviceCount());
    for (const category of CATEGORIES) {
      expect(stats[category]).toBe(getDevicesByCategory(category).length);
    }
  });

  it('getDeviceById resolves a known id and returns undefined for an unknown one', () => {
    expect(getDeviceById(first.id)).toEqual(first);
    expect(getDeviceById('definitely-not-a-real-device-id')).toBeUndefined();
  });

  it('getDevicesByManufacturer is case-insensitive and substring-matched', () => {
    const matches = getDevicesByManufacturer(first.manufacturer.toUpperCase());
    expect(matches).toContainEqual(first);
    for (const d of matches) {
      expect(d.manufacturer.toLowerCase()).toContain(first.manufacturer.toLowerCase());
    }
  });

  it('getDevicesByProtocol returns only devices advertising that protocol', () => {
    const protocol = first.protocols[0];
    const devices = getDevicesByProtocol(protocol);
    expect(devices.length).toBeGreaterThan(0);
    for (const d of devices) expect(d.protocols).toContain(protocol);
  });

  it('searchDevices matches manufacturer/model/id (case-insensitive)', () => {
    expect(searchDevices(first.model)).toContainEqual(first);
    expect(searchDevices(first.manufacturer.toLowerCase())).toContainEqual(first);
    expect(searchDevices('zzz-no-such-device-zzz')).toEqual([]);
  });

  it('getManufacturers returns a sorted, de-duplicated list', () => {
    const manufacturers = getManufacturers();
    expect(new Set(manufacturers).size).toBe(manufacturers.length);
    expect([...manufacturers].sort()).toEqual(manufacturers);
    expect(manufacturers).toContain(first.manufacturer);
  });

  it('evcc/OpenEMS compatible subsets are filtered by their template ids', () => {
    for (const d of getEvccCompatibleDevices()) expect(d.evccTemplate).toBeTruthy();
    for (const d of getOpenEmsCompatibleDevices()) expect(d.openEmsFactoryId).toBeTruthy();
    expect(getEvccCompatibleDevices().length).toBeLessThanOrEqual(all.length);
  });
});
