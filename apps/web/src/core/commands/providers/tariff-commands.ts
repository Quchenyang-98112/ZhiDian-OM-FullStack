import { Ban, type LucideIcon, TrendingUp, Zap } from 'lucide-react';
import { useAppStore } from '../../../store';
import type { TariffProvider } from '../../../types';
import type { CommandDefinition } from '../types';

const TARIFF_OPTIONS: {
  id: string;
  provider: TariffProvider;
  labelKey: string;
  descriptionKey: string;
  icon: LucideIcon;
}[] = [
  {
    id: 'settings.tariff.tibber',
    provider: 'tibber',
    labelKey: 'command.tariffUseTibber',
    descriptionKey: 'command.tariffUseTibberDesc',
    icon: Zap,
  },
  {
    id: 'settings.tariff.awattar',
    provider: 'awattar',
    labelKey: 'command.tariffUseAwattar',
    descriptionKey: 'command.tariffUseAwattarDesc',
    icon: TrendingUp,
  },
  {
    id: 'settings.tariff.octopus',
    provider: 'octopus',
    labelKey: 'command.tariffUseOctopus',
    descriptionKey: 'command.tariffUseOctopusDesc',
    icon: TrendingUp,
  },
  {
    id: 'settings.tariff.none',
    provider: 'none',
    labelKey: 'command.tariffUseNone',
    descriptionKey: 'command.tariffUseNoneDesc',
    icon: Ban,
  },
];

export function createTariffCommands(): CommandDefinition[] {
  return TARIFF_OPTIONS.map((option) => ({
    id: option.id,
    labelKey: option.labelKey,
    descriptionKey: option.descriptionKey,
    icon: option.icon,
    category: 'settings' as const,
    risk: 'safe' as const,
    keywords: ['tariff', 'price', 'provider', 'tarif', 'strompreis', option.provider],
    source: 'core' as const,
    when: (ctx) => ctx.tariffProvider !== option.provider,
    execute: (ctx) => {
      useAppStore.getState().updateSettings({ tariffProvider: option.provider });
      ctx.actions.closePalette();
    },
  }));
}
