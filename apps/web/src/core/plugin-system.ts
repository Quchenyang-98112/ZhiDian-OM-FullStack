/**
 * Plugin System — OSGi-Inspired Granular Lifecycle Management
 *
 * Provides a plugin framework inspired by OpenEMS's OSGi architecture,
 * adapted for the browser environment:
 *
 *   1. Plugin Lifecycle — install → resolve → start → stop → uninstall
 *   2. Dependency Injection — plugins declare dependencies, system resolves them
 *   3. Service Registry — plugins expose services for other plugins to consume
 *   4. Event Bus — inter-plugin communication via typed events
 *   5. Versioning — semver-compatible version matching
 *   6. Hot-Reload — plugins can be started/stopped without page refresh
 *
 * Reference: OpenEMS OSGi bundle lifecycle + Eclipse Equinox patterns
 */

// ─── Types ──────────────────────────────────────────────────────────

export type PluginState =
  | 'installed'
  | 'resolved'
  | 'starting'
  | 'active'
  | 'stopping'
  | 'uninstalled';

export interface PluginDescriptor {
  /** Unique plugin identifier (kebab-case) */
  id: string;
  /** Human-readable name */
  name: string;
  /** Semantic version (e.g. "1.2.3") */
  version: string;
  /** Short description */
  description?: string | undefined;
  /** Author/maintainer */
  author?: string | undefined;
  /** Required dependencies (plugin id → semver range) */
  dependencies?: Record<string, string> | undefined;
  /** Services this plugin provides */
  provides?: string[] | undefined;
  /** Services this plugin requires */
  requires?: string[] | undefined;
  /** Category for grouping */
  category?: 'adapter' | 'controller' | 'analytics' | 'ui' | 'integration' | undefined;
}

export interface PluginContext {
  /** Get a service by name from the service registry */
  getService<T>(name: string): T | undefined;
  /** Register a service in the service registry */
  registerService<T>(name: string, service: T): void;
  /** Emit an event on the plugin event bus */
  emit(event: string, data?: unknown): void;
  /** Subscribe to an event on the plugin event bus */
  on(event: string, handler: (data: unknown) => void): () => void;
  /** Get plugin configuration */
  getConfig<T>(key: string): T | undefined;
  /** Set plugin configuration */
  setConfig(key: string, value: unknown): void;
  /** Log message scoped to plugin */
  log(level: 'debug' | 'info' | 'warn' | 'error', message: string): void;
}

export interface Plugin {
  /** Plugin descriptor (metadata) */
  descriptor: PluginDescriptor;
  /** Called when plugin is activated */
  activate(context: PluginContext): Promise<void> | void;
  /** Called when plugin is deactivated */
  deactivate?(): Promise<void> | void;
  /** Called on configuration change */
  onConfigChange?(key: string, value: unknown): void;
}

// ─── Event Bus ──────────────────────────────────────────────────────

type EventHandler = (data: unknown) => void;

function sanitizeLogToken(value: string): string {
  return value.replace(/[^A-Za-z0-9._:-]/g, '_').slice(0, 64);
}

function sanitizeLogMessage(value: string): string {
  return value.replace(/[\r\n\t]/g, ' ').slice(0, 500);
}

class PluginEventBus {
  private handlers = new Map<string, Set<EventHandler>>();

  on(event: string, handler: EventHandler): () => void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }
    this.handlers.get(event)!.add(handler);
    return () => this.handlers.get(event)?.delete(handler);
  }

  emit(event: string, data?: unknown): void {
    const handlers = this.handlers.get(event);
    if (handlers) {
      for (const handler of handlers) {
        try {
          handler(data);
        } catch (e) {
          const safeEvent = sanitizeLogToken(event);
          console.error(`[PluginEventBus] Handler error for "${safeEvent}": ${String(e)}`);
        }
      }
    }
  }

  clear(): void {
    this.handlers.clear();
  }
}

// ─── Service Registry ────────────────────────────────────────────────

class ServiceRegistry {
  private services = new Map<string, unknown>();

  register<T>(name: string, service: T): void {
    this.services.set(name, service);
  }

  get<T>(name: string): T | undefined {
    return this.services.get(name) as T | undefined;
  }

  has(name: string): boolean {
    return this.services.has(name);
  }

  unregister(name: string): void {
    this.services.delete(name);
  }

  list(): string[] {
    return Array.from(this.services.keys());
  }
}

// ─── Semver Utilities ───────────────────────────────────────────────

function parseSemver(version: string): [number, number, number] | null {
  const match = version.match(/^(\d+)(?:\.(\d+))?(?:\.(\d+))?/);
  if (!match) return null;
  return [parseInt(match[1], 10), parseInt(match[2] ?? '0', 10), parseInt(match[3] ?? '0', 10)];
}

