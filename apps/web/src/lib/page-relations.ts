// ─── Cross-Page Relationship & Navigation Map ──────────────────────────────
// Defines logical links between all pages for contextual navigation,
// setup requirements, and feature discovery.

import type { LucideIcon } from 'lucide-react';
import {
  Activity,
  BarChart3,
  Bell,
  Boxes,
  Brain,
  Coins,
  Cpu,
  Database,
  HelpCircle,
  Home,
  Key,
  LayoutDashboard,
  Network,
  Palette,
  Puzzle,
  Settings,
  Shield,
  Wrench,
  Zap,
} from 'lucide-react';

// ─── Route IDs ──────────────────────────────────────────────────────────────
export type PageId =
  | 'home'
  | 'energy-flow'
  | 'devices'
  | 'optimization-ai'
  | 'tariffs'
  | 'analytics'
  | 'monitoring'
  | 'settings'
  | 'ai-settings'
  | 'plugins'
  | 'help';

// ─── Settings Tab IDs ───────────────────────────────────────────────────────
export type SettingsTabId =
  | 'appearance'
  | 'system'
  | 'energy'
  | 'controllers'
  | 'security'
  | 'storage'
  | 'notifications'
  | 'advanced'
  | 'ai';

// ─── Page Metadata ──────────────────────────────────────────────────────────
export interface PageMeta {
  id: PageId;
  path: string;
  i18nKey: string; // nav.xxx key for the label
  icon: LucideIcon;
  group: 'energy' | 'tools' | 'system';
}

export const PAGE_REGISTRY: Record<PageId, PageMeta> = {
  home: { id: 'home', path: '/', i18nKey: 'nav.home', icon: Home, group: 'energy' },
  'energy-flow': {
    id: 'energy-flow',
    path: '/energy-flow',
    i18nKey: 'nav.energyFlow',
    icon: Zap,
    group: 'energy',
  },
  devices: {
    id: 'devices',
    path: '/devices',
    i18nKey: 'nav.devicesOverview',
    icon: Boxes,
    group: 'energy',
  },
  'optimization-ai': {
    id: 'optimization-ai',
    path: '/optimization-ai',
    i18nKey: 'nav.aiOptimizer',
    icon: Brain,
    group: 'tools',
  },
  tariffs: {
    id: 'tariffs',
    path: '/tariffs',
    i18nKey: 'nav.tariffs',
    icon: Coins,
    group: 'tools',
  },
  analytics: {
    id: 'analytics',
    path: '/analytics',
    i18nKey: 'nav.analytics',
    icon: BarChart3,
    group: 'tools',
  },
  monitoring: {
    id: 'monitoring',
    path: '/monitoring',
    i18nKey: 'nav.monitoring',
    icon: Activity,
    group: 'tools',
  },
  settings: {
    id: 'settings',
    path: '/settings',
    i18nKey: 'nav.settings',
    icon: Settings,
    group: 'system',
  },
  'ai-settings': {
    id: 'ai-settings',
    path: '/settings/ai',
    i18nKey: 'nav.aiKeys',
    icon: Key,
    group: 'system',
  },
  plugins: {
    id: 'plugins',
    path: '/plugins',
    i18nKey: 'nav.plugins',
    icon: Puzzle,
    group: 'tools',
  },
  help: { id: 'help', path: '/help', i18nKey: 'nav.help', icon: HelpCircle, group: 'system' },
};

// ─── Relationship Types ─────────────────────────────────────────────────────
export interface PageRelation {
  /** Related feature pages */
  related: PageId[];
  /** Quick actions: settings tabs, help tabs, or deep links */
  settingsLinks: { tab: SettingsTabId; i18nKey: string; icon: LucideIcon }[];
  /** Which help tab is most relevant */
  helpTab?: string;
  /** Setup requirements — which settings need to be configured */
  setupRequirements: {
    settingsTab: SettingsTabId;
    i18nKey: string;
    checkField?: string; // dot-path in StoredSettings to verify
  }[];
}

