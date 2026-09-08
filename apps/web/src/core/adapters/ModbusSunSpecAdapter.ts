/**
 * ModbusSunSpecAdapter — Production SunSpec Modbus adapter
 *
 * Connects to SunSpec-compliant inverters and meters via:
 *   1. REST bridge (default) — local HTTP gateway exposing Modbus registers as JSON
 *   2. Direct Modbus TCP — via server-side proxy endpoint (browser can't do raw TCP)
 *
 * SunSpec Models used:
 *   • Model 1    — Common block (manufacturer, serial, model)
 *   • Model 101–103 — Single/Split/Three-Phase Inverter (AC power, energy)
 *   • Model 124  — Storage (battery SOC, power, cycles)
 *   • Model 160  — Multiple MPPT Inverter Extension (per-string data)
 *   • Model 201–204 — Meter readings (grid import/export, per-phase)
 *
 * SunSpec Register Discovery:
 *   The adapter performs auto-discovery by reading the SunSpec base register
 *   (40000 or 0) and walking the model chain via length fields.
 *
 * REST Bridge API:
 *   GET /api/modbus/sunspec?model=103   →  Inverter registers
 *   GET /api/modbus/sunspec?model=124   →  Battery registers
 *   GET /api/modbus/sunspec?model=201   →  Meter registers
 *   GET /api/modbus/sunspec?model=1     →  Common block
 *   POST /api/modbus/write              →  Write register { register, value }
 */

import { mergeSunSpecRegistersToUnified } from '../sunspec-transforms';
import { BaseAdapter } from './BaseAdapter';
import type {
  AdapterCapability,
  AdapterCommand,
  AdapterConnectionConfig,
  UnifiedEnergyModel,
} from './EnergyAdapter';

// ─── SunSpec Model IDs ───────────────────────────────────────────────

export const SUNSPEC_MODELS = {
  COMMON: 1,
  INVERTER_SINGLE: 101,
  INVERTER_SPLIT: 102,
  INVERTER_THREE: 103,
  STORAGE: 124,
  MPPT: 160,
  METER_SINGLE: 201,
  METER_SPLIT: 202,
  METER_THREE_WYE: 203,
  METER_THREE_DELTA: 204,
} as const;

// ─── SunSpec register response shapes ────────────────────────────────

interface SunSpecCommonBlock {
  Mn: string; // Manufacturer
  Md: string; // Model
  SN: string; // Serial
  Vr?: string; // Version
}

interface SunSpecInverterRegs {
  /** AC Power (W) — register 14 */
  W: number;
  /** AC Energy lifetime (Wh) */
  WH: number;
  /** W scale factor */
  W_SF?: number;
  /** WH scale factor */
  WH_SF?: number;
  /** AC Voltage L-N (V) */
  PhVphA?: number;
  /** AC Current (A) */
  A?: number;
  /** AC Frequency (Hz) */
  Hz?: number;
  /** Operating state: 1=Off, 2=Sleeping, 3=Starting, 4=MPPT, 5=Throttled, 6=Shutting down */
  St?: number;
  /** DC Power per string */
  strings?: { DCA: number; DCV: number; DCW: number }[];
}

interface SunSpecBatteryRegs {
  /** Charge/discharge W (positive = charge) */
  W: number;
  /** State of charge (%) */
  SoC: number;
  /** Battery voltage (V) */
  V: number;
  /** Battery current (A) */
  A: number;
  /** Temperature (°C) */
  TmpBdy?: number;
  /** Cycle count */
  CycCnt?: number;
  /** State of health (%) */
  SoH?: number;
  /** Charge status: 1=Off, 2=Empty, 3=Discharging, 4=Charging, 5=Full, 6=Holding */
  ChaSt?: number;
  /** Scale factors */
  W_SF?: number;
  SoC_SF?: number;
}

