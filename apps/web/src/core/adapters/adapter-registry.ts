/**
 * Adapter Registry — Plugin System for HEMS Protocol Adapters
 *
 * Provides a central registry where built-in and contrib/third-party adapters
 * register themselves. Supports:
 *
 *   1. Static registration via `registerAdapter(id, factory)`
 *   2. Dynamic loading via `loadContribAdapter(id)` (Vite import())
 *   3. package format: external packages export `{ id, factory }`
 *
 * Usage:
 *   // Static registration (built-in or contrib)
 *   registerAdapter('my-custom', (config) => new MyAdapter(config));
 *
 *   // Dynamic loading from contrib/
 *   await loadContribAdapter('my-custom');
 *
 *   // external package entry point:
 *   export default { id: 'my-package', factory: (config) => new MyPackageAdapter(config) };
 */

import type { AdapterConnectionConfig, EnergyAdapter } from './EnergyAdapter';

// ─── Types ───────────────────────────────────────────────────────────

/** Factory function that creates an adapter instance from config */
export type AdapterFactory = (config?: Partial<AdapterConnectionConfig>) => EnergyAdapter;

/** Metadata for a registered adapter */
export interface AdapterRegistration {
  /** Unique adapter identifier (e.g. 'victron-mqtt', 'my-custom') */
  id: string;
  /** Human-readable display name */
  displayName?: string | undefined;
  /** Short description */
  description?: string | undefined;
  /** Factory to create instances */
  factory: AdapterFactory;
  /** Whether this is a built-in or contrib/third-party adapter */
  source: 'builtin' | 'contrib' | 'npm';
}

// ─── Registry ────────────────────────────────────────────────────────

const registry = new Map<string, AdapterRegistration>();
const loadedContribs = new Set<string>();

/**
 * Register an adapter factory in the global adapter registry.
 *
 * @param id      Unique adapter identifier (lowercase, kebab-case recommended)
 * @param factory Function that creates an EnergyAdapter instance
 * @param meta    Optional metadata (displayName, description, source)
 * @throws        If an adapter with the same id is already registered
 *
 * @example
 *   registerAdapter('shelly-pro', (config) => new ShellyProAdapter(config), {
 *     displayName: 'Shelly Pro',
 *     description: 'Shelly Pro Series smart relays',
 *     source: 'contrib',
 *   });
 */
export function registerAdapter(
  id: string,
  factory: AdapterFactory,
  meta?: Partial<Omit<AdapterRegistration, 'id' | 'factory'>>,
): void {
  if (!/^[a-z][a-z0-9-]*$/.test(id)) {
    throw new Error(`[Registry] Invalid adapter id "${id}"`);
  }

  if (registry.has(id)) {
    if (import.meta.env.DEV) {
      console.warn('[AdapterRegistry] Adapter already registered, skipping:', id);
    }
    return;
  }

  registry.set(id, {
    id,
    displayName: meta?.displayName ?? id,
    description: meta?.description,
    factory,
    source: meta?.source ?? 'contrib',
  });

  if (import.meta.env.DEV) {
    console.log('[AdapterRegistry] Registered adapter:', id, meta?.source ?? 'contrib');
  }
}

/**
 * Unregister an adapter. Only contrib/npm adapters can be unregistered.
 */
export function unregisterAdapter(id: string): boolean {
  const entry = registry.get(id);
  if (!entry) return false;
  if (entry.source === 'builtin') {
    if (import.meta.env.DEV) {
      console.warn('[AdapterRegistry] Cannot unregister built-in adapter:', id);
    }
    return false;
  }
  registry.delete(id);
  loadedContribs.delete(id);
  return true;
}

/**
 * Get a registered adapter by id.
 */
export function getRegisteredAdapter(id: string): AdapterRegistration | undefined {
  return registry.get(id);
}

/**
 * List all registered adapters.
 */
export function listRegisteredAdapters(): AdapterRegistration[] {
  return Array.from(registry.values());
}

/**
 * Check if an adapter is registered.
 */
export function isAdapterRegistered(id: string): boolean {
  return registry.has(id);
}

/**
 * Create an adapter instance from the registry.
 *
 * @param id     Adapter identifier
 * @param config Optional connection config
 * @returns      New adapter instance or undefined if not registered
 */
export function createRegisteredAdapter(
  id: string,
  config?: Partial<AdapterConnectionConfig>,
): EnergyAdapter | undefined {
  const entry = registry.get(id);
  if (!entry) return undefined;
  return entry.factory(config);
}

// ─── Dynamic loading (Vite import()) ─────────────────────────────────

/**
 * Dynamically load a contrib adapter from `src/core/adapters/contrib/`.
 *
 * Expects the module to have a default export or named `register` function
 * that calls `registerAdapter()` internally. Alternatively, it can export
 * `{ id, factory }` which will be auto-registered.
 *
 * @param id  Module name (matches file in contrib/, e.g. 'shelly-pro')
 * @returns   true if loaded successfully, false otherwise
 *
 * @example
 *   const ok = await loadContribAdapter('shelly-pro');
 *   // Loads ./contrib/shelly-pro.ts and registers the adapter
 */
