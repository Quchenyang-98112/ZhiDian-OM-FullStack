/**
 * ExecAdapter — Safe Custom Script Integration
 *
 * Integrates custom local scripts (Python, Bash, etc.) as data sources or
 * actuators by proxying execution through the Nexus-HEMS API backend.
 *
 * Security model:
 *   - The frontend NEVER executes scripts directly.
 *   - All script identifiers are validated against a server-side whitelist
 *     (`EXEC_SCRIPTS_CONFIG` env var or config file).
 *   - No shell expansion, no arbitrary command strings — only whitelisted
 *     script IDs with pre-defined safe argument keys.
 *   - `READ_ONLY_MODE=true` blocks all exec write operations at the API level.
 *   - Output validated via Zod schema before updating the energy model.
 *
 * Threat model (why the above is sufficient):
 *   - **Arbitrary command execution (RCE):** mitigated by the ID whitelist —
 *     the client sends a `scriptId`, never a command line. Anything not in
 *     `EXEC_SCRIPTS_CONFIG` is rejected server-side before spawning.
 *   - **Argument injection:** only keys in the script's `allowedArgs` are
 *     forwarded; values are passed as discrete argv entries (no shell), so
 *     `; rm -rf /` in a value is an inert argument, not a new command.
 *   - **Unauthorized control:** exec is a hardware-control surface. Every call
 *     traverses the JWT-protected API and, in `READ_ONLY_MODE`, is rejected and
 *     audited (`rejected_readonly`) regardless of adapter config — see
 *     `apps/api/src/config/read-only-mode.ts` and the WS gateway guard.
 *   - **Resource exhaustion:** each whitelisted script carries a `timeoutMs`;
 *     runaway processes are killed server-side.
 *   - **Data poisoning:** stdout is Zod-validated before it can touch the
 *     energy model; malformed output is dropped, not trusted.
 *   Residual risk lives entirely in the operator-authored whitelist: a script
 *   the operator whitelists runs with the API process's privileges. Treat
 *   `EXEC_SCRIPTS_CONFIG` as a trusted, least-privilege allowlist.
 *
 * Script output contract (the script must output valid JSON to stdout):
 * ```json
 * {
 *   "readings": [
 *     { "metric": "POWER_W", "value": 1500.0, "role": "pv" },
 *     { "metric": "SOC_PERCENT", "value": 82.5, "role": "battery" }
 *   ]
 * }
 * ```
 *
 * Server-side whitelist format (EXEC_SCRIPTS_CONFIG env var, JSON):
 * ```json
 * {
 *   "scripts": {
 *     "read_solar_meter": {
 *       "command": "/opt/nexus/scripts/read_solar.py",
 *       "allowedArgs": ["--device", "--port"],
 *       "timeoutMs": 10000
 *     }
 *   }
 * }
 * ```
 *
 * Example config for this adapter:
 * ```typescript
 * new ExecAdapter({
 *   scriptId: 'read_solar_meter',
 *   args: { '--device': '/dev/ttyUSB0', '--port': '9600' },
 *   pollIntervalMs: 10_000,
 *   capabilities: ['pv', 'battery'],
 * })
 * ```
 */

import { getAuthHeader } from '../../../lib/auth-token';
import { registerAdapter } from '../adapter-registry';
import { BaseAdapter } from '../BaseAdapter';
import type {
  AdapterCapability,
  AdapterCommand,
  AdapterConnectionConfig,
  UnifiedEnergyModel,
} from '../EnergyAdapter';

// ─── Types ──────────────────────────────────────────────────────────

/** Allowed argument key pattern (alphanumeric, hyphen, underscore, dot only) */
const SAFE_ARG_KEY = /^[a-zA-Z0-9_\-.]{1,64}$/;
/** Allowed argument value pattern (no shell metacharacters) */
const SAFE_ARG_VALUE = /^[a-zA-Z0-9_\-./: ]{0,256}$/;

type EnergyRole = 'pv' | 'battery' | 'grid' | 'load' | 'ev' | 'heatpump';

type MetricType =
  | 'POWER_W'
  | 'ENERGY_KWH'
  | 'SOC_PERCENT'
  | 'VOLTAGE_V'
  | 'CURRENT_A'
  | 'FREQUENCY_HZ'
  | 'TEMPERATURE_C';

interface ExecReading {
  metric: MetricType;
  value: number;
  role?: EnergyRole;
  label?: string;
}

interface ExecScriptOutput {
  readings: ExecReading[];
  error?: string;
}

// ─── Config ─────────────────────────────────────────────────────────

export interface ExecAdapterConfig extends Partial<AdapterConnectionConfig> {
  /**
   * Script identifier — must match a key in the server-side EXEC_SCRIPTS_CONFIG whitelist.
   * Example: 'read_solar_meter'
   */
  scriptId: string;
  /**
   * Arguments to pass to the script. Keys and values are validated against
   * safe patterns on both client and server before execution.
   */
  args?: Record<string, string>;
  /**
   * How often to poll the script in milliseconds. Default: 10_000 (10s).
   * Scripts are never polled more frequently than every 2s regardless of this setting.
   */
  pollIntervalMs?: number;
  /**
   * Which energy capabilities this script provides.
   * Used by the adapter registry for capability-based routing.
   */
  capabilities?: AdapterCapability[];
  /**
   * Server base URL for the exec API. Defaults to window.location.origin.
   */
  serverBaseUrl?: string;
}

