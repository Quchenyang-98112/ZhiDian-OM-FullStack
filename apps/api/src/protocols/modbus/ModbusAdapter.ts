/**
 * ModbusAdapter — Backend protocol adapter for Modbus RTU/TCP.
 *
 * Reads SunSpec-compatible registers from inverters, batteries and energy meters.
 * Device configuration is loaded from src/data/device-map.json.
 *
 * Design:
 *  - One ModbusAdapter instance per device entry in device-map.json
 *  - Async generator yields validated UnifiedEnergyDatapoint values
 *  - Exponential backoff reconnect (1 s → 60 s cap)
 *  - Invalid register values routed to Dead-Letter Queue
 *  - Read-only mode enforced (no write registers in Phase 3)
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
} from '@nexus-hems/shared-types';
import {
  recordAdapterDlq,
  recordAdapterError,
  recordAdapterPollLatency,
  recordAdapterReconnect,
} from '../../middleware/adapter-metrics.js';
import { API_RUNTIME_DIR, DEAD_LETTER_QUEUE_PATH } from '../../runtime-paths.js';

const MAX_RECONNECT_DELAY_MS = 60_000;
const MAX_DLQ_LINES = 10_000;
let dlqLineCount = 0;

// Register types supported by readRegister(). Any type outside this set is
// logged as a warning and skipped rather than crashing the polling loop.
const SUPPORTED_DATA_TYPES = new Set<RegisterConfig['dataType']>([
  'INT16',
  'UINT16',
  'INT32',
  'UINT32',
  'FLOAT32',
]);

function validateRegisterConfig(registers: RegisterConfig[]): RegisterConfig[] {
  const valid: RegisterConfig[] = [];
  for (const reg of registers) {
    if (SUPPORTED_DATA_TYPES.has(reg.dataType)) {
      valid.push(reg);
    } else {
      console.warn(
        `[ModbusAdapter] Unsupported dataType "${reg.dataType as string}" on register ` +
          `address=${reg.address} label="${reg.label}" — skipping. ` +
          `Supported types: ${[...SUPPORTED_DATA_TYPES].join(', ')}`,
      );
    }
  }
  return valid;
}

// ---------------------------------------------------------------------------
// Device Map Schema (local to this file — full JSON schema in device-map.json)
// ---------------------------------------------------------------------------

interface RegisterConfig {
  address: number;
  metric: MetricType;
  scale: number;
  dataType: 'INT16' | 'UINT16' | 'INT32' | 'UINT32' | 'FLOAT32';
  byteOrder: 'BE' | 'LE';
  label: string;
  /** Optional role in the unified energy model (HIGH-17) — enables live UI data. */
  role?: EnergyRole;
}

export interface DeviceConfig {
  deviceId: string;
  label: string;
  host: string;
  port: number;
  protocol: ProtocolType;
  unitId: number;
  pollIntervalMs: number;
  inverterMaxWatts: number;
  registers: RegisterConfig[];
}

// ---------------------------------------------------------------------------
// ModbusAdapter
// ---------------------------------------------------------------------------

export class ModbusAdapter implements IProtocolAdapter {
  readonly id: string;
  readonly protocol: ProtocolType;

  private readonly client: ModbusRTU;
  private readonly device: DeviceConfig;
  private connected = false;
  private lastSuccessMs: number | undefined;
  private consecutiveErrors = 0;
  private readonly emitter = new EventEmitter();
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private destroyed = false;

  constructor(device: DeviceConfig) {
    const validRegisters = validateRegisterConfig(device.registers);
    this.device = { ...device, registers: validRegisters };
    this.id = device.deviceId;
    this.protocol = device.protocol;
    this.client = new ModbusRTU();
  }

  async connect(): Promise<void> {
    await this.connectWithBackoff();
  }

  async disconnect(): Promise<void> {
    this.destroyed = true;
    if (this.pollTimer !== null) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    this.emitter.removeAllListeners();
    if (this.connected) {
      this.client.close(() => {
        /* ignore close error */
      });
      this.connected = false;
    }
  }

  async healthCheck(): Promise<AdapterHealth> {
    return {
      status: this.connected ? (this.consecutiveErrors > 0 ? 'degraded' : 'healthy') : 'offline',
      lastSuccessMs: this.lastSuccessMs,
      errorMessage: this.connected
        ? this.consecutiveErrors > 0
          ? `${this.consecutiveErrors} consecutive read errors`
          : undefined
        : `Disconnected from ${this.device.host}:${this.device.port}`,
      consecutiveErrors: this.consecutiveErrors,
    };
  }