export async function loadContribAdapter(id: string): Promise<boolean> {
  if (loadedContribs.has(id)) return true;

  // Validate id to prevent path traversal
  if (!/^[a-z][a-z0-9-]*$/.test(id)) {
    console.error('[Registry] Invalid contrib id:', id);
    return false;
  }

  try {
    // Vite dynamic import — contrib modules are in the same directory tree
    const contribModules = import.meta.glob<{
      default?: { id: string; factory: AdapterFactory } | (() => void);
      register?: () => void;
      id?: string;
      factory?: AdapterFactory;
    }>('./contrib/*.ts', { eager: false });

    const modulePath = `./contrib/${id}.ts`;
    const loader = contribModules[modulePath];

    if (!loader) {
      const availableIds = Object.keys(contribModules)
        .map((p) => p.replace('./contrib/', '').replace('.ts', ''))
        .sort()
        .join(', ');
      console.error(`[Registry] Contrib "${id}" missing. Known: ${availableIds || 'none'}`);
      return false;
    }

    const mod = await loader();

    // Strategy 1: Module has a `register()` function
    if (typeof mod.register === 'function') {
      mod.register();
    }
    // Strategy 2: Module exports `{ id, factory }` directly
    else if (mod.id && mod.factory) {
      registerAdapter(mod.id, mod.factory, { source: 'contrib' });
    }
    // Strategy 3: Default export is `{ id, factory }`
    else if (
      mod.default &&
      typeof mod.default === 'object' &&
      'id' in mod.default &&
      'factory' in mod.default
    ) {
      const def = mod.default as { id: string; factory: AdapterFactory };
      registerAdapter(def.id, def.factory, { source: 'contrib' });
    }
    // Strategy 4: Default export is a register function
    else if (typeof mod.default === 'function') {
      (mod.default as () => void)();
    }

    loadedContribs.add(id);

    if (import.meta.env.DEV) {
      console.log('[AdapterRegistry] Loaded contrib adapter:', id);
    }
    return true;
  } catch (err) {
    console.error('[Registry] Failed to load contrib:', id, err);
    return false;
  }
}

/**
 * Load all contrib adapters from the `contrib/` directory.
 * Uses Vite's `import.meta.glob` to discover modules at build time.
 */
export async function loadAllContribAdapters(): Promise<string[]> {
  const contribModules = import.meta.glob<{
    default?: { id: string; factory: AdapterFactory } | (() => void);
    register?: () => void;
    id?: string;
    factory?: AdapterFactory;
  }>('./contrib/*.ts', { eager: false });

  const loaded: string[] = [];

  for (const path of Object.keys(contribModules)) {
    // Extract id from path: './contrib/shelly-pro.ts' → 'shelly-pro'
    const match = path.match(/\.\/contrib\/([a-z][a-z0-9-]*)\.ts$/);
    if (!match) continue;

    const id = match[1];
    // Skip index / barrel files
    if (id === 'index') continue;

    const ok = await loadContribAdapter(id);
    if (ok) loaded.push(id);
  }

  return loaded;
}

// ─── Built-in registration ──────────────────────────────────────────

import type { EEBUSAdapterConfig } from './EEBUSAdapter';
import { EEBUSAdapter } from './EEBUSAdapter';
import { EvccAdapter } from './EvccAdapter';
import type { KNXAdapterConfig } from './KNXAdapter';
import { KNXAdapter } from './KNXAdapter';
import { ModbusSunSpecAdapter } from './ModbusSunSpecAdapter';
import type { OCPPAdapterConfig } from './OCPP21Adapter';
import { OCPP21Adapter } from './OCPP21Adapter';
import { OpenEMSAdapter } from './OpenEMSAdapter';
import type { VictronAdapterConfig } from './VictronMQTTAdapter';
import { VictronMQTTAdapter } from './VictronMQTTAdapter';

/**
 * Register all built-in adapters. Called once during store initialization.
 * This hooks the 7 core adapters into the registry so the factory can be unified.
 */
export function registerBuiltinAdapters(): void {
  registerAdapter(
    'victron-mqtt',
    (config) => new VictronMQTTAdapter(config as VictronAdapterConfig | undefined),
    {
      displayName: 'Victron MQTT',
      description: 'Venus OS MQTT-over-WebSocket Bridge',
      source: 'builtin',
    },
  );

  registerAdapter('modbus-sunspec', (config) => new ModbusSunSpecAdapter(config), {
    displayName: 'Modbus SunSpec',
    description: 'SunSpec Models via REST Bridge',
    source: 'builtin',
  });

  registerAdapter('knx', (config) => new KNXAdapter(config as KNXAdapterConfig | undefined), {
    displayName: 'KNX/IP',
    description: 'KNXnet/IP Tunneling über knxd',
    source: 'builtin',
  });

  registerAdapter(
    'ocpp-21',
    (config) => new OCPP21Adapter(config as OCPPAdapterConfig | undefined),
    {
      displayName: 'OCPP 2.1',
      description: 'EV-Laden, V2X, ISO 15118',
      source: 'builtin',
    },
  );

  registerAdapter('eebus', (config) => new EEBUSAdapter(config as EEBUSAdapterConfig | undefined), {
    displayName: 'EEBUS',
    description: 'SPINE/SHIP, TLS 1.3 mTLS, VDE-AR-E 2829-6',
    source: 'builtin',
  });

  registerAdapter('evcc', (config) => new EvccAdapter(config), {
    displayName: 'evcc Backend',
    description: 'evcc.io backend integration via REST + WebSocket',
    source: 'builtin',
  });

  registerAdapter('openems', (config) => new OpenEMSAdapter(config), {
    displayName: 'OpenEMS Edge',
    description: 'OpenEMS Edge JSON-RPC over WebSocket',
    source: 'builtin',
  });
}