// ─── Adapter ────────────────────────────────────────────────────────

export class ExecAdapter extends BaseAdapter {
  readonly id: string;
  readonly name: string;
  readonly capabilities: AdapterCapability[];

  private readonly scriptId: string;
  private readonly safeArgs: Record<string, string>;
  private readonly pollIntervalMs: number;
  private readonly _serverBaseUrl: string | undefined;

  private pollTimer: ReturnType<typeof setInterval> | null = null;

  constructor(config: ExecAdapterConfig) {
    if (!config.scriptId || !/^[a-zA-Z0-9_-]{1,64}$/.test(config.scriptId)) {
      throw new Error('ExecAdapter: scriptId must be 1–64 alphanumeric/hyphen/underscore chars');
    }

    super({
      name: `Exec: ${config.scriptId}`,
      host: config.host ?? 'localhost',
      port: config.port ?? 3000,
      tls: config.tls ?? false,
      ...config,
    });

    this.id = `exec-${config.scriptId}`;
    this.name = `Custom Script: ${config.scriptId}`;
    this.capabilities = config.capabilities ?? ['pv'];
    this.scriptId = config.scriptId;
    this.pollIntervalMs = Math.max(2000, config.pollIntervalMs ?? 10_000);
    this._serverBaseUrl = config.serverBaseUrl;

    // Sanitize arguments — reject anything that looks like shell injection
    this.safeArgs = {};
    for (const [k, v] of Object.entries(config.args ?? {})) {
      if (!SAFE_ARG_KEY.test(k) || !SAFE_ARG_VALUE.test(v)) {
        this.log.warn('ExecAdapter: unsafe argument key/value rejected', {
          adapterId: this.id,
          key: k,
        });
        continue;
      }
      this.safeArgs[k] = v;
    }
  }

  protected async _connect(): Promise<void> {
    this.setStatus('connected');
    // Run an initial poll immediately, then start the interval
    void this.executePoll();
    this.pollTimer = setInterval(() => {
      void this.executePoll();
    }, this.pollIntervalMs);
  }

