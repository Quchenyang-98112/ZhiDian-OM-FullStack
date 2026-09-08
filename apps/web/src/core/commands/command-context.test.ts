import { describe, expect, it, vi } from 'vitest';
import {
  buildAdapterStoreSnapshotKey,
  getContextualCommandIds,
  getRecentCommandIds,
} from './command-context';
import type { CommandContext } from './types';

function mockContext(overrides: Partial<CommandContext> = {}): CommandContext {
  return {
    route: { pathname: '/', search: '' },
    locale: 'de',
    theme: 'ocean-dark',
    energy: {
      pvPower: 5,
      batterySoC: 50,
      batteryPower: 0,
      gridPower: 0,
      houseLoad: 2,
      priceCurrent: 0.2,
      evPower: 0,
    },
    adapterStatuses: new Map(),
    adapterEntries: new Map(),
    tariffProvider: 'tibber',
    chargeThreshold: 0.15,
    isReadOnly: false,
    isLiveMode: false,
    authScope: 'readwrite',
    navigate: vi.fn(),
    t: ((key: string) => key) as CommandContext['t'],
    actions: {
      closePalette: vi.fn(),
      recordUsage: vi.fn(),
      toggleFavorite: vi.fn(),
    },
    ...overrides,
  };
}

describe('buildAdapterStoreSnapshotKey', () => {
  it('includes enabled flag so palette refreshes on adapter toggle', () => {
    const connected = buildAdapterStoreSnapshotKey({
      victron: { status: 'connected', enabled: true },
    });
    const disabled = buildAdapterStoreSnapshotKey({
      victron: { status: 'connected', enabled: false },
    });
    expect(connected).not.toBe(disabled);
  });
});

describe('getRecentCommandIds', () => {
  it('sorts recent commands by timestamp descending', () => {
    const ids = getRecentCommandIds({
      recent: [
        { id: 'a', ts: 100 },
        { id: 'b', ts: 300 },
        { id: 'c', ts: 200 },
      ],
      favorites: [],
    });
    expect(ids).toEqual(['b', 'c', 'a']);
  });
});

describe('getContextualCommandIds', () => {
  it('suggests surplus optimization when PV exceeds load', () => {
    const ctx = mockContext({
      energy: {
        pvPower: 8,
        batterySoC: 50,
        batteryPower: 0,
        gridPower: 0,
        houseLoad: 2,
        priceCurrent: 0.1,
        evPower: 0,
      },
    });
    expect(getContextualCommandIds(ctx)).toContain('energy.optimizeSurplus');
  });

  it('suggests battery view when SoC is low', () => {
    const ctx = mockContext({
      energy: {
        pvPower: 1,
        batterySoC: 10,
        batteryPower: 0,
        gridPower: 0,
        houseLoad: 2,
        priceCurrent: 0.1,
        evPower: 0,
      },
    });
    expect(getContextualCommandIds(ctx)).toContain('energy.viewBattery');
  });

  it('suggests tariffs when price exceeds threshold', () => {
    const ctx = mockContext({
      energy: {
        pvPower: 1,
        batterySoC: 50,
        batteryPower: 0,
        gridPower: 0,
        houseLoad: 2,
        priceCurrent: 0.5,
        evPower: 0,
      },
      chargeThreshold: 0.2,
    });
    expect(getContextualCommandIds(ctx)).toContain('energy.viewTariffs');
  });

  it('suggests monitoring when an adapter is in error state', () => {
    const ctx = mockContext({
      adapterStatuses: new Map([['victron', 'error']]),
    });
    expect(getContextualCommandIds(ctx)).toContain('nav-monitoring');
  });
});
