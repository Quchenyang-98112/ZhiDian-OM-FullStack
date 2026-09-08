/**
 * Example Contrib Adapter — Template for Third-Party HEMS Integrations
 *
 * This file demonstrates how to create a contrib adapter that plugs into
 * the Nexus HEMS Dashboard adapter system.
 *
 * ## Quick Start
 *
 *   1. Copy this file and rename it (e.g. `shelly-pro.ts`)
 *   2. Implement your adapter extending `BaseAdapter`
 *   3. Export `register()` or `{ id, factory }` (see bottom of file)
 *   4. The adapter is auto-discovered via `loadAllContribAdapters()`
 *
 * ## npm Package Format
 *
 *   If publishing as an external package, export `{ id, factory }` from
 *   your package entry point. For in-repository contrib adapters, register
 *   directly with the local registry:
 *
 *     import { registerAdapter } from '../adapter-registry';
 *     registerAdapter('my-package', (config) => new MyAdapter(config));
 *
 *   Or export `{ id, factory }` as default export.
 */

import { registerAdapter } from '../adapter-registry';
import { BaseAdapter } from '../BaseAdapter';
import type {
  AdapterCapability,
  AdapterCommand,
  AdapterConnectionConfig,
  UnifiedEnergyModel,
} from '../EnergyAdapter';

// ─── Example Adapter Config ─────────────────────────────────────────

export interface ExampleAdapterConfig extends Partial<AdapterConnectionConfig> {
  /** Custom polling interval (ms) */
  pollIntervalMs?: number;
}

// ─── Example Adapter Implementation ─────────────────────────────────

export class ExampleContribAdapter extends BaseAdapter {
  readonly id = 'example-contrib';
  readonly name = 'Example Contrib Adapter';
  readonly capabilities: AdapterCapability[] = ['grid', 'pv'];

  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private pollIntervalMs: number;

  constructor(config?: ExampleAdapterConfig) {
    super({
      name: 'Example Contrib',
      host: config?.host ?? 'localhost',
      port: config?.port ?? 8080,
      tls: config?.tls ?? false,
      ...config,
    });
    this.pollIntervalMs = config?.pollIntervalMs ?? 5000;
  }

  protected async _connect(): Promise<void> {
    // Implement your connection logic here:
    // - Open WebSocket, MQTT connection, HTTP polling, etc.
    // - Throw on failure (BaseAdapter handles retry)

    // Example: start polling
    this.pollTimer = setInterval(() => {
      void this.poll();
    }, this.pollIntervalMs);
  }

  protected async _disconnect(): Promise<void> {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  protected async _sendCommand(command: AdapterCommand): Promise<boolean> {
    // Implement command dispatch to your hardware
    // BaseAdapter already validates, checks circuit breaker, and logs audit
    if (import.meta.env.DEV) {
      console.log('[ExampleContrib] Would send command:', command.type, command.value);
    }
    return true;
  }

  /**
   * Optional poll method — called by the polling interval.
   * Fetch data from your device and call `this.updateData()`.
   */
  async poll(): Promise<Partial<UnifiedEnergyModel>> {
    // Example: fetch from REST API
    // const res = await fetch(`http://${this.config.host}:${this.config.port}/api/data`);
    // const raw = await res.json();

    const data: Partial<UnifiedEnergyModel> = {
      timestamp: Date.now(),
      pv: {
        totalPowerW: 0,
        yieldTodayKWh: 0,
      },
    };

    this.emitData(data);
    return data;
  }

  getSnapshot(): Partial<UnifiedEnergyModel> {
    return {
      timestamp: Date.now(),
      pv: { totalPowerW: 0, yieldTodayKWh: 0 },
    };
  }
}

// ─── Registration ────────────────────────────────────────────────────

/**
 * Self-registration function.
 * Called automatically when the module is loaded via `loadContribAdapter()`.
 */
export function register(): void {
  registerAdapter(
    'example-contrib',
    (config) => new ExampleContribAdapter(config as ExampleAdapterConfig | undefined),
    {
      displayName: 'Example Contrib',
      description: 'Template adapter for third-party integrations',
      source: 'contrib',
    },
  );
}

/** Alternative: named exports for auto-registration */
export const id = 'example-contrib';
export const factory = (config?: Partial<AdapterConnectionConfig>) =>
  new ExampleContribAdapter(config as ExampleAdapterConfig | undefined);