// ─── Cross-Reference Map ────────────────────────────────────────────────────
export const PAGE_RELATIONS: Record<PageId, PageRelation> = {
  home: {
    related: ['energy-flow', 'devices', 'analytics'],
    settingsLinks: [
      { tab: 'energy', i18nKey: 'crossLinks.configureSystem', icon: Settings },
      { tab: 'appearance', i18nKey: 'crossLinks.customizeTheme', icon: Palette },
    ],
    helpTab: 'getting-started',
    setupRequirements: [
      { settingsTab: 'system', i18nKey: 'crossLinks.setupGateway', checkField: 'victronIp' },
      { settingsTab: 'energy', i18nKey: 'crossLinks.setupEnergy', checkField: 'systemConfig' },
    ],
  },
  'energy-flow': {
    related: ['devices', 'analytics', 'tariffs'],
    settingsLinks: [{ tab: 'energy', i18nKey: 'crossLinks.configureSystem', icon: Settings }],
    helpTab: 'features',
    setupRequirements: [
      { settingsTab: 'energy', i18nKey: 'crossLinks.setupEnergy', checkField: 'systemConfig' },
    ],
  },
  devices: {
    related: ['energy-flow', 'optimization-ai', 'monitoring', 'tariffs'],
    settingsLinks: [
      { tab: 'energy', i18nKey: 'crossLinks.configureSystem', icon: Settings },
      { tab: 'system', i18nKey: 'crossLinks.configureKNX', icon: Network },
    ],
    helpTab: 'features',
    setupRequirements: [
      { settingsTab: 'energy', i18nKey: 'crossLinks.setupEnergy', checkField: 'systemConfig' },
      { settingsTab: 'system', i18nKey: 'crossLinks.setupGateway', checkField: 'victronIp' },
    ],
  },
  'optimization-ai': {
    related: ['tariffs', 'energy-flow', 'devices', 'analytics'],
    settingsLinks: [{ tab: 'ai', i18nKey: 'crossLinks.configureAI', icon: Key }],
    helpTab: 'features',
    setupRequirements: [
      { settingsTab: 'ai', i18nKey: 'crossLinks.setupAIKeys' },
      { settingsTab: 'energy', i18nKey: 'crossLinks.setupEnergy', checkField: 'systemConfig' },
    ],
  },
  tariffs: {
    related: ['devices', 'optimization-ai', 'analytics'],
    settingsLinks: [
      { tab: 'energy', i18nKey: 'crossLinks.configureTariff', icon: Coins },
      { tab: 'notifications', i18nKey: 'crossLinks.configurePriceAlerts', icon: Bell },
    ],
    helpTab: 'features',
    setupRequirements: [
      {
        settingsTab: 'energy',
        i18nKey: 'crossLinks.setupTariff',
        checkField: 'tariffProvider',
      },
    ],
  },
  analytics: {
    related: ['energy-flow', 'tariffs', 'monitoring'],
    settingsLinks: [{ tab: 'storage', i18nKey: 'crossLinks.configureStorage', icon: Database }],
    helpTab: 'features',
    setupRequirements: [
      {
        settingsTab: 'storage',
        i18nKey: 'crossLinks.setupStorage',
        checkField: 'influxUrl',
      },
    ],
  },
  monitoring: {
    related: ['settings', 'analytics', 'help'],
    settingsLinks: [
      { tab: 'system', i18nKey: 'crossLinks.configureAdapters', icon: Network },
      { tab: 'advanced', i18nKey: 'crossLinks.configureDebug', icon: Wrench },
    ],
    helpTab: 'troubleshooting',
    setupRequirements: [
      { settingsTab: 'system', i18nKey: 'crossLinks.setupGateway', checkField: 'victronIp' },
    ],
  },
  settings: {
    related: ['monitoring', 'help'],
    settingsLinks: [],
    helpTab: 'getting-started',
    setupRequirements: [],
  },
  'ai-settings': {
    related: ['optimization-ai', 'settings'],
    settingsLinks: [],
    helpTab: 'features',
    setupRequirements: [],
  },
  plugins: {
    related: ['devices', 'monitoring'],
    settingsLinks: [{ tab: 'advanced', i18nKey: 'crossLinks.configureDebug', icon: Wrench }],
    helpTab: 'integration',
    setupRequirements: [],
  },
  help: {
    related: ['settings', 'monitoring'],
    settingsLinks: [],
    setupRequirements: [],
  },
};