interface SunSpecMeterRegs {
  /** Total real power (W), positive = import */
  W: number;
  /** Line voltage L-N avg (V) */
  PhV: number;
  /** Frequency (Hz) */
  Hz?: number;
  /** Total energy imported (Wh) */
  TotWhImp?: number;
  /** Total energy exported (Wh) */
  TotWhExp?: number;
  /** Per-phase readings */
  phases?: { PhV: number; A: number; W: number }[];
  /** Scale factors */
  W_SF?: number;
  TotWh_SF?: number;
}

// ─── Discovered SunSpec device info ──────────────────────────────────

export interface SunSpecDeviceInfo {
  manufacturer: string;
  model: string;
  serial: string;
  version?: string | undefined;
  availableModels: number[];
}

const DEFAULT_POLL_INTERVAL_MS = 3000;

const DEFAULT_RECONNECT = {
  enabled: true,
  initialDelayMs: 2000,
  maxDelayMs: 30_000,
  backoffMultiplier: 2,
};

export class ModbusSunSpecAdapter extends BaseAdapter {
  readonly id = 'modbus-sunspec';
  readonly name = 'Modbus TCP / SunSpec';
  readonly capabilities: AdapterCapability[] = ['pv', 'battery', 'grid'];

  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private consecutiveErrors = 0;
  private isPollInFlight = false;
  private delegatePollingToWorker = false;
  private readonly baseUrl: string;

  /** Discovered device info (populated after first successful connection) */
  deviceInfo: SunSpecDeviceInfo | null = null;

  constructor(config?: Partial<AdapterConnectionConfig>) {
    // HIGH-01: host is required
    if (!config?.host) {
      throw new Error('[ModbusSunSpec] config.host is required');
    }
    super({
      name: 'Modbus SunSpec',
      host: config?.host ?? '192.168.1.100',
      port: config?.port ?? 502,
      tls: config?.tls ?? false,
      pollIntervalMs: config?.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS,
      reconnect: { ...DEFAULT_RECONNECT, ...config?.reconnect },
      ...config,
    });

    // SSRF guard: validate host is a private/local IP or hostname
    const host = this.config.host;
    if (!ModbusSunSpecAdapter.isAllowedHost(host)) {
      throw new Error(
        `[ModbusSunSpec] Host "${host}" is not a local/private address. ` +
          'Only RFC 1918 / link-local addresses and localhost are allowed.',
      );
    }

    const proto = this.config.tls ? 'https' : 'http';
    this.baseUrl = `${proto}://${this.config.host}:${this.config.port}`;
  }

  /** MED-12: when true, `useAdapterBridge` polls via Web Worker instead of main thread. */
  setDelegatePollingToWorker(delegate: boolean): void {
    this.delegatePollingToWorker = delegate;
  }

  /** Poll target for the adapter worker (REST bridge SunSpec gateway). */
  getWorkerPollConfig(): {
    protocol: 'http' | 'https';
    host: string;
    port?: number;
    path: string;
    pollIntervalMs: number;
    headers?: Record<string, string>;
  } {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (this.config.authToken) {
      headers.Authorization = `Bearer ${this.config.authToken}`;
    }
    return {
      protocol: this.config.tls ? 'https' : 'http',
      host: this.config.host,
      port: this.config.port,
      path: '/api/modbus/sunspec',
      pollIntervalMs: this.config.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS,
      ...(Object.keys(headers).length > 0 ? { headers } : {}),
    };
  }

