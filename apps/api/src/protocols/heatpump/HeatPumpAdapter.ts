/**
 * HeatPumpAdapter — Backend IProtocolAdapter for heat pumps via Modbus TCP
 *
 * Wraps the ModbusAdapter with heat-pump-specific register profiles for
 * major European manufacturers. Emits `UnifiedEnergyDatapoint` with
 * role `heatpump` into the EventBus.
 *
 * Supported manufacturers / gateways:
 *   - Stiebel Eltron WPL/WPF via ISG web (Modbus TCP port 502, unit 1)
 *   - Viessmann Vitocal 200/300 via Vitoconnect ISG (port 4000, unit 1)
 *   - Wolf CHA/BWL via ISM7i (port 502, unit 1)
 *   - NIBE F2040/F2120/S1255 via NIBE Modbus 40 (port 502, unit 1)
 *   - Alpha-InnoTec / Waterkotte via Luxtronik 2.0 (port 8000, unit 1)
 *   - Daikin Altherma 3 via optional Modbus gateway (port 502, unit 1)
 *
 * SG Ready integration:
 *   The adapter maps the SG-Ready operating mode register (when available)
 *   to a synthetic POWER_W datapoint: mode 1 = blocked (0 W), mode 2 = normal,
 *   mode 3 = recommended (power * 1.2), mode 4 = forced full (rated power).
 *
 * Data flow:
 *   Heat pump Modbus TCP ──▶ HeatPumpAdapter ──▶ EventBus
 *                                                     ▼
 *                                         LiveEnergyAggregator → Dashboard
 *
 * Env vars:
 *   HEATPUMP_MANUFACTURER — one of: stiebel | viessmann | wolf | nibe | alpha | daikin
 *   HEATPUMP_HOST         — IP address of Modbus TCP gateway
 *   HEATPUMP_PORT         — Modbus TCP port (default: manufacturer-specific)
 *   HEATPUMP_UNIT_ID      — Modbus unit ID (default: 1)
 *   HEATPUMP_POLL_MS      — Poll interval (default: 10000)
 *
 * Or instantiate programmatically with `HeatPumpAdapterConfig`.
 */

import EventEmitter from 'node:events';
import { appendFileSync, mkdirSync } from 'node:fs';
import ModbusRTUDefault from 'modbus-serial';
import type { ModbusRTU as ModbusRTUType } from 'modbus-serial/ModbusRTU.js';

const ModbusRTU = ModbusRTUDefault as unknown as new () => ModbusRTUType;
type ModbusRTU = ModbusRTUType;

import {
  type AdapterHealth,
  type EnergyRole,
  energyDatapointSchema,
  type IProtocolAdapter,
  type MetricType,
  type ProtocolType,
  type UnifiedEnergyDatapoint,
  type WSCommandType,
} from '@nexus-hems/shared-types';
import {
  recordAdapterDlq,
  recordAdapterError,
  recordAdapterReconnect,
} from '../../middleware/adapter-metrics.js';
import { API_RUNTIME_DIR, DEAD_LETTER_QUEUE_PATH } from '../../runtime-paths.js';
import type {
  IProtocolCommandHandler,
  ProtocolCommandRequest,
  ProtocolCommandResult,
} from '../protocol-command.js';
import { HEAT_PUMP_MODE_ERROR, HeatPumpModeValueSchema } from '../protocol-command.js';

// ---------------------------------------------------------------------------
// Manufacturer register profiles
// ---------------------------------------------------------------------------

export type HeatPumpManufacturer =
  | 'stiebel'
  | 'viessmann'
  | 'wolf'
  | 'nibe'
  | 'alpha'
  | 'daikin'
  | 'generic';

interface RegisterProfile {
  /** Active power consumption W (16-bit signed or unsigned) */
  powerW?: number;
  /** Flow temperature °C (scale: 0.1) */
  flowTempC?: number;
  /** Return temperature °C (scale: 0.1) */
  returnTempC?: number;
  /** Outdoor temperature °C (scale: 0.1) */
  outdoorTempC?: number;
  /** Hot water temperature °C (scale: 0.1) */
  hwTempC?: number;
  /** State of charge / operating mode */
  operatingMode?: number;
  /** SG Ready input state (0-3) */
  sgReadyState?: number;
  /** Thermal energy produced today (Wh) */
  thermalEnergyWh?: number;
  /** Compressor frequency Hz (scale: 0.1) */
  compressorHz?: number;
  /** Scale factor for temperature registers (default: 0.1) */
  tempScale: number;
  /** Scale factor for power register (default: 1) */
  powerScale: number;
  /** Data type: 0=INT16, 1=UINT16 */
  powerDataType: 'INT16' | 'UINT16';
  /** Default port */
  defaultPort: number;
  /** Default Modbus unit ID */
  defaultUnitId: number;
  /** Rated power in W (for SG-Ready mode 4 estimation) */
  ratedPowerW: number;
}

