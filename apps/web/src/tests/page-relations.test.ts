import { describe, expect, it } from 'vitest';
import {
  PAGE_REGISTRY,
  PAGE_RELATIONS,
  type PageId,
  type SettingsTabId,
} from '../lib/page-relations';

const ALL_PAGE_IDS: PageId[] = [
  'home',
  'energy-flow',
  'devices',
  'optimization-ai',
  'tariffs',
  'analytics',
  'monitoring',
  'settings',
  'ai-settings',
  'plugins',
  'help',
];

const VALID_GROUPS = ['energy', 'tools', 'system'];

const VALID_SETTINGS_TABS: SettingsTabId[] = [
  'appearance',
  'system',
  'energy',
  'controllers',
  'security',
  'storage',
  'notifications',
  'advanced',
  'ai',
];

describe('PAGE_REGISTRY', () => {
  it('should define all 11 pages', () => {
    const ids = Object.keys(PAGE_REGISTRY);
    expect(ids).toHaveLength(11);
    for (const id of ALL_PAGE_IDS) {
      expect(PAGE_REGISTRY[id]).toBeDefined();
    }
  });

  it('should have unique paths', () => {
    const paths = Object.values(PAGE_REGISTRY).map((p) => p.path);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it('should have valid groups', () => {
    for (const page of Object.values(PAGE_REGISTRY)) {
      expect(VALID_GROUPS).toContain(page.group);
    }
  });

  it('should have i18n keys for all pages', () => {
    for (const page of Object.values(PAGE_REGISTRY)) {
      expect(page.i18nKey).toMatch(/^nav\./);
    }
  });

  it('should have icon components', () => {
    for (const page of Object.values(PAGE_REGISTRY)) {
      // Lucide icons are either functions or forwardRef objects
      expect(['function', 'object']).toContain(typeof page.icon);
      expect(page.icon).toBeTruthy();
    }
  });

  it('home should be at root path', () => {
    expect(PAGE_REGISTRY.home.path).toBe('/');
  });

  it('settings/ai should be a sub-route', () => {
    expect(PAGE_REGISTRY['ai-settings'].path).toBe('/settings/ai');
  });
});

describe('PAGE_RELATIONS', () => {
  it('should define relations for all pages', () => {
    for (const id of ALL_PAGE_IDS) {
      expect(PAGE_RELATIONS[id]).toBeDefined();
    }
  });

  it('should only reference valid page IDs in related arrays', () => {
    for (const [pageId, relation] of Object.entries(PAGE_RELATIONS)) {
      for (const relatedId of relation.related) {
        expect(ALL_PAGE_IDS).toContain(relatedId);
        // Should not reference itself
        expect(relatedId).not.toBe(pageId);
      }
    }
  });

  it('should only reference valid settings tabs', () => {
    for (const relation of Object.values(PAGE_RELATIONS)) {
      for (const link of relation.settingsLinks) {
        expect(VALID_SETTINGS_TABS).toContain(link.tab);
      }
      for (const req of relation.setupRequirements) {
        expect(VALID_SETTINGS_TABS).toContain(req.settingsTab);
      }
    }
  });

  it('settings links should have i18n keys and icons', () => {
    for (const relation of Object.values(PAGE_RELATIONS)) {
      for (const link of relation.settingsLinks) {
        expect(link.i18nKey).toMatch(/^crossLinks\./);
        expect(['function', 'object']).toContain(typeof link.icon);
      }
    }
  });

  it('home should relate to energy-flow and devices', () => {
    expect(PAGE_RELATIONS.home.related).toContain('energy-flow');
    expect(PAGE_RELATIONS.home.related).toContain('devices');
  });

  it('energy pages should have setup requirements', () => {
    const energyPages: PageId[] = ['home', 'energy-flow', 'devices'];
    for (const id of energyPages) {
      expect(PAGE_RELATIONS[id].setupRequirements.length).toBeGreaterThan(0);
    }
  });
});

describe('SETUP_STEPS', () => {
  it('evaluates setup completion checks against representative settings', async () => {
    const { SETUP_STEPS } = await import('../lib/page-relations');

    const incomplete = {
      victronIp: '192.168.1.100',
      knxIp: '192.168.1.101',
      tariffProvider: 'none',
      pushNotifications: false,
      priceAlerts: false,
      batteryAlerts: false,
      influxUrl: '',
      mtls: false,
      systemConfig: { presetId: 'custom-preset' },
    };

    expect(SETUP_STEPS.find((step) => step.id === 'gateway')?.checkFn(incomplete)).toBe(false);
    expect(SETUP_STEPS.find((step) => step.id === 'tariff')?.checkFn(incomplete)).toBe(false);
    expect(SETUP_STEPS.find((step) => step.id === 'security')?.checkFn(incomplete)).toBe(false);
    expect(SETUP_STEPS.find((step) => step.id === 'ai-provider')?.checkFn(incomplete)).toBe(true);

    const complete = {
      victronIp: '10.0.0.20',
      knxIp: '10.0.0.30',
      tariffProvider: 'awattar',
      pushNotifications: true,
      influxUrl: 'http://influx.local:8086',
      mtls: true,
      systemConfig: { presetId: 'family-home' },
    };

    expect(SETUP_STEPS.find((step) => step.id === 'gateway')?.checkFn(complete)).toBe(true);
    expect(SETUP_STEPS.find((step) => step.id === 'energy-system')?.checkFn(complete)).toBe(true);
    expect(SETUP_STEPS.find((step) => step.id === 'tariff')?.checkFn(complete)).toBe(true);
    expect(SETUP_STEPS.find((step) => step.id === 'knx')?.checkFn(complete)).toBe(true);
    expect(SETUP_STEPS.find((step) => step.id === 'notifications')?.checkFn(complete)).toBe(true);
    expect(SETUP_STEPS.find((step) => step.id === 'data-storage')?.checkFn(complete)).toBe(true);
    expect(SETUP_STEPS.find((step) => step.id === 'security')?.checkFn(complete)).toBe(true);
  });
});