  async *getDataStream(): AsyncGenerator<UnifiedEnergyDatapoint> {
    this.startPolling();

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
      while (true) {
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
  // Private
  // ---------------------------------------------------------------------------

  private async connectWithBackoff(): Promise<void> {
    let attempt = 0;
    while (!this.connected && !this.destroyed) {
      try {
        this.client.setID(this.device.unitId);
        this.client.setTimeout(3000);
        await this.client.connectTCP(this.device.host, { port: this.device.port });
        this.connected = true;
        this.consecutiveErrors = 0;
        console.log(
          `[ModbusAdapter:${this.id}] Connected to ${this.device.host}:${this.device.port}`,
        );
      } catch (err) {
        attempt++;
        if (attempt > 1) {
          recordAdapterReconnect(this.id, this.protocol);
        }
        const delayMs = Math.min(1000 * 2 ** (attempt - 1), MAX_RECONNECT_DELAY_MS);
        console.warn('[ModbusAdapter] Connect attempt failed:', this.id, attempt, delayMs, err);
        await new Promise((r) => setTimeout(r, delayMs));
      }
    }
  }

  private startPolling(): void {
    this.pollTimer = setInterval(() => {
      if (!this.destroyed) {
        this.pollAllRegisters().catch((err: unknown) => {
          console.error('[ModbusAdapter] Poll error:', this.id, err);
        });
      }
    }, this.device.pollIntervalMs);
  }

  private async pollAllRegisters(): Promise<void> {
    if (!this.connected) {
      await this.connectWithBackoff();
      return;
    }

    const pollStarted = Date.now();

    for (const reg of this.device.registers) {
      try {
        const rawValue = await this.readRegister(reg);
        const scaledValue = rawValue * reg.scale;

        const candidate = {
          timestamp: Date.now(),
          deviceId: this.device.deviceId,
          protocol: this.device.protocol,
          metric: reg.metric,
          value: scaledValue,
          qualityIndicator: 'GOOD' as const,
          ...(reg.role ? { role: reg.role } : {}),
        };

        const result = energyDatapointSchema.safeParse(candidate);
        if (result.success) {
          this.emitter.emit('data', result.data);
          this.lastSuccessMs = Date.now();
          this.consecutiveErrors = 0;
        } else {
          writeToDLQ({
            ts: Date.now(),
            source: `${this.device.host}:${reg.address}`,
            rawPayload: JSON.stringify(candidate),
            error: result.error.message,
            protocol: this.device.protocol,
          });
          recordAdapterDlq(this.id, this.protocol);
        }
      } catch (err) {
        this.consecutiveErrors++;
        recordAdapterError(this.id, this.protocol, 'poll');
        if (this.consecutiveErrors >= 5) {
          this.connected = false;
          // Reconnect in background
          this.connectWithBackoff().catch(() => {
            /* handled inside connectWithBackoff */
          });
        }
        writeToDLQ({
          ts: Date.now(),
          source: `${this.device.host}:${reg.address}`,
          rawPayload: '',
          error: err instanceof Error ? err.message : String(err),
          protocol: this.device.protocol,
        });
      }
    }

    recordAdapterPollLatency(this.id, this.protocol, Date.now() - pollStarted);
  }

  private async readRegister(reg: RegisterConfig): Promise<number> {
    const count = reg.dataType === 'INT16' || reg.dataType === 'UINT16' ? 1 : 2;
    const data = await this.client.readHoldingRegisters(reg.address, count);

    switch (reg.dataType) {
      case 'INT16':
        return data.buffer.readInt16BE(0);
      case 'UINT16':
        return data.buffer.readUInt16BE(0);
      case 'INT32':
        return reg.byteOrder === 'BE' ? data.buffer.readInt32BE(0) : data.buffer.readInt32LE(0);
      case 'UINT32':
        return reg.byteOrder === 'BE' ? data.buffer.readUInt32BE(0) : data.buffer.readUInt32LE(0);
      case 'FLOAT32':
        return reg.byteOrder === 'BE' ? data.buffer.readFloatBE(0) : data.buffer.readFloatLE(0);
      default:
        throw new Error(`Unsupported dataType: ${reg.dataType as string}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Dead-Letter Queue (shared across instances)
// ---------------------------------------------------------------------------

interface DLQEntry {
  ts: number;
  source: string;
  rawPayload: string;
  error: string;
  protocol?: ProtocolType;
}

function writeToDLQ(entry: DLQEntry): void {
  if (dlqLineCount >= MAX_DLQ_LINES) {
    dlqLineCount = 0;
    // In production: rotate to dead-letter.ndjson.old-<timestamp>
  }
  try {
    mkdirSync(API_RUNTIME_DIR, { recursive: true });
    appendFileSync(DEAD_LETTER_QUEUE_PATH, `${JSON.stringify(entry)}\n`, 'utf8');
    dlqLineCount++;
  } catch {
    // Never let DLQ errors bubble up to the adapter
  }
}