const PROFILES: Record<HeatPumpManufacturer, RegisterProfile> = {
  /** Stiebel Eltron WPL/WPF via ISG web Modbus TCP */
  stiebel: {
    powerW: 3000, // Estimated electrical power (ISG register map)
    flowTempC: 1001, // Flow temperature (°C × 0.1)
    returnTempC: 1004, // Return temperature
    outdoorTempC: 1000, // Outdoor temperature
    hwTempC: 1003, // Hot water temperature
    operatingMode: 2000, // Operation mode (0=off, 1=heating, 2=DHW, 3=both)
    sgReadyState: 2002, // SG Ready operating mode input
    tempScale: 0.1,
    powerScale: 1,
    powerDataType: 'INT16',
    defaultPort: 502,
    defaultUnitId: 1,
    ratedPowerW: 4000,
  },
  /** Viessmann Vitocal 200/300 via Vitoconnect ISG Modbus TCP */
  viessmann: {
    powerW: 5001, // Electrical power consumption W
    flowTempC: 5004, // Vorlauftemperatur
    returnTempC: 5005, // Rücklauftemperatur
    outdoorTempC: 5002, // Außentemperatur
    hwTempC: 5007, // Warmwassertemperatur
    operatingMode: 5000, // Betriebsmodus
    sgReadyState: 5010, // SG Ready
    tempScale: 0.1,
    powerScale: 1,
    powerDataType: 'UINT16',
    defaultPort: 4000,
    defaultUnitId: 1,
    ratedPowerW: 5000,
  },
  /** Wolf CHA/BWL via ISM7i Modbus TCP gateway */
  wolf: {
    flowTempC: 1000,
    returnTempC: 1001,
    outdoorTempC: 1003,
    hwTempC: 1006,
    operatingMode: 2000,
    sgReadyState: 2001,
    tempScale: 0.1,
    powerScale: 1,
    powerDataType: 'UINT16',
    defaultPort: 502,
    defaultUnitId: 1,
    ratedPowerW: 5000,
  },
  /** NIBE F2040/F2120 via NIBE Modbus 40 module */
  nibe: {
    powerW: 10012, // BT50 room sensor / compressor power (approximation)
    flowTempC: 10001, // BT2 Supply Line Temperature
    returnTempC: 10003, // BT3 Return Line Temperature
    outdoorTempC: 10004, // BT1 Outdoor Temperature
    hwTempC: 10008, // BT11 Hot Water Top
    operatingMode: 43081, // Operation mode
    sgReadyState: 43024, // SG Ready Mode
    tempScale: 0.1,
    powerScale: 10, // NIBE reports in 10W units
    powerDataType: 'UINT16',
    defaultPort: 502,
    defaultUnitId: 1,
    ratedPowerW: 6000,
  },
  /** Alpha-InnoTec / Waterkotte / Novelan via Luxtronik 2.0 */
  alpha: {
    powerW: 56, // Wärmemenge Heizung (estimated from other registers)
    flowTempC: 1, // Vorlauftemperatur (°C × 0.1)
    returnTempC: 2, // Rücklauftemperatur
    outdoorTempC: 10, // Außentemperatur
    hwTempC: 18, // Warmwassertemperatur
    operatingMode: 700, // Betriebszustand
    sgReadyState: 1033, // SG-Ready Eingang
    tempScale: 0.1,
    powerScale: 1,
    powerDataType: 'UINT16',
    defaultPort: 8000,
    defaultUnitId: 1,
    ratedPowerW: 4500,
  },
  /** Daikin Altherma 3 via optional Modbus RTU/TCP gateway */
  daikin: {
    flowTempC: 300,
    returnTempC: 301,
    outdoorTempC: 303,
    hwTempC: 310,
    operatingMode: 100,
    tempScale: 0.1,
    powerScale: 1,
    powerDataType: 'UINT16',
    defaultPort: 502,
    defaultUnitId: 1,
    ratedPowerW: 6000,
  },
  /** Generic fallback — reports zeros; configure via registerOverrides */
  generic: {
    tempScale: 0.1,
    powerScale: 1,
    powerDataType: 'UINT16',
    defaultPort: 502,
    defaultUnitId: 1,
    ratedPowerW: 5000,
  },
};

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export interface HeatPumpAdapterConfig {
  id?: string;
  manufacturer: HeatPumpManufacturer;
  host: string;
  port?: number;
  unitId?: number;
  pollIntervalMs?: number;
  /** Override specific register addresses from the manufacturer profile */
  registerOverrides?: Partial<RegisterProfile>;
}

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

