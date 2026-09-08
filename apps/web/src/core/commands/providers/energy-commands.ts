import { Battery, Sparkles, TrendingUp, Zap } from 'lucide-react';
import type { CommandDefinition } from '../types';
import { navigateAndClose } from './provider-utils';

export function createEnergyCommands(): CommandDefinition[] {
  return [
    {
      id: 'energy.optimizeSurplus',
      labelKey: 'command.optimizeSurplus',
      descriptionKey: 'command.optimizeSurplusDesc',
      icon: Sparkles,
      category: 'energy',
      risk: 'moderate',
      keywords: ['surplus', 'pv', 'überschuss', 'optimize'],
      source: 'core',
      when: (ctx) => ctx.energy.pvPower > ctx.energy.houseLoad * 1.2 && ctx.energy.pvPower > 0.5,
      preview: (ctx) => ({
        titleKey: 'command.preview.surplus',
        metrics: [
          { labelKey: 'command.preview.pvPower', value: `${ctx.energy.pvPower.toFixed(1)} kW` },
          { labelKey: 'command.preview.load', value: `${ctx.energy.houseLoad.toFixed(1)} kW` },
        ],
      }),
      execute: (ctx) => navigateAndClose(ctx, '/optimization-ai'),
    },
    {
      id: 'energy.viewBattery',
      labelKey: 'command.viewBattery',
      descriptionKey: 'command.viewBatteryDesc',
      icon: Battery,
      category: 'energy',
      risk: 'safe',
      keywords: ['battery', 'soc', 'speicher', 'batterie'],
      source: 'core',
      when: (ctx) => ctx.energy.batterySoC < 20,
      preview: (ctx) => ({
        titleKey: 'command.preview.lowBattery',
        metrics: [
          { labelKey: 'command.preview.soc', value: `${ctx.energy.batterySoC.toFixed(0)}%` },
        ],
      }),
      execute: (ctx) => navigateAndClose(ctx, '/energy-flow'),
    },
    {
      id: 'energy.viewTariffs',
      labelKey: 'command.viewTariffs',
      descriptionKey: 'command.viewTariffsDesc',
      icon: TrendingUp,
      category: 'energy',
      risk: 'safe',
      keywords: ['tariff', 'price', 'teuer', 'preis', 'strompreis'],
      source: 'core',
      when: (ctx) => ctx.energy.priceCurrent > ctx.chargeThreshold,
      preview: (ctx) => ({
        titleKey: 'command.preview.highPrice',
        metrics: [
          {
            labelKey: 'command.preview.currentPrice',
            value: `${ctx.energy.priceCurrent.toFixed(3)} €/kWh`,
          },
        ],
      }),
      execute: (ctx) => navigateAndClose(ctx, '/tariffs'),
    },
    {
      id: 'energy.viewGrid',
      labelKey: 'command.viewGrid',
      icon: Zap,
      category: 'energy',
      risk: 'safe',
      keywords: ['grid', 'import', 'export', 'netz', 'netzbezug'],
      source: 'core',
      preview: (ctx) => ({
        titleKey: 'command.preview.gridFlow',
        metrics: [
          { labelKey: 'command.preview.gridPower', value: `${ctx.energy.gridPower.toFixed(1)} kW` },
        ],
      }),
      execute: (ctx) => navigateAndClose(ctx, '/energy-flow'),
    },
  ];
}
