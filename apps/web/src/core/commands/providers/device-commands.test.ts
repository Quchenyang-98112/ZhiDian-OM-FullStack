import { describe, expect, it, vi } from 'vitest';
import { BATTERY_FORCE_CHARGE_W } from '../../../lib/battery-control';
import type { CommandContext } from '../types';
import { createDeviceCommands } from './device-commands';

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
      evPower: 3500,
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

describe('createDeviceCommands', () => {
  const commands = createDeviceCommands();
  const startCmd = commands.find((cmd) => cmd.id === 'device.startEvCharging');
  const stopCmd = commands.find((cmd) => cmd.id === 'device.stopEvCharging');
  const viewCmd = commands.find((cmd) => cmd.id === 'device.viewEvCharging');
  const forceChargeCmd = commands.find((cmd) => cmd.id === 'device.batteryForceCharge');
  const stopBatteryCmd = commands.find((cmd) => cmd.id === 'device.batteryStopCharge');

  it('exposes EV charging commands when load is active', () => {
    const ctx = mockContext();
    expect(stopCmd?.when?.(ctx)).toBe(true);
    expect(viewCmd?.when?.(ctx)).toBe(true);
    expect(startCmd?.when?.(ctx)).toBe(false);
  });

  it('shows start EV command when wallbox is idle', () => {
    const ctx = mockContext({ energy: { ...mockContext().energy, evPower: 0 } });
    expect(startCmd?.when?.(ctx)).toBe(true);
    expect(stopCmd?.when?.(ctx)).toBe(false);
    expect(viewCmd?.when?.(ctx)).toBe(false);
  });

  it('formats stop-charging preview with locale-aware power', () => {
    const ctx = mockContext();
    const preview = stopCmd?.preview?.(ctx);
    expect(preview?.titleKey).toBe('command.preview.stopCharging');
    expect(preview?.metrics?.[0]?.value).toMatch(/3,5 kW|3\.5 kW/);
  });

  it('maps hardware commands for EV and battery actions', () => {
    expect(startCmd?.hardwareCommand).toEqual({ type: 'START_CHARGING', value: true });
    expect(stopCmd?.hardwareCommand).toEqual({ type: 'STOP_CHARGING', value: true });
    expect(forceChargeCmd?.hardwareCommand).toEqual({
      type: 'SET_BATTERY_POWER',
      value: BATTERY_FORCE_CHARGE_W,
    });
    expect(stopBatteryCmd?.hardwareCommand).toEqual({ type: 'SET_BATTERY_POWER', value: 0 });
  });

  it('shows battery force charge when SoC is low and not charging', () => {
    const ctx = mockContext({
      energy: { ...mockContext().energy, batterySoC: 40, batteryPower: 0 },
    });
    expect(forceChargeCmd?.when?.(ctx)).toBe(true);
    expect(stopBatteryCmd?.when?.(ctx)).toBe(false);
  });

  it('shows battery stop charge when pack is actively charging', () => {
    const ctx = mockContext({
      energy: { ...mockContext().energy, batteryPower: 2500 },
    });
    expect(stopBatteryCmd?.when?.(ctx)).toBe(true);
    expect(forceChargeCmd?.when?.(ctx)).toBe(false);
  });

  it('formats start-charging preview and closes palette on execute', () => {
    const ctx = mockContext({ energy: { ...mockContext().energy, evPower: 0 } });
    const preview = startCmd?.preview?.(ctx);
    expect(preview?.titleKey).toBe('command.preview.startCharging');
    expect(preview?.impactKey).toBe('command.preview.startChargingImpact');
    startCmd?.execute(ctx);
    expect(ctx.actions.closePalette).toHaveBeenCalled();
  });

  it('formats battery force-charge preview and closes palette on execute', () => {
    const ctx = mockContext({
      energy: { ...mockContext().energy, batterySoC: 40, batteryPower: 0 },
    });
    const preview = forceChargeCmd?.preview?.(ctx);
    expect(preview?.titleKey).toBe('command.preview.forceCharge');
    expect(preview?.metrics?.[0]?.value).toBe('40%');
    expect(preview?.metrics?.[1]?.value).toMatch(/3 kW/);
    forceChargeCmd?.execute(ctx);
    expect(ctx.actions.closePalette).toHaveBeenCalled();
  });

  it('formats battery stop-charge preview and closes palette on execute', () => {
    const ctx = mockContext({
      energy: { ...mockContext().energy, batteryPower: 2500 },
    });
    const preview = stopBatteryCmd?.preview?.(ctx);
    expect(preview?.titleKey).toBe('command.preview.stopBatteryCharge');
    expect(preview?.metrics?.[0]?.value).toMatch(/2,5 kW|2\.5 kW/);
    stopBatteryCmd?.execute(ctx);
    expect(ctx.actions.closePalette).toHaveBeenCalled();
  });

  it('hides battery force charge when SoC is already high', () => {
    const ctx = mockContext({
      energy: { ...mockContext().energy, batterySoC: 95, batteryPower: 0 },
    });
    expect(forceChargeCmd?.when?.(ctx)).toBe(false);
  });

  it('closes palette on stop execute and navigates on view execute', () => {
    const ctx = mockContext();
    stopCmd?.execute(ctx);
    expect(ctx.actions.closePalette).toHaveBeenCalled();
    viewCmd?.execute(ctx);
    expect(ctx.navigate).toHaveBeenCalledWith('/devices');
    expect(ctx.actions.closePalette).toHaveBeenCalledTimes(2);
  });
});