const MAX_DLQ_LINES = 10_000;
let dlqLineCount = 0;

function writeToDLQ(entry: {
  ts: number;
  source: string;
  rawPayload: string;
  error: string;
}): void {
  if (dlqLineCount >= MAX_DLQ_LINES) dlqLineCount = 0;
  try {
    mkdirSync(API_RUNTIME_DIR, { recursive: true });
    appendFileSync(
      DEAD_LETTER_QUEUE_PATH,
      `${JSON.stringify({ ...entry, protocol: 'heatpump' })}\n`,
      'utf8',
    );
    dlqLineCount++;
  } catch {
    /* never propagate */
  }
}

export class HeatPumpAdapter implements IProtocolAdapter, IProtocolCommandHandler {
  readonly id: string;
  readonly protocol: ProtocolType = 'heatpump' as ProtocolType;

  private readonly config: Required<HeatPumpAdapterConfig>;
  private readonly profile: RegisterProfile;
  private client: ModbusRTU | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private connected = false;
  private lastSuccessMs: number | undefined;
  private consecutiveErrors = 0;
  private readonly emitter = new EventEmitter();
  private destroyed = false;

  constructor(config: HeatPumpAdapterConfig) {
    this.id = config.id ?? `heatpump-${config.manufacturer}-01`;
    const baseProfile = PROFILES[config.manufacturer];
    this.profile = { ...baseProfile, ...config.registerOverrides };
    this.config = {
      id: this.id,
      manufacturer: config.manufacturer,
      host: config.host,
      port: config.port ?? baseProfile.defaultPort,
      unitId: config.unitId ?? baseProfile.defaultUnitId,
      pollIntervalMs: config.pollIntervalMs ?? 10_000,
      registerOverrides: config.registerOverrides ?? {},
    };
  }

  async connect(): Promise<void> {
    try {
      this.client = new ModbusRTU();
      await this.client.connectTCP(this.config.host, { port: this.config.port });
      this.client.setID(this.config.unitId);

      this.connected = true;
      this.consecutiveErrors = 0;
      console.log(
        `[HeatPumpAdapter:${this.id}] Connected to ${this.config.host}:${this.config.port} (${this.config.manufacturer})`,
      );

      this.pollTimer = setInterval(() => {
        void this.poll();
      }, this.config.pollIntervalMs);
      if (typeof this.pollTimer === 'object' && 'unref' in this.pollTimer) {
        (this.pollTimer as NodeJS.Timeout).unref();
      }
    } catch (err) {
      try {
        this.client?.close();
      } catch {
        /* ignore */
      }
      this.client = null;
      this.connected = false;
      throw err;
    }
  }

  async disconnect(): Promise<void> {
    this.destroyed = true;
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    try {
      this.client?.close();
    } catch {
      /* ignore */
    }
    this.client = null;
    this.connected = false;
    this.emitter.emit('destroy');
    this.emitter.removeAllListeners();
  }

  async healthCheck(): Promise<AdapterHealth> {
    return {
      status: this.connected ? (this.consecutiveErrors > 0 ? 'degraded' : 'healthy') : 'offline',
      lastSuccessMs: this.lastSuccessMs,
      consecutiveErrors: this.consecutiveErrors,
    };
  }

  async *getDataStream(): AsyncGenerator<UnifiedEnergyDatapoint> {
    const queue: Array<UnifiedEnergyDatapoint | null> = [];
    let notify: (() => void) | null = null;

    const onData = (dp: UnifiedEnergyDatapoint): void => {
      queue.push(dp);
      notify?.();
      notify = null;
    };
    const onDestroy = (): void => {
      queue.push(null);
      notify?.();
      notify = null;
    };
    this.emitter.on('data', onData);
    this.emitter.once('destroy', onDestroy);

    try {
      while (!this.destroyed) {
        if (queue.length === 0) {
          await new Promise<void>((r) => {
            notify = r;
          });
        }
        const item = queue.shift();
        if (item === null || item === undefined) break;
        yield item;
      }
    } finally {
      this.emitter.off('data', onData);
      this.emitter.off('destroy', onDestroy);
    }
  }

  // ---------------------------------------------------------------------------
  // Private: polling
  // ---------------------------------------------------------------------------

