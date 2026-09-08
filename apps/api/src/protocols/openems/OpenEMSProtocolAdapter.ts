/**
 * OpenEMSProtocolAdapter — Backend IProtocolAdapter for OpenEMS Edge JSON-RPC over WebSocket.
 *
 * Subscribes to OpenEMS sum-level channels and maps `currentData` notifications to
 * role-tagged UnifiedEnergyDatapoint values for the EventBus.
 *
 * Env vars (live mode only):
 *   OPENEMS_HOST          — Edge controller hostname (required to enable)
 *   OPENEMS_PORT          — WebSocket port (default: 8085)
 *   OPENEMS_TLS           — "true" for wss://
 *   OPENEMS_AUTH_TOKEN    — authenticateWithPassword password (default: user)
 *   OPENEMS_DEVICE_ID     — deviceId prefix for datapoints (default: openems-edge)
 *   OPENEMS_POLL_MS       — subscribe refresh interval (default: 5000)
 *   OPENEMS_EVCS_COMPONENT_ID — EVCS component id (default: evcs0)
 *   OPENEMS_EVCS_CTRL_ID      — EVCS controller id (default: ctrlEvcs0)
 *   OPENEMS_ESS_CTRL_ID         — ESS controller (default: ctrlEssFixActivePower0)
 *   OPENEMS_PEAK_SHAVING_CTRL_ID — peak shaving controller (default: ctrlPeakShaving0)
 *   OPENEMS_HP_SGREADY_CTRL_ID   — SG Ready heat pump IO (default: ctrlIoHeatPumpSgReady0)
 */

import EventEmitter from 'node:events';
import { appendFileSync, mkdirSync } from 'node:fs';
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
import { WebSocket } from 'ws';
import {
  recordAdapterDlq,
  recordAdapterError,
  recordAdapterPollLatency,
  recordAdapterReconnect,
} from '../../middleware/adapter-metrics.js';
import { API_RUNTIME_DIR, DEAD_LETTER_QUEUE_PATH } from '../../runtime-paths.js';
import type {
  IProtocolCommandHandler,
  ProtocolCommandRequest,
  ProtocolCommandResult,
} from '../protocol-command.js';
import {
  BatteryModeValueSchema,
  BatteryPowerValueSchema,
  EvCurrentValueSchema,
  EvPowerValueSchema,
  GridLimitValueSchema,
  HEAT_PUMP_MODE_ERROR,
  HeatPumpModeValueSchema,
  SET_BATTERY_POWER_ERROR,
  SET_EV_CURRENT_ERROR,
  SET_EV_POWER_ERROR,
} from '../protocol-command.js';
import { isSafeComponentId, sanitizeWritableProperties } from './openems-writable-rules.js';

const OPENEMS_EV_COMMANDS = new Set<WSCommandType>([
  'SET_EV_POWER',
  'SET_EV_CURRENT',
  'START_CHARGING',
  'STOP_CHARGING',
]);

const OPENEMS_STORAGE_COMMANDS = new Set<WSCommandType>([
  'SET_BATTERY_POWER',
  'SET_BATTERY_MODE',
  'SET_GRID_LIMIT',
  'SET_HEAT_PUMP_MODE',
]);

const OPENEMS_COMMANDS = new Set<WSCommandType>([
  ...OPENEMS_EV_COMMANDS,
  ...OPENEMS_STORAGE_COMMANDS,
]);
const DEFAULT_POLL_INTERVAL_MS = 5000;
const CONNECT_TIMEOUT_MS = 15_000;
const RPC_TIMEOUT_MS = 10_000;
const MAX_DLQ_LINES = 10_000;
let dlqLineCount = 0;

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: string;
  method: string;
  params: Record<string, unknown>;
}

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id?: string;
  result?: Record<string, unknown>;
  error?: { code: number; message: string };
  method?: string;
  params?: { channels?: Array<{ address: string; value: unknown }> };
}

interface ChannelMapping {
  address: string;
  metric: MetricType;
  role: EnergyRole;
}

