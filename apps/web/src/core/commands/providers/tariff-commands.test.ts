import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CommandContext } from '../types';
import { createTariffCommands } from './tariff-commands';

const updateSettings = vi.fn();

vi.mock('../../../store', () => ({
  useAppStore: {
    getState: () => ({ updateSettings }),
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

describe('createTariffCommands', () => {
  beforeEach(() => {
    updateSettings.mockClear();
  });

  const commands = createTariffCommands();

  it('exposes one command per tariff provider option', () => {
    expect(commands.map((cmd) => cmd.id)).toEqual([
      'settings.tariff.tibber',
      'settings.tariff.awattar',
      'settings.tariff.octopus',
      'settings.tariff.none',
    ]);
  });

  it('hides the active tariff provider command', () => {
    const ctx = mockContext({ tariffProvider: 'tibber' });
    const tibber = commands.find((cmd) => cmd.id === 'settings.tariff.tibber');
    const awattar = commands.find((cmd) => cmd.id === 'settings.tariff.awattar');
    expect(tibber?.when?.(ctx)).toBe(false);
    expect(awattar?.when?.(ctx)).toBe(true);
  });

  it('updates settings and closes the palette on execute', () => {
    const ctx = mockContext({ tariffProvider: 'tibber' });
    const awattar = commands.find((cmd) => cmd.id === 'settings.tariff.awattar');
    awattar?.execute(ctx);
    expect(updateSettings).toHaveBeenCalledWith({ tariffProvider: 'awattar' });
    expect(ctx.actions.closePalette).toHaveBeenCalled();
  });

  it('can switch to octopus and none providers', () => {
    const ctx = mockContext({ tariffProvider: 'awattar' });
    const octopus = commands.find((cmd) => cmd.id === 'settings.tariff.octopus');
    const none = commands.find((cmd) => cmd.id === 'settings.tariff.none');
    octopus?.execute(ctx);
    none?.execute(ctx);
    expect(updateSettings).toHaveBeenCalledWith({ tariffProvider: 'octopus' });
    expect(updateSettings).toHaveBeenCalledWith({ tariffProvider: 'none' });
  });
});