  protected async _disconnect(): Promise<void> {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  protected _cleanup(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  protected async _sendCommand(command: AdapterCommand): Promise<boolean> {
    // Control commands route through the exec API as well
    try {
      const baseUrl = this.serverBaseUrl;
      const resp = await fetch(`${baseUrl}/api/exec/command`, {
        method: 'POST',
        headers: { ...(getAuthHeader() ?? {}), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scriptId: this.scriptId,
          commandType: command.type,
          value: command.value,
          targetDeviceId: command.targetDeviceId,
          args: this.safeArgs,
        }),
        signal: AbortSignal.timeout(30_000),
      });
      return resp.ok;
    } catch {
      return false;
    }
  }

  async poll(): Promise<Partial<UnifiedEnergyModel>> {
    return this.executePoll();
  }

  // ── Private ──────────────────────────────────────────────────────

  private async executePoll(): Promise<Partial<UnifiedEnergyModel>> {
    try {
      const baseUrl = this.serverBaseUrl;
      const params = new URLSearchParams({
        scriptId: this.scriptId,
        args: JSON.stringify(this.safeArgs),
      });

      const resp = await fetch(`${baseUrl}/api/exec/run?${params.toString()}`, {
        headers: getAuthHeader() ?? {},
        signal: AbortSignal.timeout(30_000),
      });

      if (!resp.ok) {
        this.log.warn('ExecAdapter: script execution failed', {
          adapterId: this.id,
          status: resp.status,
        });
        return this.snapshot;
      }

      const output = (await resp.json()) as ExecScriptOutput;

      if (output.error) {
        this.log.warn('ExecAdapter: script reported error', {
          adapterId: this.id,
          error: output.error,
        });
        return this.snapshot;
      }

      const model = this.mapReadingsToModel(output.readings ?? []);
      this.emitData(model);
      return model;
    } catch (error) {
      this.log.error(
        'ExecAdapter: poll failed',
        error instanceof Error ? error : new Error(String(error)),
        { adapterId: this.id, scriptId: this.scriptId },
      );
      return this.snapshot;
    }
  }

  private mapReadingsToModel(readings: ExecReading[]): Partial<UnifiedEnergyModel> {
    const model: Partial<UnifiedEnergyModel> = {
      timestamp: Date.now(),
      ...this.snapshot,
    };

    for (const r of readings) {
      if (!Number.isFinite(r.value)) continue;
      switch (r.role) {
        case 'pv':
          this.applyPvReading(model, r);
          break;
        case 'battery':
          this.applyBatteryReading(model, r);
          break;
        case 'grid':
          this.applyGridReading(model, r);
          break;
        case 'load':
          this.applyLoadReading(model, r);
          break;
        case 'heatpump':
          this.applyHeatpumpReading(model, r);
          break;
        case 'ev':
          this.applyEvReading(model, r);
          break;
        default:
          break;
      }
    }

    return model;
  }

  private applyPvReading(model: Partial<UnifiedEnergyModel>, r: ExecReading): void {
    if (r.metric === 'POWER_W') {
      model.pv = {
        ...model.pv,
        totalPowerW: r.value,
        yieldTodayKWh: model.pv?.yieldTodayKWh ?? 0,
      };
    } else if (r.metric === 'ENERGY_KWH') {
      model.pv = {
        ...model.pv,
        totalPowerW: model.pv?.totalPowerW ?? 0,
        yieldTodayKWh: r.value,
      };
    }
  }

  private applyBatteryReading(model: Partial<UnifiedEnergyModel>, r: ExecReading): void {
    if (r.metric === 'POWER_W') {
      model.battery = {
        ...model.battery,
        powerW: r.value,
        socPercent: model.battery?.socPercent ?? 0,
        voltageV: model.battery?.voltageV ?? 0,
        currentA: model.battery?.currentA ?? 0,
      };
    } else if (r.metric === 'SOC_PERCENT') {
      const clamped = Math.min(100, Math.max(0, r.value));
      model.battery = {
        ...model.battery,
        socPercent: clamped,
        powerW: model.battery?.powerW ?? 0,
        voltageV: model.battery?.voltageV ?? 0,
        currentA: model.battery?.currentA ?? 0,
      };
    } else if (r.metric === 'VOLTAGE_V') {
      model.battery = {
        ...model.battery,
        voltageV: r.value,
        powerW: model.battery?.powerW ?? 0,
        socPercent: model.battery?.socPercent ?? 0,
        currentA: model.battery?.currentA ?? 0,
      };
    } else if (r.metric === 'TEMPERATURE_C') {
      model.battery = {
        ...model.battery,
        temperatureC: r.value,
        powerW: model.battery?.powerW ?? 0,
        socPercent: model.battery?.socPercent ?? 0,
        voltageV: model.battery?.voltageV ?? 0,
        currentA: model.battery?.currentA ?? 0,
      };
    }
  }

  private applyGridReading(model: Partial<UnifiedEnergyModel>, r: ExecReading): void {
    if (r.metric === 'POWER_W') {
      model.grid = { ...model.grid, powerW: r.value, voltageV: model.grid?.voltageV ?? 230 };
    } else if (r.metric === 'VOLTAGE_V') {
      model.grid = { ...model.grid, voltageV: r.value, powerW: model.grid?.powerW ?? 0 };
    } else if (r.metric === 'FREQUENCY_HZ') {
      model.grid = {
        ...model.grid,
        frequencyHz: r.value,
        powerW: model.grid?.powerW ?? 0,
        voltageV: model.grid?.voltageV ?? 230,
      };
    }
  }

  private applyLoadReading(model: Partial<UnifiedEnergyModel>, r: ExecReading): void {
    if (r.metric !== 'POWER_W') return;
    const existing = model.load ?? {
      totalPowerW: 0,
      heatPumpPowerW: 0,
      evPowerW: 0,
      otherPowerW: 0,
    };
    model.load = {
      ...existing,
      totalPowerW: r.value,
      otherPowerW: Math.max(0, r.value - existing.heatPumpPowerW - existing.evPowerW),
    };
  }

  private applyHeatpumpReading(model: Partial<UnifiedEnergyModel>, r: ExecReading): void {
    if (r.metric !== 'POWER_W') return;
    const existing = model.load ?? {
      totalPowerW: 0,
      heatPumpPowerW: 0,
      evPowerW: 0,
      otherPowerW: 0,
    };
    model.load = { ...existing, heatPumpPowerW: r.value };
  }

  private applyEvReading(model: Partial<UnifiedEnergyModel>, r: ExecReading): void {
    if (r.metric !== 'POWER_W') return;
    model.evCharger = {
      ...model.evCharger,
      powerW: r.value,
      status: r.value > 0 ? 'charging' : 'available',
      energySessionKWh: model.evCharger?.energySessionKWh ?? 0,
      maxCurrentA: model.evCharger?.maxCurrentA ?? 32,
      vehicleConnected: r.value > 0,
      v2xCapable: false,
      v2xActive: false,
    };
  }

  private get serverBaseUrl(): string {
    if (this._serverBaseUrl) return this._serverBaseUrl;
    return typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
  }
}

// ─── Registration ────────────────────────────────────────────────────

export function register(): void {
  registerAdapter('exec', (config) => new ExecAdapter(config as ExecAdapterConfig), {
    displayName: 'Custom Script (Exec)',
    description:
      'Execute custom local scripts for hardware not natively supported. Requires server-side script whitelist (EXEC_SCRIPTS_CONFIG).',
    source: 'contrib',
  });
}

export const id = 'exec';
export const factory = (config?: Partial<AdapterConnectionConfig>) =>
  new ExecAdapter(config as ExecAdapterConfig);