const DEFAULT_CHANNEL_MAPPINGS: readonly ChannelMapping[] = [
  { address: '_sum/ProductionActivePower', metric: 'POWER_W', role: 'pv' },
  { address: '_sum/EssActivePower', metric: 'POWER_W', role: 'battery' },
  { address: '_sum/EssSoc', metric: 'SOC_PERCENT', role: 'battery' },
  { address: '_sum/GridActivePower', metric: 'POWER_W', role: 'grid' },
  { address: '_sum/ConsumptionActivePower', metric: 'POWER_W', role: 'load' },
  { address: 'evcs0/ChargePower', metric: 'POWER_W', role: 'ev' },
] as const;

export interface OpenEMSProtocolAdapterConfig {
  id: string;
  host: string;
  port?: number;
  tls?: boolean;
  authToken?: string;
  deviceId?: string;
  pollIntervalMs?: number;
  evcsComponentId?: string;
  evcsControllerId?: string;
  essControllerId?: string;
  peakShavingControllerId?: string;
  hpSgReadyControllerId?: string;
}

interface DLQEntry {
  ts: number;
  source: string;
  rawPayload: string;
  error: string;
  protocol: ProtocolType;
}

export class OpenEMSProtocolAdapter implements IProtocolAdapter, IProtocolCommandHandler {
  readonly id: string;
  readonly protocol: ProtocolType = 'openems';

  private readonly config: Required<
    Pick<OpenEMSProtocolAdapterConfig, 'host' | 'port' | 'tls' | 'authToken' | 'pollIntervalMs'>
  > &
    OpenEMSProtocolAdapterConfig;
  private readonly deviceId: string;
  private readonly evcsComponentId: string;
  private readonly evcsControllerId: string;
  private readonly essControllerId: string;
  private readonly peakShavingControllerId: string;
  private readonly hpSgReadyControllerId: string;
  private ws: WebSocket | null = null;
  private sessionToken: string | null = null;
  private rpcId = 0;
  private pending = new Map<
    string,
    { resolve: (v: JsonRpcResponse) => void; reject: (e: Error) => void }
  >();
  private subscriptionTimer: ReturnType<typeof setInterval> | null = null;
  private connected = false;
  private destroyed = false;
  private lastSuccessMs: number | undefined;
  private consecutiveErrors = 0;
  private readonly emitter = new EventEmitter();

  constructor(config: OpenEMSProtocolAdapterConfig) {
    this.config = {
      ...config,
      port: config.port ?? 8085,
      tls: config.tls ?? false,
      authToken: config.authToken ?? 'user',
      pollIntervalMs: config.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS,
    };
    this.id = config.id;
    this.deviceId = config.deviceId ?? 'openems-edge';
    this.evcsComponentId = config.evcsComponentId ?? 'evcs0';
    this.evcsControllerId = config.evcsControllerId ?? 'ctrlEvcs0';
    this.essControllerId = config.essControllerId ?? 'ctrlEssFixActivePower0';
    this.peakShavingControllerId = config.peakShavingControllerId ?? 'ctrlPeakShaving0';
    this.hpSgReadyControllerId = config.hpSgReadyControllerId ?? 'ctrlIoHeatPumpSgReady0';
  }

  async connect(): Promise<void> {
    await this.openWebSocket();
    await this.authenticate();
    await this.subscribeChannels();
    this.startPolling();
    this.connected = true;
    this.consecutiveErrors = 0;
    this.lastSuccessMs = Date.now();
  }