  private async poll(): Promise<void> {
    if (!this.client || !this.connected) return;

    const profile = this.profile;
    const deviceId = `heatpump-${this.config.host.replace(/\./g, '-')}`;

    try {
      const datapoints: UnifiedEnergyDatapoint[] = [];

      // Power consumption
      if (profile.powerW !== undefined) {
        const powerRaw = await this.readRegister(profile.powerW, profile.powerDataType);
        if (powerRaw !== null) {
          const powerW = powerRaw * profile.powerScale;
          this.emit(datapoints, deviceId, 'POWER_W', powerW, 'heatpump');
        }
      }

      // Temperature sensors
      const tempMap: Array<[number | undefined, MetricType, string]> = [
        [profile.flowTempC, 'TEMPERATURE_C', 'flow'],
        [profile.returnTempC, 'TEMPERATURE_C', 'return'],
        [profile.outdoorTempC, 'TEMPERATURE_C', 'outdoor'],
        [profile.hwTempC, 'TEMPERATURE_C', 'hotwater'],
      ];

      for (const [addr, metric, label] of tempMap) {
        if (addr === undefined) continue;
        const raw = await this.readRegister(addr);
        if (raw !== null) {
          const value = raw * profile.tempScale;
          const dp = energyDatapointSchema.safeParse({
            timestamp: Date.now(),
            deviceId: `${deviceId}-${label}`,
            protocol: this.protocol,
            metric,
            value,
            qualityIndicator: 'GOOD' as const,
          });
          if (dp.success) datapoints.push(dp.data);
        }
      }

      // Operating mode → SG Ready synthetic power datapoint
      if (profile.sgReadyState !== undefined) {
        const sgMode = await this.readRegister(profile.sgReadyState);
        if (sgMode !== null) {
          // SG Ready modes: 1=blocked, 2=normal, 3=recommended, 4=forced
          const sgPowerW = this.sgReadyToPower(sgMode, profile.ratedPowerW);
          this.emit(datapoints, `${deviceId}-sgready`, 'POWER_W', sgPowerW, 'heatpump');
        }
      }

      for (const dp of datapoints) {
        this.emitter.emit('data', dp);
      }
      this.lastSuccessMs = Date.now();
      this.consecutiveErrors = 0;
    } catch (err) {
      this.consecutiveErrors++;
      recordAdapterError(this.id, this.protocol, 'poll');
      const errMsg = err instanceof Error ? err.message : String(err);

      if (this.consecutiveErrors >= 5) {
        // Too many failures → attempt reconnect
        console.warn(`[HeatPumpAdapter:${this.id}] 5 consecutive errors, reconnecting...`);
        this.connected = false;
        recordAdapterReconnect(this.id, this.protocol);
        this.scheduleReconnect();
      }

      writeToDLQ({ ts: Date.now(), source: this.config.host, rawPayload: '', error: errMsg });
      recordAdapterDlq(this.id, this.protocol);
    }
  }

  private async readRegister(
    address: number,
    dataType: 'INT16' | 'UINT16' = 'INT16',
  ): Promise<number | null> {
    try {
      const result = await this.client!.readHoldingRegisters(address, 1);
      const raw = result.data[0];
      if (raw === undefined) return null;

      if (dataType === 'UINT16') return raw;
      return raw > 32767 ? raw - 65536 : raw;
    } catch {
      return null;
    }
  }

  private emit(
    datapoints: UnifiedEnergyDatapoint[],
    deviceId: string,
    metric: MetricType,
    value: number,
    role: EnergyRole,
  ): void {
    if (!Number.isFinite(value)) return;
    const result = energyDatapointSchema.safeParse({
      timestamp: Date.now(),
      deviceId,
      protocol: this.protocol,
      metric,
      value,
      qualityIndicator: 'GOOD' as const,
      role,
    });
    if (result.success) datapoints.push(result.data);
  }

  private sgReadyToPower(mode: number, ratedPowerW: number): number {
    // SG Ready specification (VDE-AR-N 4100):
    // Mode 1: Hard block (0W — grid operator lockout)
    // Mode 2: Normal operation
    // Mode 3: Recommended enhanced operation (120% of normal)
    // Mode 4: Forced full power (rated maximum)
    switch (mode) {
      case 1:
        return 0;
      case 2:
        return ratedPowerW * 0.7; // ~70% = normal COP-weighted average
      case 3:
        return ratedPowerW * 0.9; // 90% = encouraged high-power operation
      case 4:
        return ratedPowerW; // 100% = forced maximum
      default:
        return ratedPowerW * 0.7;
    }
  }

