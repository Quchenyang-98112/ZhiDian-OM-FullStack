import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAppStore } from '../../store';
import {
  clearCommandRegistryForTests,
  collectCommandDefinitions,
  registerCommand,
  registerCommandProvider,
  resolveCommands,
  unregisterCommandProvider,
} from './command-registry';
import { buildSearchTokens, scoreCommand } from './command-search';
import { registerCoreCommands } from './providers';
import { createHelpCommands } from './providers/help-commands';
import { createSettingsCommands } from './providers/settings-commands';
import { createSystemCommands } from './providers/system-commands';
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
    navigate: () => {},
    t: ((key: string) => key) as CommandContext['t'],
    actions: {
      closePalette: () => {},
      recordUsage: () => {},
      toggleFavorite: () => {},
    },
    ...overrides,
  };
}

describe('command-registry', () => {
  beforeEach(() => {
    clearCommandRegistryForTests();
    registerCoreCommands();
  });

  it('registers core navigation commands', () => {
    const ctx = mockContext();
    const cmds = collectCommandDefinitions(ctx);
    expect(cmds.some((c) => c.id === 'nav-dashboard')).toBe(true);
    expect(cmds.some((c) => c.id === 'nav-settings-adapters')).toBe(true);
    expect(cmds.some((c) => c.id === 'settings.tariff.awattar')).toBe(true);
    expect(cmds.some((c) => c.id === 'device.batteryForceCharge')).toBe(true);
    expect(cmds.length).toBeGreaterThanOrEqual(25);
  });

  it('filters contextual energy commands by when()', () => {
    const lowPv = mockContext({
      energy: {
        pvPower: 1,
        batterySoC: 50,
        batteryPower: 0,
        gridPower: 0,
        houseLoad: 2,
        priceCurrent: 0.1,
        evPower: 0,
      },
    });
    const highPv = mockContext({
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
    const lowCmds = collectCommandDefinitions(lowPv);
    const highCmds = collectCommandDefinitions(highPv);
    expect(lowCmds.some((c) => c.id === 'energy.optimizeSurplus')).toBe(false);
    expect(highCmds.some((c) => c.id === 'energy.optimizeSurplus')).toBe(true);
  });

  it('disables commands in read-only mode when blocked', () => {
    registerCommand({
      id: 'test.danger',
      labelKey: 'test',
      category: 'device',
      risk: 'danger',
      blockedInReadOnly: true,
      source: 'core',
      execute: () => {},
    });
    const ctx = mockContext({ isReadOnly: true });
    const resolved = resolveCommands(ctx, {
      query: 'test',
      recentIds: [],
      favoriteIds: [],
      contextualIds: [],
      scoreFn: scoreCommand,
    });
    const cmd = resolved.find((c) => c.id === 'test.danger');
    expect(cmd?.disabled).toBe(true);
  });
});

describe('command-search', () => {
  it('ranks prefix matches above substring matches', () => {
    const cmd = {
      id: 'nav-tariffs',
      labelKey: 'x',
      category: 'navigation' as const,
      risk: 'safe' as const,
      source: 'core' as const,
      execute: () => {},
      keywords: ['preis'],
    };
    const prefix = scoreCommand(cmd, 'Tarife', 'tar', {
      recent: false,
      favorite: false,
      contextual: false,
    });
    const keyword = scoreCommand(cmd, 'Tarife', 'preis', {
      recent: false,
      favorite: false,
      contextual: false,
    });
    expect(prefix).toBeGreaterThan(keyword);
  });

  it('returns zero for non-matching query', () => {
    const cmd = {
      id: 'x',
      labelKey: 'y',
      category: 'navigation' as const,
      risk: 'safe' as const,
      source: 'core' as const,
      execute: () => {},
    };
    expect(
      scoreCommand(cmd, 'Home', 'zzzzz', { recent: false, favorite: false, contextual: false }),
    ).toBe(0);
  });

  it('applies empty-query boosts', () => {
    const cmd = {
      id: 'x',
      labelKey: 'y',
      category: 'navigation' as const,
      risk: 'safe' as const,
      source: 'core' as const,
      execute: () => {},
    };
    const base = scoreCommand(cmd, 'Home', '', {
      recent: false,
      favorite: false,
      contextual: false,
    });
    const boosted = scoreCommand(cmd, 'Home', '', {
      recent: true,
      favorite: true,
      contextual: true,
    });
    expect(boosted).toBeGreaterThan(base);
  });

  it('scores exact and keyword matches', () => {
    const cmd = {
      id: 'nav.help',
      labelKey: 'y',
      category: 'navigation' as const,
      risk: 'safe' as const,
      source: 'core' as const,
      execute: () => {},
      keywords: ['hilfe'],
    };
    expect(
      scoreCommand(cmd, 'Hilfe', 'hilfe', { recent: false, favorite: false, contextual: false }),
    ).toBeGreaterThan(0);
    expect(buildSearchTokens('Hello World', ['foo-bar'])).toContain('hello');
  });
});

describe('settings and system commands', () => {
  beforeEach(() => {
    clearCommandRegistryForTests();
  });

  it('cycles theme and locale from settings commands', () => {
    const closePalette = vi.fn();
    const ctx = mockContext({
      theme: 'ocean-dark',
      locale: 'de',
      actions: {
        closePalette,
        recordUsage: vi.fn(),
        toggleFavorite: vi.fn(),
      },
    });

    const [themeCmd, localeCmd] = createSettingsCommands();
    themeCmd.execute(ctx);
    expect(useAppStore.getState().theme).not.toBe('ocean-dark');
    expect(closePalette).toHaveBeenCalled();

    localeCmd.execute(ctx);
    expect(useAppStore.getState().locale).toBe('en');
  });

  it('navigates to shortcuts help from system command', () => {
    const navigate = vi.fn();
    const closePalette = vi.fn();
    const ctx = mockContext({
      navigate,
      actions: { closePalette, recordUsage: vi.fn(), toggleFavorite: vi.fn() },
    });

    const [shortcutsCmd] = createSystemCommands();
    shortcutsCmd.execute(ctx);
    expect(navigate).toHaveBeenCalledWith('/help?tab=shortcuts');
    expect(closePalette).toHaveBeenCalled();
  });

  it('navigates to contextual help tabs from help commands', () => {
    const navigate = vi.fn();
    const closePalette = vi.fn();
    const ctx = mockContext({
      navigate,
      actions: { closePalette, recordUsage: vi.fn(), toggleFavorite: vi.fn() },
    });

    const faqCmd = createHelpCommands().find((cmd) => cmd.id === 'nav-help-faq');
    expect(faqCmd).toBeDefined();
    faqCmd?.execute(ctx);
    expect(navigate).toHaveBeenCalledWith('/help?tab=faq');
    expect(closePalette).toHaveBeenCalled();
  });
});

describe('command providers', () => {
  beforeEach(() => {
    clearCommandRegistryForTests();
  });

  it('skips duplicate command registration in dev', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const cmd = {
      id: 'dup.test',
      labelKey: 'x',
      category: 'system' as const,
      risk: 'safe' as const,
      source: 'core' as const,
      execute: () => {},
    };
    registerCommand(cmd);
    registerCommand(cmd);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('resolves recent and favorite sections when query is empty', () => {
    registerCoreCommands();
    const ctx = mockContext();
    const resolved = resolveCommands(ctx, {
      query: '',
      recentIds: ['nav-dashboard'],
      favoriteIds: ['nav-settings'],
      contextualIds: [],
      scoreFn: scoreCommand,
    });
    const recent = resolved.find((c) => c.id === 'nav-dashboard');
    const favorite = resolved.find((c) => c.id === 'nav-settings');
    expect(recent?.section).toBe('recent');
    expect(favorite?.section).toBe('favorites');
  });

  it('includes AI suggestions when experimental features are enabled', () => {
    registerCoreCommands();
    useAppStore.setState({
      settings: { ...useAppStore.getState().settings, experimentalFeatures: true },
    });
    const ctx = mockContext({
      energy: {
        pvPower: 8,
        batterySoC: 40,
        batteryPower: 0,
        gridPower: 0,
        houseLoad: 2,
        priceCurrent: 0.1,
        evPower: 0,
      },
      chargeThreshold: 0.15,
    });
    const defs = collectCommandDefinitions(ctx);
    const aiCmd = defs.find((c) => c.id === 'ai.suggest.optimizeSurplus');
    expect(aiCmd?.source).toBe('ai');
    expect(aiCmd?.labelKey).toBe('command.optimizeSurplus');
    const batteryAi = defs.find((c) => c.id === 'ai.suggest.batteryForceCharge');
    expect(batteryAi?.source).toBe('ai');
    expect(batteryAi?.hardwareCommand).toBeTruthy();
  });

  it('skips AI EV mirror when the source device command is unavailable', () => {
    registerCoreCommands();
    useAppStore.setState({
      settings: { ...useAppStore.getState().settings, experimentalFeatures: true },
    });
    const ctx = mockContext({
      energy: {
        pvPower: 8,
        batterySoC: 50,
        batteryPower: 0,
        gridPower: 0,
        houseLoad: 2,
        priceCurrent: 0.2,
        evPower: 3500,
      },
    });
    const defs = collectCommandDefinitions(ctx);
    expect(defs.some((c) => c.id === 'ai.suggest.startEvCharging')).toBe(false);
    expect(defs.some((c) => c.id === 'device.startEvCharging')).toBe(false);
  });

  it('removes a registered command provider by id', () => {
    registerCommandProvider({
      id: 'temp-provider',
      priority: 10,
      getCommands: () => [
        {
          id: 'temp-provider.action',
          labelKey: 'x',
          category: 'system',
          risk: 'safe',
          source: 'adapter',
          execute: () => {},
        },
      ],
    });
    const ctx = mockContext();
    expect(collectCommandDefinitions(ctx).some((c) => c.id === 'temp-provider.action')).toBe(true);
    unregisterCommandProvider('temp-provider');
    expect(collectCommandDefinitions(ctx).some((c) => c.id === 'temp-provider.action')).toBe(false);
  });

  it('warns when provider returns a duplicate command id', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    registerCommand({
      id: 'provider.dup',
      labelKey: 'x',
      category: 'system' as const,
      risk: 'safe' as const,
      source: 'core' as const,
      execute: () => {},
    });
    registerCommandProvider({
      id: 'dup-provider',
      priority: 50,
      getCommands: () => [
        {
          id: 'provider.dup',
          labelKey: 'y',
          category: 'system',
          risk: 'safe',
          source: 'adapter',
          execute: () => {},
        },
      ],
    });
    const ctx = mockContext();
    collectCommandDefinitions(ctx);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
