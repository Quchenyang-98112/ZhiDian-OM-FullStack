import { Globe, SunMoon } from 'lucide-react';
import { type ThemeName, themeOrder } from '../../../design-tokens';
import { useAppStore } from '../../../store';
import type { LocaleCode } from '../../../types';
import type { CommandDefinition } from '../types';

export function createSettingsCommands(): CommandDefinition[] {
  return [
    {
      id: 'settings.toggleTheme',
      labelKey: 'command.toggleTheme',
      icon: SunMoon,
      category: 'settings',
      risk: 'safe',
      keywords: ['theme', 'dark', 'light', 'design', 'darstellung'],
      source: 'core',
      execute: (ctx) => {
        const currentIdx = themeOrder.indexOf(ctx.theme);
        const next: ThemeName = themeOrder[(currentIdx + 1) % themeOrder.length] ?? 'ocean-dark';
        useAppStore.getState().setTheme(next);
        ctx.actions.closePalette();
      },
    },
    {
      id: 'settings.toggleLocale',
      labelKey: 'command.toggleLocale',
      icon: Globe,
      category: 'settings',
      risk: 'safe',
      keywords: ['language', 'locale', 'deutsch', 'english', 'sprache'],
      source: 'core',
      execute: (ctx) => {
        const next: LocaleCode = ctx.locale === 'zh' ? 'en' : ctx.locale === 'en' ? 'de' : 'zh';
        useAppStore.getState().setLocale(next);
        ctx.actions.closePalette();
      },
    },
  ];
}
