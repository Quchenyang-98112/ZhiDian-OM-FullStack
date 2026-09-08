import { beforeEach, describe, expect, it } from 'vitest';
import type { Plugin } from '../core/plugin-system';
import { PluginManager } from '../core/plugin-system';

function createTestPlugin(overrides: Partial<Plugin['descriptor']> = {}): Plugin {
  return {
    descriptor: {
      id: overrides.id ?? 'test-plugin',
      name: overrides.name ?? 'Test Plugin',
      version: overrides.version ?? '1.0.0',
      description: overrides.description,
      dependencies: overrides.dependencies,
      provides: overrides.provides,
      requires: overrides.requires,
      category: overrides.category,
    },
    activate: overrides.provides
      ? (ctx) => {
          for (const svc of overrides.provides!) {
            ctx.registerService(svc, { active: true });
          }
        }
      : () => {},
    deactivate: () => {},
  };
}

describe('PluginManager', () => {
  let manager: PluginManager;

  beforeEach(() => {
    manager = new PluginManager();
  });

  describe('install', () => {
    it('should install a plugin', () => {
      const result = manager.install(createTestPlugin());
      expect(result.success).toBe(true);
    });

    it('should reject duplicate installation', () => {
      manager.install(createTestPlugin());
      const result = manager.install(createTestPlugin());
      expect(result.success).toBe(false);
      expect(result.error).toContain('already installed');
    });

    it('should reject invalid version', () => {
      const result = manager.install(createTestPlugin({ version: 'invalid' }));
      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid version');
    });

    it('should set state to installed', () => {
      manager.install(createTestPlugin());
      const entry = manager.getPlugin('test-plugin');
      expect(entry?.state).toBe('installed');
    });
  });

  describe('resolve', () => {
    it('should resolve a plugin without dependencies', () => {
      manager.install(createTestPlugin());
      const result = manager.resolve('test-plugin');
      expect(result.success).toBe(true);
    });

    it('should fail for nonexistent plugin', () => {
      const result = manager.resolve('nonexistent');
      expect(result.success).toBe(false);
    });

    it('should fail if dependency is missing', () => {
      manager.install(createTestPlugin({ id: 'child', dependencies: { parent: '^1.0.0' } }));
      const result = manager.resolve('child');
      expect(result.success).toBe(false);
      expect(result.error).toContain('Missing dependency');
    });

    it('should resolve with satisfied dependencies', () => {
      manager.install(createTestPlugin({ id: 'parent', version: '1.2.0' }));
      manager.resolve('parent');
      manager.install(createTestPlugin({ id: 'child', dependencies: { parent: '^1.0.0' } }));
      const result = manager.resolve('child');
      expect(result.success).toBe(true);
    });

    it('should fail if dependency version does not satisfy range', () => {
      manager.install(createTestPlugin({ id: 'parent', version: '2.0.0' }));
      manager.install(createTestPlugin({ id: 'child', dependencies: { parent: '^1.0.0' } }));
      const result = manager.resolve('child');
      expect(result.success).toBe(false);
      expect(result.error).toContain('does not satisfy');
    });
  });

  describe('start', () => {
    it('should start a resolved plugin', async () => {
      manager.install(createTestPlugin());
      manager.resolve('test-plugin');
      const result = await manager.start('test-plugin');
      expect(result.success).toBe(true);
      expect(manager.getPlugin('test-plugin')?.state).toBe('active');
    });

    it('should auto-resolve on start', async () => {
      manager.install(createTestPlugin());
      const result = await manager.start('test-plugin');
      expect(result.success).toBe(true);
    });

    it('should fail for nonexistent plugin', async () => {
      const result = await manager.start('nonexistent');
      expect(result.success).toBe(false);
    });
  });

  describe('stop', () => {
    it('should stop an active plugin', async () => {
      manager.install(createTestPlugin());
      await manager.start('test-plugin');
      const result = await manager.stop('test-plugin');
      expect(result.success).toBe(true);
      expect(manager.getPlugin('test-plugin')?.state).toBe('resolved');
    });

    it('should fail for non-active plugin', async () => {
      manager.install(createTestPlugin());
      const result = await manager.stop('test-plugin');
      expect(result.success).toBe(false);
      expect(result.error).toContain('not active');
    });
  });

  describe('uninstall', () => {
    it('should uninstall an installed plugin', async () => {
      manager.install(createTestPlugin());
      const result = await manager.uninstall('test-plugin');
      expect(result.success).toBe(true);
      expect(manager.getPlugin('test-plugin')).toBeUndefined();
    });

    it('should stop and uninstall an active plugin', async () => {
      manager.install(createTestPlugin());
      await manager.start('test-plugin');
      const result = await manager.uninstall('test-plugin');
      expect(result.success).toBe(true);
    });

    it('should fail if another active plugin depends on it', async () => {
      manager.install(createTestPlugin({ id: 'parent', version: '1.0.0' }));
      await manager.start('parent');
      manager.install(createTestPlugin({ id: 'child', dependencies: { parent: '^1.0.0' } }));
      await manager.start('child');
      const result = await manager.uninstall('parent');
      expect(result.success).toBe(false);
      expect(result.error).toContain('depends on');
    });
  });

  describe('list & services', () => {
    it('should list all plugins', () => {
      manager.install(createTestPlugin({ id: 'a' }));
      manager.install(createTestPlugin({ id: 'b' }));
      expect(manager.list().length).toBe(2);
    });

    it('should register services via plugin context', async () => {
      manager.install(createTestPlugin({ id: 'svc-provider', provides: ['energy-data'] }));
      await manager.start('svc-provider');
      expect(manager.listServices()).toContain('energy-data');
    });

    it('should expose event bus', () => {
      expect(manager.getEventBus()).toBeDefined();
    });
  });

  describe('startAll / stopAll', () => {
    it('should start all plugins', async () => {
      manager.install(createTestPlugin({ id: 'a' }));
      manager.install(createTestPlugin({ id: 'b' }));
      const results = await manager.startAll();
      expect(results.get('a')?.success).toBe(true);
      expect(results.get('b')?.success).toBe(true);
    });

    it('should stop all active plugins', async () => {
      manager.install(createTestPlugin({ id: 'a' }));
      manager.install(createTestPlugin({ id: 'b' }));
      await manager.startAll();
      await manager.stopAll();
      expect(manager.getPlugin('a')?.state).toBe('resolved');
      expect(manager.getPlugin('b')?.state).toBe('resolved');
    });
  });
});
