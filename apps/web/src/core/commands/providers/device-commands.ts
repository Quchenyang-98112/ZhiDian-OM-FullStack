import { Battery, BatteryCharging, CarFront, Zap } from 'lucide-react';
import { BATTERY_FORCE_CHARGE_W } from '../../../lib/battery-control';
import { formatPower } from '../../../lib/format';
import { BATTERY_CHARGING_POWER_W, EV_ACTIVE_POWER_W } from '../device-command-thresholds';
import type { CommandDefinition } from '../types';
import { navigateAndClose } from './provider-utils';

export function createDeviceCommands(): CommandDefinition[] {
  return [
    {
      id: 'device.startEvCharging',
      labelKey: 'command.startEvCharging',
      descriptionKey: 'command.startEvChargingDesc',
      icon: CarFront,
      category: 'device',
      risk: 'moderate',
      blockedInReadOnly: true,
      keywords: ['ev', 'wallbox', 'start', 'laden', 'charging'],
      source: 'core',
      when: (ctx) => ctx.energy.evPower < EV_ACTIVE_POWER_W,
      preview: () => ({
        titleKey: 'command.preview.startCharging',
        impactKey: 'command.preview.startChargingImpact',
      }),
      hardwareCommand: { type: 'START_CHARGING', value: true },
      execute: (ctx) => {
        ctx.actions.closePalette();
      },
    },
    {
      id: 'device.stopEvCharging',
      labelKey: 'command.stopEvCharging',
      descriptionKey: 'command.stopEvChargingDesc',
      icon: CarFront,
      category: 'device',
      risk: 'danger',
      blockedInReadOnly: true,
      keywords: ['ev', 'wallbox', 'stop', 'laden', 'charging'],
      source: 'core',
      when: (ctx) => ctx.energy.evPower >= EV_ACTIVE_POWER_W,
      preview: (ctx) => ({
        titleKey: 'command.preview.stopCharging',
        metrics: [
          {
            labelKey: 'command.preview.evPower',
            value: formatPower(ctx.energy.evPower, ctx.locale),
          },
        ],
        impactKey: 'command.preview.stopChargingImpact',
      }),
      hardwareCommand: { type: 'STOP_CHARGING', value: true },
      execute: (ctx) => {
        ctx.actions.closePalette();
      },
    },
    {
      id: 'device.viewEvCharging',
      labelKey: 'command.viewEvCharging',
      icon: Zap,
      category: 'device',
      risk: 'safe',
      keywords: ['ev', 'wallbox', 'ocpp', 'laden'],
      source: 'core',
      when: (ctx) => ctx.energy.evPower >= EV_ACTIVE_POWER_W,
      execute: (ctx) => navigateAndClose(ctx, '/devices'),
    },
    {
      id: 'device.batteryForceCharge',
      labelKey: 'command.batteryForceCharge',
      descriptionKey: 'command.batteryForceChargeDesc',
      icon: BatteryCharging,
      category: 'device',
      risk: 'moderate',
      blockedInReadOnly: true,
      keywords: ['battery', 'charge', 'speicher', 'laden', 'force'],
      source: 'core',
      when: (ctx) =>
        ctx.energy.batterySoC < 90 && ctx.energy.batteryPower < BATTERY_CHARGING_POWER_W,
      preview: (ctx) => ({
        titleKey: 'command.preview.forceCharge',
        metrics: [
          {
            labelKey: 'command.preview.soc',
            value: `${ctx.energy.batterySoC.toFixed(0)}%`,
          },
          {
            labelKey: 'command.preview.chargePower',
            value: formatPower(BATTERY_FORCE_CHARGE_W, ctx.locale),
          },
        ],
        impactKey: 'command.preview.forceChargeImpact',
      }),
      hardwareCommand: { type: 'SET_BATTERY_POWER', value: BATTERY_FORCE_CHARGE_W },
      execute: (ctx) => {
        ctx.actions.closePalette();
      },
    },
    {
      id: 'device.batteryStopCharge',
      labelKey: 'command.batteryStopCharge',
      descriptionKey: 'command.batteryStopChargeDesc',
      icon: Battery,
      category: 'device',
      risk: 'moderate',
      blockedInReadOnly: true,
      keywords: ['battery', 'stop', 'speicher', 'auto', 'idle'],
      source: 'core',
      when: (ctx) => ctx.energy.batteryPower >= BATTERY_CHARGING_POWER_W,
      preview: (ctx) => ({
        titleKey: 'command.preview.stopBatteryCharge',
        metrics: [
          {
            labelKey: 'command.preview.batteryPower',
            value: formatPower(ctx.energy.batteryPower, ctx.locale),
          },
        ],
        impactKey: 'command.preview.stopBatteryChargeImpact',
      }),
      hardwareCommand: { type: 'SET_BATTERY_POWER', value: 0 },
      execute: (ctx) => {
        ctx.actions.closePalette();
      },
    },
  ];
}