// ─── Settings Tab Metadata ──────────────────────────────────────────────────
export interface SettingsTabMeta {
  id: SettingsTabId;
  i18nKey: string;
  icon: LucideIcon;
  /** Feature pages that depend on this settings tab */
  relatedPages: PageId[];
}

export const SETTINGS_TABS: Record<SettingsTabId, SettingsTabMeta> = {
  appearance: {
    id: 'appearance',
    i18nKey: 'settings.appearance',
    icon: Palette,
    relatedPages: ['home'],
  },
  system: {
    id: 'system',
    i18nKey: 'settings.system',
    icon: Network,
    relatedPages: ['monitoring', 'devices', 'energy-flow'],
  },
  energy: {
    id: 'energy',
    i18nKey: 'settings.energy',
    icon: Zap,
    relatedPages: ['energy-flow', 'devices'],
  },
  controllers: {
    id: 'controllers',
    i18nKey: 'settings.controllersTab',
    icon: Cpu,
    relatedPages: ['devices', 'plugins'],
  },
  security: {
    id: 'security',
    i18nKey: 'settings.security',
    icon: Shield,
    relatedPages: ['monitoring'],
  },
  storage: {
    id: 'storage',
    i18nKey: 'settings.storageShort',
    icon: Database,
    relatedPages: ['analytics'],
  },
  notifications: {
    id: 'notifications',
    i18nKey: 'settings.notifications',
    icon: Bell,
    relatedPages: ['tariffs', 'devices', 'monitoring'],
  },
  advanced: {
    id: 'advanced',
    i18nKey: 'settings.advanced',
    icon: Wrench,
    relatedPages: ['monitoring', 'devices', 'plugins'],
  },
  ai: {
    id: 'ai',
    i18nKey: 'settings.aiTab',
    icon: Brain,
    relatedPages: ['optimization-ai', 'ai-settings'],
  },
};

// ─── Setup Progress Helpers ─────────────────────────────────────────────────
export interface SetupStep {
  id: string;
  i18nKey: string;
  settingsTab: SettingsTabId;
  icon: LucideIcon;
  checkFn: (settings: Record<string, unknown>) => boolean;
}

export const SETUP_STEPS: SetupStep[] = [
  {
    id: 'gateway',
    i18nKey: 'crossLinks.stepGateway',
    settingsTab: 'system',
    icon: Network,
    checkFn: (s) => !!(s.victronIp && s.victronIp !== '192.168.1.100'),
  },
  {
    id: 'energy-system',
    i18nKey: 'crossLinks.stepEnergySystem',
    settingsTab: 'energy',
    icon: Zap,
    checkFn: (s) => {
      const sc = s.systemConfig as Record<string, unknown> | undefined;
      return !!(sc?.presetId && sc.presetId !== 'custom-preset');
    },
  },
  {
    id: 'tariff',
    i18nKey: 'crossLinks.stepTariff',
    settingsTab: 'energy',
    icon: Coins,
    checkFn: (s) => s.tariffProvider !== 'none',
  },
  {
    id: 'knx',
    i18nKey: 'crossLinks.stepKNX',
    settingsTab: 'system',
    icon: LayoutDashboard,
    checkFn: (s) => !!(s.knxIp && s.knxIp !== '192.168.1.101'),
  },
  {
    id: 'notifications',
    i18nKey: 'crossLinks.stepNotifications',
    settingsTab: 'notifications',
    icon: Bell,
    checkFn: (s) => !!(s.pushNotifications || s.priceAlerts || s.batteryAlerts),
  },
  {
    id: 'ai-provider',
    i18nKey: 'crossLinks.stepAIProvider',
    settingsTab: 'ai',
    icon: Brain,
    checkFn: () => true, // AI keys are in Dexie, always show as optional
  },
  {
    id: 'data-storage',
    i18nKey: 'crossLinks.stepDataStorage',
    settingsTab: 'storage',
    icon: Database,
    checkFn: (s) => !!(s.influxUrl && s.influxUrl !== ''),
  },
  {
    id: 'security',
    i18nKey: 'crossLinks.stepSecurity',
    settingsTab: 'security',
    icon: Shield,
    checkFn: (s) => !!s.mtls,
  },
];