function satisfiesSemver(version: string, range: string): boolean {
  const v = parseSemver(version);
  if (!v) return false;

  // Support: ^1.2.3, ~1.2.3, >=1.2.3, exact
  if (range.startsWith('^')) {
    const r = parseSemver(range.slice(1));
    if (!r) return false;
    // ^major.minor.patch: major must match, version >= range
    return v[0] === r[0] && (v[1] > r[1] || (v[1] === r[1] && v[2] >= r[2]));
  }
  if (range.startsWith('~')) {
    const r = parseSemver(range.slice(1));
    if (!r) return false;
    // ~major.minor.patch: major.minor must match, patch >= range
    return v[0] === r[0] && v[1] === r[1] && v[2] >= r[2];
  }
  if (range.startsWith('>=')) {
    const r = parseSemver(range.slice(2));
    if (!r) return false;
    return v[0] > r[0] || (v[0] === r[0] && (v[1] > r[1] || (v[1] === r[1] && v[2] >= r[2])));
  }
  // Exact match
  const r = parseSemver(range);
  if (!r) return false;
  return v[0] === r[0] && v[1] === r[1] && v[2] === r[2];
}

// ─── Plugin Manager ─────────────────────────────────────────────────

export interface PluginEntry {
  plugin: Plugin;
  state: PluginState;
  installedAt: number;
  activatedAt?: number;
  error?: string;
}

export class PluginManager {
  private plugins = new Map<string, PluginEntry>();
  private eventBus = new PluginEventBus();
  private serviceRegistry = new ServiceRegistry();
  private configs = new Map<string, Record<string, unknown>>();

  /** Install a plugin */
  install(plugin: Plugin): { success: boolean; error?: string } {
    const { id, version } = plugin.descriptor;

    if (this.plugins.has(id)) {
      return { success: false, error: `Plugin "${id}" is already installed` };
    }

    // Validate version format
    if (!parseSemver(version)) {
      return { success: false, error: `Invalid version format: ${version}` };
    }

    this.plugins.set(id, {
      plugin,
      state: 'installed',
      installedAt: Date.now(),
    });

    this.eventBus.emit('plugin:installed', { id, version });
    return { success: true };
  }

  /** Resolve dependencies for a plugin */
  resolve(id: string): { success: boolean; error?: string } {
    const entry = this.plugins.get(id);
    if (!entry) return { success: false, error: `Plugin "${id}" not found` };
    if (entry.state !== 'installed')
      return { success: false, error: `Plugin "${id}" is in state ${entry.state}` };

    const deps = entry.plugin.descriptor.dependencies ?? {};

    // Check all dependencies are satisfied
    for (const [depId, versionRange] of Object.entries(deps)) {
      const dep = this.plugins.get(depId);
      if (!dep) {
        return { success: false, error: `Missing dependency: "${depId}"` };
      }
      if (!satisfiesSemver(dep.plugin.descriptor.version, versionRange)) {
        return {
          success: false,
          error: `Dependency "${depId}" version ${dep.plugin.descriptor.version} does not satisfy ${versionRange}`,
        };
      }
    }

    // Check required services
    const requires = entry.plugin.descriptor.requires ?? [];
    for (const serviceName of requires) {
      if (!this.serviceRegistry.has(serviceName)) {
        // Service might be provided by a dependency that hasn't started yet
        const provider = Array.from(this.plugins.values()).find((p) =>
          p.plugin.descriptor.provides?.includes(serviceName),
        );
        if (!provider) {
          return { success: false, error: `Required service not available: "${serviceName}"` };
        }
      }
    }

    entry.state = 'resolved';
    this.eventBus.emit('plugin:resolved', { id });
    return { success: true };
  }

