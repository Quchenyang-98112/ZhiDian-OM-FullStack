import {
  Activity,
  BarChart3,
  Car,
  Cpu,
  FileDown,
  HelpCircle,
  Home,
  Monitor,
  Puzzle,
  Settings,
  Sparkles,
  TrendingUp,
} from 'lucide-react';
import type { CommandDefinition } from '../types';
import { navigateAndClose } from './provider-utils';

function nav(
  id: string,
  labelKey: string,
  path: string,
  icon: NonNullable<CommandDefinition['icon']>,
  keywords: string[],
): CommandDefinition {
  return {
    id,
    labelKey,
    icon,
    category: 'navigation',
    risk: 'safe',
    keywords,
    source: 'core',
    execute: (ctx) => navigateAndClose(ctx, path),
  };
}

export function createNavigationCommands(): CommandDefinition[] {
  return [
    {
      id: 'optimize',
      labelKey: 'ai.optimizeNow',
      icon: Sparkles,
      category: 'action',
      risk: 'safe',
      keywords: ['ai', 'optimize', 'energy', 'ki', 'mpc'],
      source: 'core',
      execute: (ctx) => {
        if (ctx.actions.onOptimize) {
          ctx.actions.onOptimize();
        } else {
          ctx.navigate('/optimization-ai');
        }
        ctx.actions.closePalette();
      },
    },
    {
      id: 'export-report',
      labelKey: 'command.exportReport',
      icon: FileDown,
      category: 'action',
      risk: 'safe',
      keywords: ['pdf', 'report', 'export', 'download', 'bericht'],
      source: 'core',
      execute: (ctx) => {
        if (ctx.actions.onExportReport) {
          ctx.actions.onExportReport();
        } else {
          ctx.navigate('/analytics');
        }
        ctx.actions.closePalette();
      },
    },
    nav('nav-dashboard', 'nav.home', '/', Home, ['home', 'start', 'overview', 'übersicht']),
    nav('nav-energy-flow', 'nav.energyFlow', '/energy-flow', Activity, [
      'sankey',
      'flow',
      'energiefluss',
    ]),
    nav('nav-devices', 'nav.devicesOverview', '/devices', Car, [
      'wallbox',
      'car',
      'ev',
      'floorplan',
      'knx',
      'hardware',
      'geräte',
    ]),
    nav('nav-ai', 'nav.aiOptimizer', '/optimization-ai', Sparkles, ['ai', 'optimize', 'ki', 'mpc']),
    nav('nav-ai-settings', 'command.aiSettings', '/settings/ai', Sparkles, [
      'api',
      'key',
      'provider',
      'byok',
      'schlüssel',
    ]),
    nav('nav-tariffs', 'nav.tariffs', '/tariffs', TrendingUp, [
      'price',
      'tibber',
      'awattar',
      'tarif',
      'preis',
    ]),
    nav('nav-analytics', 'nav.analytics', '/analytics', BarChart3, [
      'report',
      'chart',
      'bericht',
      'analyse',
    ]),
    nav('nav-monitoring', 'nav.monitoring', '/monitoring', Monitor, [
      'health',
      'status',
      'adapter',
      'gesundheit',
    ]),
    nav('nav-settings', 'nav.settings', '/settings', Settings, [
      'config',
      'options',
      'einstellungen',
    ]),
    nav('nav-hardware', 'nav.hardware', '/settings/hardware', Cpu, [
      'hardware',
      'registry',
      'catalog',
      'device',
      'inverter',
      'geräte',
      'katalog',
    ]),
    nav('nav-plugins', 'nav.plugins', '/plugins', Puzzle, [
      'plugin',
      'adapter',
      'extension',
      'marketplace',
      'erweiterung',
    ]),
    nav('nav-help', 'nav.help', '/help', HelpCircle, ['docs', 'documentation', 'support', 'hilfe']),
    nav('nav-settings-adapters', 'command.navAdapterSettings', '/settings?tab=adapters', Settings, [
      'victron',
      'modbus',
      'mqtt',
      'adapter',
      'konfiguration',
    ]),
    nav(
      'nav-settings-controllers',
      'command.navControllers',
      '/settings?tab=controllers',
      Settings,
      ['controller', 'regler', 'sg-ready'],
    ),
    nav('nav-settings-security', 'command.navSecurity', '/settings?tab=security', Settings, [
      'security',
      'auth',
      'jwt',
      'sicherheit',
    ]),
    nav('nav-settings-appearance', 'command.navAppearance', '/settings?tab=appearance', Settings, [
      'theme',
      'appearance',
      'design',
      'darstellung',
    ]),
  ];
}