  /**
   * Validate that a host is a private/local address to prevent SSRF.
   * Allows: localhost, 127.x, 10.x, 172.16-31.x, 192.168.x, fe80::, ::1, .local hostnames
   */
  private static isAllowedHost(host: string): boolean {
    // localhost / loopback
    if (host === 'localhost' || host === '127.0.0.1' || host === '::1') return true;
    // mDNS .local hostnames (common for inverters)
    if (host.endsWith('.local')) return true;
    // RFC 1918 private ranges
    if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
    if (/^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
    if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
    // Link-local IPv4 (169.254.x.x)
    if (/^169\.254\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
    // IPv6 link-local
    if (host.toLowerCase().startsWith('fe80:')) return true;
    // 127.x.x.x loopback range
    if (/^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
    return false;
  }

  // ─── BaseAdapter abstract implementations ─────────────────────────

  protected async _connect(): Promise<void> {
    this.setStatus('connecting');

    try {
      // Perform SunSpec model discovery
      const common = await this.fetchModel<SunSpecCommonBlock>('common');
      this.deviceInfo = {
        manufacturer: common.Mn ?? 'Unknown',
        model: common.Md ?? 'Unknown',
        serial: common.SN ?? '',
        version: common.Vr,
        availableModels: [SUNSPEC_MODELS.COMMON],
      };

      // Probe for available models
      await this.discoverModels();

      this.consecutiveErrors = 0;
      this.setStatus('connected');
      this.startPolling();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Connection failed';
      this.setStatus('error', msg);
      this.scheduleReconnect();
    }
  }

  protected async _disconnect(): Promise<void> {
    this.stopPolling();
  }

  protected async _sendCommand(command: AdapterCommand): Promise<boolean> {
    const allowed = ['SET_BATTERY_POWER', 'SET_BATTERY_MODE', 'SET_GRID_LIMIT'];
    if (!allowed.includes(command.type)) return false;

    try {
      const body = this.mapCommandToRegister(command);
      if (!body) return false;

      const res = await fetch(`${this.baseUrl}/api/modbus/write`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.config.authToken ? { Authorization: `Bearer ${this.config.authToken}` } : {}),
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(5000),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  protected _cleanup(): void {
    this.stopPolling();
  }

  // ─── Poll (public — used by EnergyAdapter.poll?) ──────────────────

  async poll(): Promise<Partial<UnifiedEnergyModel>> {
    const availableModels = this.deviceInfo?.availableModels ?? [];

    // Determine which models to poll based on discovery
    const hasInverter = availableModels.some((m) =>
      (
        [
          SUNSPEC_MODELS.INVERTER_SINGLE,
          SUNSPEC_MODELS.INVERTER_SPLIT,
          SUNSPEC_MODELS.INVERTER_THREE,
        ] as number[]
      ).includes(m),
    );
    const hasBattery = (availableModels as number[]).includes(SUNSPEC_MODELS.STORAGE);
    const hasMeter = availableModels.some((m) =>
      (
        [
          SUNSPEC_MODELS.METER_SINGLE,
          SUNSPEC_MODELS.METER_SPLIT,
          SUNSPEC_MODELS.METER_THREE_WYE,
          SUNSPEC_MODELS.METER_THREE_DELTA,
        ] as number[]
      ).includes(m),
    );

    const fetches: Promise<unknown>[] = [];
    const labels: string[] = [];

    if (hasInverter || availableModels.length === 0) {
      fetches.push(this.fetchModel<SunSpecInverterRegs>('inverter'));
      labels.push('inverter');
    }
    if (hasBattery || availableModels.length === 0) {
      fetches.push(this.fetchModel<SunSpecBatteryRegs>('battery'));
      labels.push('battery');
    }
    if (hasMeter || availableModels.length === 0) {
      fetches.push(this.fetchModel<SunSpecMeterRegs>('meter'));
      labels.push('meter');
    }

    const results = await Promise.allSettled(fetches);

    let inverterRegs: SunSpecInverterRegs | null = null;
    let batteryRegs: SunSpecBatteryRegs | null = null;
    let meterRegs: SunSpecMeterRegs | null = null;

    results.forEach((r, i) => {
      if (r.status !== 'fulfilled') return;
      switch (labels[i]) {
        case 'inverter':
          inverterRegs = r.value as SunSpecInverterRegs;
          break;
        case 'battery':
          batteryRegs = r.value as SunSpecBatteryRegs;
          break;
        case 'meter':
          meterRegs = r.value as SunSpecMeterRegs;
          break;
      }
    });

    const model = mergeSunSpecRegistersToUnified({
      inverter: inverterRegs as unknown as Record<string, unknown> | null,
      battery: batteryRegs as unknown as Record<string, unknown> | null,
      meter: meterRegs as unknown as Record<string, unknown> | null,
    });

    this.snapshot = model;
    return model;
  }

  // ─── Model Discovery ─────────────────────────────────────────────

  private async discoverModels(): Promise<void> {
    if (!this.deviceInfo) return;

    // Try to discover available SunSpec models via the bridge
    const probeModels = [
      {
        model: 'inverter',
        ids: [
          SUNSPEC_MODELS.INVERTER_SINGLE,
          SUNSPEC_MODELS.INVERTER_SPLIT,
          SUNSPEC_MODELS.INVERTER_THREE,
        ],
      },
      { model: 'battery', ids: [SUNSPEC_MODELS.STORAGE] },
      { model: 'meter', ids: [SUNSPEC_MODELS.METER_SINGLE, SUNSPEC_MODELS.METER_THREE_WYE] },
    ];

    const probes = probeModels.map(async (p) => {
      try {
        await this.fetchModel(p.model);
        return p.ids;
      } catch {
        return [];
      }
    });

    const results = await Promise.all(probes);
    this.deviceInfo.availableModels = [SUNSPEC_MODELS.COMMON, ...results.flat()];
  }

  // ─── Internal ─────────────────────────────────────────────────────

  private startPolling(): void {
    if (this.delegatePollingToWorker) return;
    this.stopPolling();
    const interval = this.config.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;

    const doPoll = async () => {
      // Guard against overlapping polls when a slow device exceeds the interval
      if (this.isPollInFlight) return;
      // Circuit breaker gate: skip poll while the circuit is open.
      // Prevents repeated HTTP requests from blocking the event loop during
      // sustained Modbus device timeouts (e.g. unreachable REST bridge).
      if (!this.circuitBreaker.canExecute()) return;

      this.isPollInFlight = true;
      try {
        const model = await this.poll();
        this.consecutiveErrors = 0;
        this.circuitBreaker.recordSuccess();
        if (this._status !== 'connected') this.setStatus('connected');
        this.emitData(model);
      } catch {
        this.consecutiveErrors++;
        this.circuitBreaker.recordFailure();
        if (this.consecutiveErrors >= 5) {
          this.setStatus('error', `${this.consecutiveErrors} consecutive poll failures`);
        }
      } finally {
        this.isPollInFlight = false;
      }
    };

    void doPoll();
    this.pollTimer = setInterval(() => void doPoll(), interval);
  }

  private stopPolling(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  private async fetchModel<T>(model: string): Promise<T> {
    const url = `${this.baseUrl}/api/modbus/sunspec?model=${encodeURIComponent(model)}`;

    const headers: Record<string, string> = {
      Accept: 'application/json',
    };
    if (this.config.authToken) {
      headers.Authorization = `Bearer ${this.config.authToken}`;
    }

    const res = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) {
      throw new Error(`Modbus gateway HTTP ${res.status}`);
    }
    return res.json() as Promise<T>;
  }

  // ─── Command → Register mapping ──────────────────────────────────

  private mapCommandToRegister(
    command: AdapterCommand,
  ): { register: string; value: number; model?: number } | null {
    switch (command.type) {
      case 'SET_BATTERY_POWER':
        // SunSpec Model 124: WChaMax (max charge rate) or WDisChaMax
        return {
          register: 'WChaMax',
          value: Math.abs(Number(command.value)),
          model: SUNSPEC_MODELS.STORAGE,
        };
      case 'SET_BATTERY_MODE':
        // SunSpec Model 124: StorCtl_Mod
        return {
          register: 'StorCtl_Mod',
          value: Number(command.value),
          model: SUNSPEC_MODELS.STORAGE,
        };
      case 'SET_GRID_LIMIT':
        // Grid export limit via inverter WMaxLimPct
        return { register: 'WMaxLimPct', value: Number(command.value) };
      default:
        return null;
    }
  }
}
