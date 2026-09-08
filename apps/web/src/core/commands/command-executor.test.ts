import { toast } from 'sonner';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { executeResolvedCommand } from './command-executor';
import type { CommandContext, ResolvedCommand } from './types';

vi.mock('sonner', () => ({
  toast: { error: vi.fn() },
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

function mockCommand(overrides: Partial<ResolvedCommand> = {}): ResolvedCommand {
  return {
    id: 'test.cmd',
    labelKey: 'test',
    label: 'Test',
    category: 'action',
    risk: 'safe',
    source: 'core',
    score: 10,
    disabled: false,
    isFavorite: false,
    section: 'action',
    execute: vi.fn(),
    ...overrides,
  };
}

describe('executeResolvedCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns disabled when command is blocked', async () => {
    const ctx = mockContext({ isReadOnly: true });
    const cmd = mockCommand({
      disabled: true,
      disabledReasonKey: 'mode.readOnlyBlocked',
      blockedInReadOnly: true,
    });

    const result = await executeResolvedCommand(cmd, ctx);

    expect(result).toEqual({ ok: false, reason: 'readonly' });
    expect(toast.error).toHaveBeenCalledWith('mode.readOnlyBlocked');
    expect(cmd.execute).not.toHaveBeenCalled();
  });

  it('returns scope when command lacks permissions', async () => {
    const ctx = mockContext();
    const cmd = mockCommand({
      disabled: true,
      disabledReasonKey: 'command.insufficientScope',
    });

    const result = await executeResolvedCommand(cmd, ctx);

    expect(result).toEqual({ ok: false, reason: 'scope' });
  });

  it('records usage after successful execution', async () => {
    const ctx = mockContext();
    const cmd = mockCommand();

    const result = await executeResolvedCommand(cmd, ctx);

    expect(result).toEqual({ ok: true });
    expect(cmd.execute).toHaveBeenCalledWith(ctx);
    expect(ctx.actions.recordUsage).toHaveBeenCalledWith('test.cmd');
  });

  it('returns error when execute throws', async () => {
    const ctx = mockContext();
    const cmd = mockCommand({
      execute: vi.fn(() => {
        throw new Error('boom');
      }),
    });

    const result = await executeResolvedCommand(cmd, ctx);

    expect(result).toEqual({ ok: false, reason: 'error' });
    expect(toast.error).toHaveBeenCalledWith('boom');
  });

  it('routes danger hardware commands through executeHardwareCommand', async () => {
    const executeHardwareCommand = vi.fn();
    const ctx = mockContext({
      actions: {
        closePalette: vi.fn(),
        recordUsage: vi.fn(),
        toggleFavorite: vi.fn(),
        executeHardwareCommand,
      },
    });
    const cmd = mockCommand({
      risk: 'danger',
      hardwareCommand: { type: 'STOP_CHARGING', value: true },
      execute: vi.fn(),
    });

    const result = await executeResolvedCommand(cmd, ctx);

    expect(result).toEqual({ ok: true });
    expect(executeHardwareCommand).toHaveBeenCalledWith({ type: 'STOP_CHARGING', value: true });
    expect(cmd.execute).not.toHaveBeenCalled();
    expect(ctx.actions.recordUsage).toHaveBeenCalledWith('test.cmd');
  });

  it('reports missing hardware bridge for danger commands', async () => {
    const ctx = mockContext();
    const cmd = mockCommand({
      risk: 'danger',
      hardwareCommand: { type: 'STOP_CHARGING', value: true },
    });

    const result = await executeResolvedCommand(cmd, ctx);

    expect(result).toEqual({ ok: false, reason: 'error' });
    expect(toast.error).toHaveBeenCalledWith('command.hardwareBridgeMissing');
  });

  it('routes moderate hardware commands through executeHardwareCommand', async () => {
    const executeHardwareCommand = vi.fn();
    const ctx = mockContext({
      actions: {
        closePalette: vi.fn(),
        recordUsage: vi.fn(),
        toggleFavorite: vi.fn(),
        executeHardwareCommand,
      },
    });
    const cmd = mockCommand({
      risk: 'moderate',
      hardwareCommand: { type: 'SET_BATTERY_POWER', value: 1000 },
    });

    const result = await executeResolvedCommand(cmd, ctx);

    expect(result).toEqual({ ok: true });
    expect(executeHardwareCommand).toHaveBeenCalledWith({ type: 'SET_BATTERY_POWER', value: 1000 });
    expect(ctx.actions.recordUsage).toHaveBeenCalledWith('test.cmd');
  });

  it('resolves dynamic hardwareCommand functions before bridging', async () => {
    const executeHardwareCommand = vi.fn();
    const ctx = mockContext({
      actions: {
        closePalette: vi.fn(),
        recordUsage: vi.fn(),
        toggleFavorite: vi.fn(),
        executeHardwareCommand,
      },
    });
    const cmd = mockCommand({
      risk: 'admin',
      hardwareCommand: () => ({ type: 'STOP_CHARGING', value: true }),
    });

    const result = await executeResolvedCommand(cmd, ctx);

    expect(result).toEqual({ ok: true });
    expect(executeHardwareCommand).toHaveBeenCalledWith({ type: 'STOP_CHARGING', value: true });
    expect(ctx.actions.recordUsage).toHaveBeenCalledWith('test.cmd');
  });
});