  async disconnect(): Promise<void> {
    this.destroyed = true;
    if (this.subscriptionTimer !== null) {
      clearInterval(this.subscriptionTimer);
      this.subscriptionTimer = null;
    }
    for (const [, p] of this.pending) {
      p.reject(new Error('Disconnected'));
    }
    this.pending.clear();
    this.emitter.emit('destroy');
    this.emitter.removeAllListeners();
    if (this.ws) {
      this.ws.removeAllListeners();
      if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
        this.ws.close(1000, 'disconnect');
      }
      this.ws = null;
    }
    this.connected = false;
    this.sessionToken = null;
  }

  async healthCheck(): Promise<AdapterHealth> {
    return {
      status: this.connected ? (this.consecutiveErrors > 0 ? 'degraded' : 'healthy') : 'offline',
      lastSuccessMs: this.lastSuccessMs,
      errorMessage: this.connected
        ? this.consecutiveErrors > 0
          ? `${this.consecutiveErrors} consecutive errors`
          : undefined
        : `Disconnected from OpenEMS ${this.config.host}:${this.config.port}`,
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

  private openWebSocket(): Promise<void> {
    const protocol = this.config.tls ? 'wss' : 'ws';
    const url = `${protocol}://${this.config.host}:${this.config.port}/websocket`;

    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url);
      this.ws = ws;

      const timeout = setTimeout(() => {
        reject(new Error('OpenEMS WebSocket connection timeout'));
        ws.close();
      }, CONNECT_TIMEOUT_MS);

      ws.on('open', () => {
        clearTimeout(timeout);
        resolve();
      });

      ws.on('message', (data) => {
        this.handleMessage(
          typeof data === 'string' ? data : Buffer.from(data as Buffer).toString('utf8'),
        );
      });

      ws.on('error', () => {
        clearTimeout(timeout);
        reject(new Error('OpenEMS WebSocket error'));
      });

      ws.on('close', () => {
        if (!this.destroyed) {
          recordAdapterReconnect(this.id, this.protocol);
          this.connected = false;
        }
      });
    });
  }

  private handleMessage(raw: string): void {
    try {
      const msg = JSON.parse(raw) as JsonRpcResponse;

      if (msg.id && this.pending.has(msg.id)) {
        const p = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) {
          p?.reject(new Error(msg.error.message));
        } else {
          p?.resolve(msg);
        }
        return;
      }

      if (msg.method === 'currentData' && msg.params?.channels) {
        this.emitChannelDatapoints(msg.params.channels);
      }
    } catch (err) {
      recordAdapterError(this.id, this.protocol, 'parse');
      writeToDLQ({
        ts: Date.now(),
        source: 'openems-ws',
        rawPayload: raw.slice(0, 512),
        error: err instanceof Error ? err.message : String(err),
        protocol: this.protocol,
      });
      recordAdapterDlq(this.id, this.protocol);
    }
  }

  private async authenticate(): Promise<void> {
    const response = await this.rpcCall('authenticateWithPassword', {
      password: this.config.authToken,
    });
    const token = response.result?.token;
    if (typeof token === 'string') {
      this.sessionToken = token;
    }
  }

  private async subscribeChannels(): Promise<void> {
    const pollStarted = Date.now();
    try {
      await this.rpcCall('subscribeChannels', {
        count: 0,
        channels: DEFAULT_CHANNEL_MAPPINGS.map((m) => ({ address: m.address })),
      });
      this.lastSuccessMs = Date.now();
      this.consecutiveErrors = 0;
    } catch (err) {
      this.consecutiveErrors++;
      recordAdapterError(this.id, this.protocol, 'subscribe');
      writeToDLQ({
        ts: Date.now(),
        source: 'subscribeChannels',
        rawPayload: '',
        error: err instanceof Error ? err.message : String(err),
        protocol: this.protocol,
      });
      throw err;
    } finally {
      recordAdapterPollLatency(this.id, this.protocol, Date.now() - pollStarted);
    }
  }

  private startPolling(): void {
    this.subscriptionTimer = setInterval(() => {
      if (!this.destroyed) {
        void this.subscribeChannels().catch(() => {
          /* healthCheck reflects consecutiveErrors */
        });
      }
    }, this.config.pollIntervalMs);
  }

  private emitChannelDatapoints(channels: Array<{ address: string; value: unknown }>): void {
    const timestamp = Date.now();
    const byAddress = new Map(channels.map((c) => [c.address, c.value]));

    for (const mapping of DEFAULT_CHANNEL_MAPPINGS) {
      const raw = byAddress.get(mapping.address);
      const value = typeof raw === 'number' ? raw : Number(raw);
      if (!Number.isFinite(value)) continue;

      const candidate = {
        timestamp,
        deviceId: this.deviceId,
        protocol: this.protocol,
        metric: mapping.metric,
        value,
        qualityIndicator: 'GOOD' as const,
        role: mapping.role,
      };

      const parsed = energyDatapointSchema.safeParse(candidate);
      if (parsed.success) {
        this.emitter.emit('data', parsed.data);
        this.lastSuccessMs = timestamp;
      } else {
        writeToDLQ({
          ts: Date.now(),
          source: mapping.address,
          rawPayload: JSON.stringify(candidate),
          error: parsed.error.message,
          protocol: this.protocol,
        });
        recordAdapterDlq(this.id, this.protocol);
      }
    }
  }

  private rpcCall(method: string, params: Record<string, unknown>): Promise<JsonRpcResponse> {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        reject(new Error('WebSocket not connected'));
        return;
      }

      const id = `rpc-${++this.rpcId}`;
      const request: JsonRpcRequest = {
        jsonrpc: '2.0',
        id,
        method,
        params: this.sessionToken ? { ...params, token: this.sessionToken } : params,
      };

      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`RPC timeout: ${method}`));
      }, RPC_TIMEOUT_MS);

      this.pending.set(id, {
        resolve: (v) => {
          clearTimeout(timeout);
          resolve(v);
        },
        reject: (e) => {
          clearTimeout(timeout);
          reject(e);
        },
      });

      this.ws.send(JSON.stringify(request));
    });
  }

  supportsCommand(type: WSCommandType): boolean {
    return OPENEMS_COMMANDS.has(type);
  }

  async sendCommand(command: ProtocolCommandRequest): Promise<ProtocolCommandResult> {
    if (!this.supportsCommand(command.type)) {
      return { handled: false, success: false };
    }

    let gridLimitKw: number | undefined;
    if (command.type === 'SET_GRID_LIMIT') {
      const limit = GridLimitValueSchema.safeParse(command.value);
      if (!limit.success) {
        return { handled: false, success: false };
      }
      gridLimitKw = limit.data;
    }

    if (!this.connected || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return {
        handled: true,
        success: false,
        adapterId: this.id,
        error: 'OpenEMS WebSocket not connected',
      };
    }

    let ok = false;

    switch (command.type) {
      case 'SET_EV_POWER': {
        const power = EvPowerValueSchema.safeParse(command.value);
        if (!power.success) {
          return {
            handled: true,
            success: false,
            adapterId: this.id,
            error: SET_EV_POWER_ERROR,
          };
        }
        ok = await this.updateSafeComponentConfig(this.evcsComponentId, [
          { name: 'setChargePowerLimit', value: power.data },
        ]);
        break;
      }
      case 'SET_EV_CURRENT': {
        const current = EvCurrentValueSchema.safeParse(command.value);
        if (!current.success) {
          return {
            handled: true,
            success: false,
            adapterId: this.id,
            error: SET_EV_CURRENT_ERROR,
          };
        }
        const derivedPower = current.data * 230 * 3;
        ok = await this.updateSafeComponentConfig(this.evcsComponentId, [
          { name: 'setChargePowerLimit', value: derivedPower },
        ]);
        break;
      }
      case 'START_CHARGING':
        ok = await this.updateSafeComponentConfig(this.evcsControllerId, [
          { name: 'enabledCharging', value: true },
        ]);
        break;
      case 'STOP_CHARGING':
        ok = await this.updateSafeComponentConfig(this.evcsControllerId, [
          { name: 'enabledCharging', value: false },
        ]);
        break;
      case 'SET_BATTERY_POWER': {
        const power = BatteryPowerValueSchema.safeParse(command.value);
        if (!power.success) {
          return {
            handled: true,
            success: false,
            adapterId: this.id,
            error: SET_BATTERY_POWER_ERROR,
          };
        }
        ok = await this.updateSafeComponentConfig(this.essControllerId, [
          { name: 'power', value: power.data },
          {
            name: 'mode',
            value: power.data >= 0 ? 'CHARGE_GRID' : 'DISCHARGE_TO_GRID',
          },
        ]);
        break;
      }
      case 'SET_BATTERY_MODE': {
        const mode = BatteryModeValueSchema.safeParse(command.value);
        if (!mode.success) {
          return {
            handled: true,
            success: false,
            adapterId: this.id,
            error: 'SET_BATTERY_MODE requires charge or discharge',
          };
        }
        const mappedMode = mode.data === 'charge' ? 'CHARGE_GRID' : 'DISCHARGE_TO_GRID';
        ok = await this.updateSafeComponentConfig(this.essControllerId, [
          { name: 'mode', value: mappedMode },
        ]);
        break;
      }
      case 'SET_GRID_LIMIT': {
        if (gridLimitKw === undefined) {
          return {
            handled: true,
            success: false,
            adapterId: this.id,
            error: 'Internal error: grid limit not validated',
          };
        }
        ok = await this.updateSafeComponentConfig(this.peakShavingControllerId, [
          { name: 'peakShavingPower', value: gridLimitKw * 1000 },
        ]);
        break;
      }
      case 'SET_HEAT_PUMP_MODE': {
        const mode = HeatPumpModeValueSchema.safeParse(command.value);
        if (!mode.success) {
          return {
            handled: true,
            success: false,
            adapterId: this.id,
            error: HEAT_PUMP_MODE_ERROR,
          };
        }
        ok = await this.updateSafeComponentConfig(this.hpSgReadyControllerId, [
          { name: 'mode', value: mode.data },
        ]);
        break;
      }
      default:
        return { handled: false, success: false };
    }

    return ok
      ? { handled: true, success: true, adapterId: this.id }
      : {
          handled: true,
          success: false,
          adapterId: this.id,
          error: 'OpenEMS updateComponentConfig rejected or blocked',
        };
  }

  private async updateSafeComponentConfig(
    componentId: string,
    properties: Array<{ name: string; value: unknown }>,
  ): Promise<boolean> {
    if (!isSafeComponentId(componentId)) return false;

    const safeProperties = sanitizeWritableProperties(componentId, properties);
    if (safeProperties.length === 0) return false;

    try {
      await this.rpcCall('updateComponentConfig', {
        componentId,
        properties: safeProperties,
      });
      return true;
    } catch {
      return false;
    }
  }
}