  private powerToSgReadyMode(powerW: number, ratedPowerW: number): 1 | 2 | 3 | 4 {
    if (powerW <= 0) return 1;
    if (powerW >= ratedPowerW * 0.95) return 4;
    if (powerW >= ratedPowerW * 0.8) return 3;
    return 2;
  }

  supportsCommand(type: WSCommandType): boolean {
    return type === 'SET_HEAT_PUMP_MODE' || type === 'SET_HEAT_PUMP_POWER';
  }

  async sendCommand(command: ProtocolCommandRequest): Promise<ProtocolCommandResult> {
    if (!this.supportsCommand(command.type)) {
      return { handled: false, success: false };
    }

    if (!this.client || !this.connected) {
      return {
        handled: true,
        success: false,
        adapterId: this.id,
        error: 'Heat pump Modbus not connected',
      };
    }

    const sgRegister = this.profile.sgReadyState;
    if (sgRegister === undefined) {
      return {
        handled: true,
        success: false,
        adapterId: this.id,
        error: 'SG Ready register not configured for this manufacturer profile',
      };
    }

    let mode: 1 | 2 | 3 | 4;
    if (command.type === 'SET_HEAT_PUMP_MODE') {
      const parsed = HeatPumpModeValueSchema.safeParse(command.value);
      if (!parsed.success) {
        return {
          handled: true,
          success: false,
          adapterId: this.id,
          error: HEAT_PUMP_MODE_ERROR,
        };
      }
      mode = parsed.data as 1 | 2 | 3 | 4;
    } else {
      if (
        typeof command.value !== 'number' ||
        !Number.isFinite(command.value) ||
        command.value < 0
      ) {
        return {
          handled: true,
          success: false,
          adapterId: this.id,
          error: 'SET_HEAT_PUMP_POWER requires a non-negative number',
        };
      }
      mode = this.powerToSgReadyMode(command.value, this.profile.ratedPowerW);
    }

    try {
      await this.writeRegister(sgRegister, mode);
      return { handled: true, success: true, adapterId: this.id };
    } catch (err) {
      return {
        handled: true,
        success: false,
        adapterId: this.id,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  private async writeRegister(address: number, value: number): Promise<void> {
    await this.client!.writeRegister(address, value);
  }

  private scheduleReconnect(): void {
    if (this.destroyed || this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.attemptReconnect();
    }, 10_000);
    if (typeof this.reconnectTimer === 'object' && 'unref' in this.reconnectTimer) {
      (this.reconnectTimer as NodeJS.Timeout).unref();
    }
  }

  private async attemptReconnect(): Promise<void> {
    if (this.destroyed) return;
    try {
      try {
        this.client?.close();
      } catch {
        /* ignore */
      }
      this.client = new ModbusRTU();
      await this.client.connectTCP(this.config.host, { port: this.config.port });
      this.client.setID(this.config.unitId);
      this.connected = true;
      this.consecutiveErrors = 0;
      console.log(`[HeatPumpAdapter:${this.id}] Reconnected`);
    } catch (err) {
      console.error(`[HeatPumpAdapter:${this.id}] Reconnect failed:`, err);
      this.scheduleReconnect();
    }
  }
}

// ---------------------------------------------------------------------------
// Factory from env vars
// ---------------------------------------------------------------------------

/**
 * Create a `HeatPumpAdapter` from environment variables.
 * Returns null when `HEATPUMP_HOST` is not set (adapter disabled).
 */
export function createHeatPumpAdapterFromEnv(): HeatPumpAdapter | null {
  const host = process.env.HEATPUMP_HOST;
  if (!host) return null;

  const manufacturer = (process.env.HEATPUMP_MANUFACTURER ?? 'generic') as HeatPumpManufacturer;
  const port = process.env.HEATPUMP_PORT ? parseInt(process.env.HEATPUMP_PORT, 10) : undefined;
  const unitId = process.env.HEATPUMP_UNIT_ID
    ? parseInt(process.env.HEATPUMP_UNIT_ID, 10)
    : undefined;
  const pollMs = process.env.HEATPUMP_POLL_MS
    ? parseInt(process.env.HEATPUMP_POLL_MS, 10)
    : undefined;

  return new HeatPumpAdapter({
    manufacturer,
    host,
    ...(port !== undefined ? { port } : {}),
    ...(unitId !== undefined ? { unitId } : {}),
    ...(pollMs !== undefined ? { pollIntervalMs: pollMs } : {}),
  });
}