  /** Start (activate) a plugin */
  async start(id: string): Promise<{ success: boolean; error?: string }> {
    const entry = this.plugins.get(id);
    if (!entry) return { success: false, error: `Plugin "${id}" not found` };

    // Auto-resolve if needed
    if (entry.state === 'installed') {
      const resolved = this.resolve(id);
      if (!resolved.success) return resolved;
    }

    if (entry.state !== 'resolved') {
      return {
        success: false,
        error: `Plugin "${id}" must be in resolved state (current: ${entry.state})`,
      };
    }

    entry.state = 'starting';

    try {
      const context = this.createContext(id);
      // Timeout plugin activation to prevent indefinite hangs
      await Promise.race([
        entry.plugin.activate(context),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Plugin activation timed out (10s)')), 10_000),
        ),
      ]);
      entry.state = 'active';
      entry.activatedAt = Date.now();
      this.eventBus.emit('plugin:started', { id });
      return { success: true };
    } catch (e) {
      entry.state = 'resolved';
      entry.error = e instanceof Error ? e.message : String(e);
      return { success: false, error: entry.error };
    }
  }

  /** Stop (deactivate) a plugin */
  async stop(id: string): Promise<{ success: boolean; error?: string }> {
    const entry = this.plugins.get(id);
    if (!entry) return { success: false, error: `Plugin "${id}" not found` };
    if (entry.state !== 'active') {
      return { success: false, error: `Plugin "${id}" is not active` };
    }

    entry.state = 'stopping';

    try {
      if (entry.plugin.deactivate) {
        // Timeout deactivation to prevent indefinite hangs
        await Promise.race([
          entry.plugin.deactivate(),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Plugin deactivation timed out (10s)')), 10_000),
          ),
        ]);
      }

      // Remove services provided by this plugin
      const provides = entry.plugin.descriptor.provides ?? [];
      for (const svc of provides) {
        this.serviceRegistry.unregister(svc);
      }

      entry.state = 'resolved';
      this.eventBus.emit('plugin:stopped', { id });
      return { success: true };
    } catch (e) {
      entry.state = 'active'; // Revert on failure
      entry.error = e instanceof Error ? e.message : String(e);
      return { success: false, error: entry.error };
    }
  }

  /** Uninstall a plugin */
  async uninstall(id: string): Promise<{ success: boolean; error?: string }> {
    const entry = this.plugins.get(id);
    if (!entry) return { success: false, error: `Plugin "${id}" not found` };

    // Stop if active
    if (entry.state === 'active') {
      const stopped = await this.stop(id);
      if (!stopped.success) return stopped;
    }

    // Check no other plugin depends on this one
    for (const [otherId, otherEntry] of this.plugins) {
      if (otherId === id) continue;
      const deps = otherEntry.plugin.descriptor.dependencies ?? {};
      if (id in deps && otherEntry.state === 'active') {
        return {
          success: false,
          error: `Cannot uninstall: plugin "${otherId}" depends on "${id}"`,
        };
      }
    }

    entry.state = 'uninstalled';
    this.plugins.delete(id);
    this.configs.delete(id);
    this.eventBus.emit('plugin:uninstalled', { id });
    return { success: true };
  }

  /** Get all installed plugins */
  list(): PluginEntry[] {
    return Array.from(this.plugins.values());
  }

  /** Get plugin state */
  getPlugin(id: string): PluginEntry | undefined {
    return this.plugins.get(id);
  }

  /** Get all services */
  listServices(): string[] {
    return this.serviceRegistry.list();
  }

  /** Get the plugin event bus */
  getEventBus(): PluginEventBus {
    return this.eventBus;
  }

  /** Start all installed plugins */
  async startAll(): Promise<Map<string, { success: boolean; error?: string }>> {
    const results = new Map<string, { success: boolean; error?: string }>();

    // Sort by dependency order
    const sorted = this.topologicalSort();

    for (const id of sorted) {
      const entry = this.plugins.get(id);
      if (entry && entry.state !== 'active') {
        results.set(id, await this.start(id));
      }
    }

    return results;
  }

  /** Stop all active plugins */
  async stopAll(): Promise<void> {
    const activeIds = Array.from(this.plugins.entries())
      .filter(([, e]) => e.state === 'active')
      .map(([id]) => id)
      .reverse(); // Stop in reverse dependency order

    for (const id of activeIds) {
      await this.stop(id);
    }
  }

  // ─── Private Helpers ─────────────────────────────────────────────

  private createContext(pluginId: string): PluginContext {
    return {
      getService: <T>(name: string) => this.serviceRegistry.get<T>(name),
      registerService: <T>(name: string, service: T) =>
        this.serviceRegistry.register(name, service),
      emit: (event: string, data?: unknown) => this.eventBus.emit(event, data),
      on: (event: string, handler: EventHandler) => this.eventBus.on(event, handler),
      getConfig: <T>(key: string) => {
        const cfg = this.configs.get(pluginId);
        return cfg?.[key] as T | undefined;
      },
      setConfig: (key: string, value: unknown) => {
        if (!this.configs.has(pluginId)) this.configs.set(pluginId, {});
        this.configs.get(pluginId)![key] = value;
      },
      log: (level: 'debug' | 'info' | 'warn' | 'error', message: string) => {
        const safePluginId = sanitizeLogToken(pluginId);
        const safeMessage = sanitizeLogMessage(message);
        const line = `[Plugin:${safePluginId}] ${safeMessage}`;
        switch (level) {
          case 'debug':
            console.debug(line);
            break;
          case 'info':
            console.info(line);
            break;
          case 'warn':
            console.warn(line);
            break;
          case 'error':
            console.error(line);
            break;
        }
      },
    };
  }

  private topologicalSort(): string[] {
    const visited = new Set<string>();
    const sorted: string[] = [];

    const visit = (id: string): void => {
      if (visited.has(id)) return;
      visited.add(id);

      const entry = this.plugins.get(id);
      if (!entry) return;

      const deps = entry.plugin.descriptor.dependencies ?? {};
      for (const depId of Object.keys(deps)) {
        visit(depId);
      }

      sorted.push(id);
    };

    for (const id of this.plugins.keys()) {
      visit(id);
    }

    return sorted;
  }
}

/** Singleton plugin manager instance */
export const pluginManager = new PluginManager();