export function createOpenEMSAdapterFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): OpenEMSProtocolAdapter | null {
  const host = env.OPENEMS_HOST?.trim();
  if (!host) return null;

  const pollMs = env.OPENEMS_POLL_MS ? Number(env.OPENEMS_POLL_MS) : undefined;

  return new OpenEMSProtocolAdapter({
    id: env.OPENEMS_ADAPTER_ID?.trim() || 'openems-01',
    host,
    port: env.OPENEMS_PORT ? Number(env.OPENEMS_PORT) : 8085,
    tls: env.OPENEMS_TLS === 'true',
    authToken: env.OPENEMS_AUTH_TOKEN?.trim() || 'user',
    deviceId: env.OPENEMS_DEVICE_ID?.trim() || 'openems-edge',
    evcsComponentId: env.OPENEMS_EVCS_COMPONENT_ID?.trim() || 'evcs0',
    evcsControllerId: env.OPENEMS_EVCS_CTRL_ID?.trim() || 'ctrlEvcs0',
    essControllerId: env.OPENEMS_ESS_CTRL_ID?.trim() || 'ctrlEssFixActivePower0',
    peakShavingControllerId: env.OPENEMS_PEAK_SHAVING_CTRL_ID?.trim() || 'ctrlPeakShaving0',
    hpSgReadyControllerId: env.OPENEMS_HP_SGREADY_CTRL_ID?.trim() || 'ctrlIoHeatPumpSgReady0',
    ...(pollMs !== undefined && Number.isFinite(pollMs) ? { pollIntervalMs: pollMs } : {}),
  });
}

function writeToDLQ(entry: DLQEntry): void {
  if (dlqLineCount >= MAX_DLQ_LINES) return;
  try {
    mkdirSync(API_RUNTIME_DIR, { recursive: true });
    appendFileSync(DEAD_LETTER_QUEUE_PATH, `${JSON.stringify(entry)}\n`, 'utf8');
    dlqLineCount++;
  } catch {
    /* best-effort */
  }
}
