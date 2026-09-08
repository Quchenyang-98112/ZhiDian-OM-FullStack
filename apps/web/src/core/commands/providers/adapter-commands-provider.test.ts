import { describe, expect, it, vi } from 'vitest';
import type { CommandContext } from '../types';
import { adapterCommandsProvider } from './adapter-commands-provider';

const connect = vi.fn();

vi.mock('../../useEnergyStore', () => ({
  useEnergyStoreBase: {
    getState: () => ({
      adapters: {
        victron: {
          adapter: { connect, name: 'Victron GX' },
          status: 'error',
          enabled: true,
        },
      },
    }),
  },
}));

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

describe('adapterCommandsProvider', () => {
  it('emits settings commands for enabled adapters', () => {
    const ctx = mockContext({
      adapterEntries: new Map([
        ['victron', { id: 'victron', name: 'Victron GX', status: 'connected', enabled: true }],
      ]),
    });

    const commands = adapterCommandsProvider.getCommands(ctx);

    expect(commands.some((cmd) => cmd.id === 'adapter.settings.victron')).toBe(true);
  });

  it('emits reconnect commands only for adapters in error state', () => {
    const ctx = mockContext({
      adapterEntries: new Map([
        ['victron', { id: 'victron', name: 'Victron GX', status: 'error', enabled: true }],
        ['evcc', { id: 'evcc', name: 'evcc', status: 'connected', enabled: true }],
      ]),
      adapterStatuses: new Map([
        ['victron', 'error'],
        ['evcc', 'connected'],
      ]),
    });

    const commands = adapterCommandsProvider.getCommands(ctx);

    expect(commands.some((cmd) => cmd.id === 'adapter.reconnect.victron')).toBe(true);
    expect(commands.some((cmd) => cmd.id === 'adapter.reconnect.evcc')).toBe(false);
  });

  it('navigates to adapter settings on settings command execute', () => {
    const ctx = mockContext({
      adapterEntries: new Map([
        ['victron', { id: 'victron', name: 'Victron GX', status: 'connected', enabled: true }],
      ]),
    });
    const settings = adapterCommandsProvider
      .getCommands(ctx)
      .find((cmd) => cmd.id === 'adapter.settings.victron');

    expect(settings?.labelParams?.(ctx)).toEqual({ name: 'Victron GX' });
    settings?.execute(ctx);
    expect(ctx.navigate).toHaveBeenCalledWith('/settings?tab=adapters');
    expect(ctx.actions.closePalette).toHaveBeenCalled();
  });

  it('reconnects adapter without re-attaching listeners', () => {
    connect.mockClear();
    const ctx = mockContext({
      adapterEntries: new Map([
        ['victron', { id: 'victron', name: 'Victron GX', status: 'error', enabled: true }],
      ]),
      adapterStatuses: new Map([['victron', 'error']]),
    });
    const reconnect = adapterCommandsProvider
      .getCommands(ctx)
      .find((cmd) => cmd.id === 'adapter.reconnect.victron');

    reconnect?.execute(ctx);
    expect(connect).toHaveBeenCalledTimes(1);
    expect(ctx.actions.closePalette).toHaveBeenCalled();
  });
});
