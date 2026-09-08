/**
 * HomeAssistantProtocolAdapter — Backend IProtocolAdapter for Home Assistant.
 *
 * Phase 1 (MVP): ha-ws-api transport — WebSocket API at `/api/websocket`,
 * Long-Lived Access Token auth, `state_changed` subscription, static entity map
 * + device_class heuristics. Phase 5: EV wallbox commands via `call_service`.
 *
 * Env vars (live mode only):
 *   HA_HOST              — HA hostname (required to enable)
 *   HA_PORT              — WebSocket port (default: 8123)
 *   HA_TLS               — "true" for wss://
 *   HA_TOKEN             — Long-Lived Access Token (required)
 *   HA_ADAPTER_ID        — adapter instance id (default: homeassistant-01)
 *   HA_DEVICE_ID         — deviceId prefix for datapoints (default: ha-site)
 *   HA_ENTITY_MAP_PATH   — override path to entity map JSON
 *   HA_WALLBOX_CURRENT_ENTITY — number entity for max current (optional)
 *   HA_WALLBOX_SWITCH_ENTITY  — switch entity for start/stop (optional)
 *   HA_WALLBOX_MAINS_VOLTAGE  — mains voltage for SET_EV_POWER→amps (default: 230)
 */

import EventEmitter from 'node:events';
import { appendFileSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  type AdapterHealth,
  energyDatapointSchema,
  type IProtocolAdapter,
  type ProtocolType,
  type UnifiedEnergyDatapoint,
  type WSCommandType,
} from '@nexus-hems/shared-types';
import { WebSocket } from 'ws';
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
import { HeatPumpModeValueSchema, parseOptionalMainsVoltageEnv } from '../protocol-command.js';
import { resolveHeatPumpModeServiceCall } from './ha-mqtt-command-mapper.js';
import {
  type HAEntityMapping,
  parseHANumericState,
  resolveHAEntityRole,
} from './ha-role-resolver.js';

const HA_WS_COMMANDS = new Set<WSCommandType>([
  'SET_EV_POWER',
  'SET_EV_CURRENT',
  'START_CHARGING',
  'STOP_CHARGING',
  'SET_HEAT_PUMP_MODE',
]);
const CONNECT_TIMEOUT_MS = 15_000;
const CALL_SERVICE_TIMEOUT_MS = 10_000;
const DEFAULT_MAINS_VOLTAGE = 230;
const MAX_DLQ_LINES = 10_000;
let dlqLineCount = 0;

interface PendingServiceCall {
  resolve: (success: boolean, error?: string) => void;
  timer: ReturnType<typeof setTimeout>;
}

interface HAStateChangedEvent {
  event_type: 'state_changed';
  data: {
    entity_id: string;
    new_state: {
      state: string;
      attributes: {
        unit_of_measurement?: string;
        device_class?: string;
        friendly_name?: string;
      };
    } | null;
  };
}

interface HAWSMessage {
  id?: number;
  type: string;
  access_token?: string;
  event_filter?: { event_type?: string };
  event?: HAStateChangedEvent;
  success?: boolean;
  error?: { code: string; message: string };
  domain?: string;
  service?: string;
  target?: { entity_id: string };
  service_data?: Record<string, unknown>;
}

export interface HomeAssistantProtocolAdapterConfig {
  id: string;
  host: string;
  port?: number;
  tls?: boolean;
  token: string;
  deviceId?: string;
  entityMappings?: HAEntityMapping[];
  wallboxCurrentEntityId?: string;
  wallboxSwitchEntityId?: string;
  heatPumpModeEntityId?: string;
  mainsVoltage?: number;
}

interface DLQEntry {
  ts: number;
  source: string;
  rawPayload: string;
  error: string;
  protocol: ProtocolType;
}

export class HomeAssistantProtocolAdapter implements IProtocolAdapter, IProtocolCommandHandler {
  readonly id: string;
  readonly protocol: ProtocolType = 'homeassistant-mqtt';

  private readonly config: Required<
    Pick<HomeAssistantProtocolAdapterConfig, 'host' | 'port' | 'tls' | 'token'>
  > &
    HomeAssistantProtocolAdapterConfig;
  private readonly deviceId: string;
  private readonly entityMap: Map<string, HAEntityMapping>;
  private readonly wallboxCurrentEntityId: string | undefined;
  private readonly wallboxSwitchEntityId: string | undefined;
  private readonly heatPumpModeEntityId: string | undefined;
  private readonly mainsVoltage: number;
  private ws: WebSocket | null = null;
  private wsMsgId = 1;
  private readonly pendingServiceCalls = new Map<number, PendingServiceCall>();
  private connected = false;
  private destroyed = false;
  private lastSuccessMs: number | undefined;
  private consecutiveErrors = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempt = 0;
  private readonly emitter = new EventEmitter();

  constructor(config: HomeAssistantProtocolAdapterConfig) {
    this.config = {
      ...config,
      port: config.port ?? 8123,
      tls: config.tls ?? false,
    };
    this.id = config.id;
    this.deviceId = config.deviceId ?? 'ha-site';
    this.entityMap = new Map((config.entityMappings ?? []).map((entry) => [entry.entityId, entry]));
    this.wallboxCurrentEntityId =
      config.wallboxCurrentEntityId ?? resolveWallboxCurrentEntity(this.entityMap);
    this.wallboxSwitchEntityId =
      config.wallboxSwitchEntityId ?? resolveWallboxSwitchEntity(this.entityMap);
    this.heatPumpModeEntityId = config.heatPumpModeEntityId;
    this.mainsVoltage =
      config.mainsVoltage !== undefined &&
      Number.isFinite(config.mainsVoltage) &&
      config.mainsVoltage > 0
        ? config.mainsVoltage
        : DEFAULT_MAINS_VOLTAGE;
  }

  async connect(): Promise<void> {
    if (this.destroyed) return;
    await this.openWebSocket();
  }

  async disconnect(): Promise<void> {
    this.destroyed = true;
    for (const pending of this.pendingServiceCalls.values()) {
      clearTimeout(pending.timer);
      pending.resolve(false, 'Disconnected');
    }
    this.pendingServiceCalls.clear();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.removeAllListeners();
      this.ws.close();
      this.ws = null;
    }
    this.connected = false;
    this.emitter.emit('destroy');
  }

  async healthCheck(): Promise<AdapterHealth> {
    if (this.destroyed) {
      return { status: 'offline', consecutiveErrors: this.consecutiveErrors };
    }
    if (this.connected) {
      return {
        status: 'healthy',
        ...(this.lastSuccessMs !== undefined ? { lastSuccessMs: this.lastSuccessMs } : {}),
        consecutiveErrors: this.consecutiveErrors,
      };
    }
    return {
      status: 'offline',
      errorMessage: 'HA WebSocket not connected',
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
          await new Promise<void>((resolve) => {
            notify = resolve;
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
    if (this.ws) {
      this.ws.removeAllListeners();
      this.ws.close();
      this.ws = null;
    }

    const protocol = this.config.tls ? 'wss' : 'ws';
    const url = `${protocol}://${this.config.host}:${this.config.port}/api/websocket`;

    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url);
      this.ws = ws;
      let settled = false;

      const timeout = setTimeout(() => {
        if (!settled) {
          settled = true;
          reject(new Error('HA WebSocket connection timeout'));
        }
      }, CONNECT_TIMEOUT_MS);

      const finish = (err?: Error): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        if (err) reject(err);
        else resolve();
      };

      ws.on('message', (raw) => {
        try {
          const msg = JSON.parse(String(raw)) as HAWSMessage;
          this.handleWsMessage(
            msg,
            () => finish(),
            (err) => finish(err),
          );
        } catch (err) {
          recordAdapterError(this.id, this.protocol, 'parse_error');
          this.consecutiveErrors++;
          writeToDLQ({
            ts: Date.now(),
            source: url,
            rawPayload: String(raw).slice(0, 4096),
            error: err instanceof Error ? err.message : String(err),
            protocol: this.protocol,
          });
        }
      });

      ws.on('error', () => {
        recordAdapterError(this.id, this.protocol, 'ws_error');
        this.consecutiveErrors++;
        finish(new Error('HA WebSocket connection error'));
      });

      ws.on('close', () => {
        this.connected = false;
        if (!this.destroyed) {
          this.scheduleReconnect();
        }
      });
    });
  }

  private handleWsMessage(
    msg: HAWSMessage,
    onReady: () => void,
    onFail: (err: Error) => void,
  ): void {
    switch (msg.type) {
      case 'auth_required':
        this.sendWs({ type: 'auth', access_token: this.config.token });
        break;
      case 'auth_ok':
        this.connected = true;
        this.reconnectAttempt = 0;
        this.subscribeStateChanges();
        onReady();
        break;
      case 'auth_invalid':
        onFail(new Error('HA authentication invalid'));
        break;
      case 'event':
        if (msg.event?.event_type === 'state_changed') {
          this.handleStateChanged(msg.event);
        }
        break;
      case 'result':
        if (msg.id !== undefined) {
          this.resolvePendingServiceCall(msg.id, msg.success !== false, msg.error?.message);
        }
        break;
      default:
        break;
    }
  }

  private subscribeStateChanges(): void {
    this.sendWs({
      id: this.wsMsgId++,
      type: 'subscribe_events',
      event_filter: { event_type: 'state_changed' },
    });
  }

  private handleStateChanged(event: HAStateChangedEvent): void {
    const { entity_id: entityId, new_state: newState } = event.data;
    if (!newState) return;

    const deviceClass = newState.attributes.device_class ?? '';
    const unit = newState.attributes.unit_of_measurement ?? '';
    const resolution = resolveHAEntityRole(entityId, deviceClass, unit, this.entityMap);
    if (!resolution) return;

    const value = parseHANumericState(newState.state, unit, resolution.metric, resolution.scale);
    if (value === null) {
      writeToDLQ({
        ts: Date.now(),
        source: entityId,
        rawPayload: newState.state,
        error: 'non_numeric_state',
        protocol: this.protocol,
      });
      recordAdapterDlq(this.id, this.protocol);
      return;
    }

    const datapoint = energyDatapointSchema.safeParse({
      timestamp: Date.now(),
      deviceId: `${this.deviceId}:${entityId}`,
      protocol: this.protocol,
      metric: resolution.metric,
      value,
      qualityIndicator: 'GOOD',
      role: resolution.role,
    });

    if (!datapoint.success) {
      writeToDLQ({
        ts: Date.now(),
        source: entityId,
        rawPayload: newState.state,
        error: datapoint.error.message,
        protocol: this.protocol,
      });
      recordAdapterDlq(this.id, this.protocol);
      return;
    }

    this.lastSuccessMs = Date.now();
    this.consecutiveErrors = 0;
    this.emitter.emit('data', datapoint.data);
  }

  private sendWs(payload: HAWSMessage): void {
    this.ws?.send(JSON.stringify(payload));
  }

  supportsCommand(type: WSCommandType): boolean {
    return HA_WS_COMMANDS.has(type);
  }

  async sendCommand(command: ProtocolCommandRequest): Promise<ProtocolCommandResult> {
    if (!this.supportsCommand(command.type)) {
      return { handled: false, success: false };
    }

    if (!this.connected || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return {
        handled: true,
        success: false,
        adapterId: this.id,
        error: 'HA WebSocket not connected',
      };
    }

    const serviceCall = this.mapCommandToHAService(command);
    if (!serviceCall) {
      const needsNumeric = command.type === 'SET_EV_POWER' || command.type === 'SET_EV_CURRENT';
      if (
        needsNumeric &&
        (typeof command.value !== 'number' || !Number.isFinite(command.value) || command.value < 0)
      ) {
        return {
          handled: true,
          success: false,
          adapterId: this.id,
          error: `${command.type} requires a non-negative number`,
        };
      }
      if (
        command.type === 'SET_HEAT_PUMP_MODE' ||
        command.type === 'START_CHARGING' ||
        command.type === 'STOP_CHARGING'
      ) {
        return { handled: false, success: false };
      }
      return {
        handled: true,
        success: false,
        adapterId: this.id,
        error: 'Wallbox entities not configured for HA commands',
      };
    }

    const msgId = this.wsMsgId++;

    return new Promise<ProtocolCommandResult>((resolve) => {
      const timer = setTimeout(() => {
        this.pendingServiceCalls.delete(msgId);
        resolve({
          handled: true,
          success: false,
          adapterId: this.id,
          error: 'HA call_service timeout',
        });
      }, CALL_SERVICE_TIMEOUT_MS);

      this.pendingServiceCalls.set(msgId, {
        resolve: (success, error) => {
          clearTimeout(timer);
          this.pendingServiceCalls.delete(msgId);
          resolve(
            success
              ? { handled: true, success: true, adapterId: this.id }
              : {
                  handled: true,
                  success: false,
                  adapterId: this.id,
                  error: error ?? 'HA call_service failed',
                },
          );
        },
        timer,
      });

      this.sendWs({
        id: msgId,
        type: 'call_service',
        domain: serviceCall.domain,
        service: serviceCall.service,
        ...(serviceCall.target ? { target: serviceCall.target } : {}),
        ...(serviceCall.serviceData ? { service_data: serviceCall.serviceData } : {}),
      });
    });
  }

  private resolvePendingServiceCall(msgId: number, success: boolean, error?: string): void {
    const pending = this.pendingServiceCalls.get(msgId);
    if (!pending) return;
    clearTimeout(pending.timer);
    this.pendingServiceCalls.delete(msgId);
    pending.resolve(success, error);
  }

  private mapCommandToHAService(command: ProtocolCommandRequest): {
    domain: string;
    service: string;
    target?: { entity_id: string };
    serviceData?: Record<string, unknown>;
  } | null {
    switch (command.type) {
      case 'SET_EV_CURRENT':
        if (
          typeof command.value !== 'number' ||
          !Number.isFinite(command.value) ||
          command.value < 0
        ) {
          return null;
        }
        if (!this.wallboxCurrentEntityId) return null;
        return {
          domain: 'number',
          service: 'set_value',
          target: { entity_id: this.wallboxCurrentEntityId },
          serviceData: { value: command.value },
        };
      case 'SET_EV_POWER': {
        if (
          typeof command.value !== 'number' ||
          !Number.isFinite(command.value) ||
          command.value < 0
        ) {
          return null;
        }
        if (!this.wallboxCurrentEntityId) return null;
        const currentA = Math.round((command.value / this.mainsVoltage) * 10) / 10;
        return {
          domain: 'number',
          service: 'set_value',
          target: { entity_id: this.wallboxCurrentEntityId },
          serviceData: { value: currentA },
        };
      }
      case 'START_CHARGING':
        if (!this.wallboxSwitchEntityId) return null;
        return {
          domain: 'switch',
          service: 'turn_on',
          target: { entity_id: this.wallboxSwitchEntityId },
        };
      case 'STOP_CHARGING':
        if (!this.wallboxSwitchEntityId) return null;
        return {
          domain: 'switch',
          service: 'turn_off',
          target: { entity_id: this.wallboxSwitchEntityId },
        };
      case 'SET_HEAT_PUMP_MODE': {
        const mode = HeatPumpModeValueSchema.safeParse(command.value);
        if (!mode.success || !this.heatPumpModeEntityId) return null;
        const resolved = resolveHeatPumpModeServiceCall(this.heatPumpModeEntityId, mode.data);
        if ('error' in resolved) return null;
        const { entity_id, ...serviceData } = resolved.payload as {
          entity_id: string;
          value?: number;
          option?: string;
        };
        return {
          domain: resolved.domain,
          service: resolved.service,
          target: { entity_id },
          serviceData,
        };
      }
      default:
        return null;
    }
  }

  private scheduleReconnect(): void {
    if (this.destroyed || this.reconnectTimer) return;
    const delay = Math.min(60_000, 1000 * 2 ** this.reconnectAttempt);
    this.reconnectAttempt++;
    recordAdapterReconnect(this.id, this.protocol);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.openWebSocket().catch(() => {
        this.scheduleReconnect();
      });
    }, delay);
  }
}

export function loadHAEntityMappings(path: string): HAEntityMapping[] {
  try {
    const raw = readFileSync(path, 'utf8');
    return JSON.parse(raw) as HAEntityMapping[];
  } catch (err) {
    console.warn('[HomeAssistantProtocolAdapter] ha-entity-map.json not found or invalid:', err);
    return [];
  }
}

export function createHomeAssistantAdapterFromEnv(
  env: NodeJS.ProcessEnv = process.env,
  entityMappings?: HAEntityMapping[],
): HomeAssistantProtocolAdapter | null {
  const host = env.HA_HOST?.trim();
  const token = env.HA_TOKEN?.trim();
  if (!host || !token) return null;

  const mapPath =
    env.HA_ENTITY_MAP_PATH?.trim() ||
    join(dirname(fileURLToPath(import.meta.url)), '../../data/ha-entity-map.json');

  const entityMappingsResolved = entityMappings ?? loadHAEntityMappings(mapPath);
  if (entityMappingsResolved.length === 0) {
    console.warn(
      '[Adapters] HA_HOST/HA_TOKEN set but ha-entity-map.json is empty — copy ha-entity-map.example.json',
    );
  }

  const mainsVoltage = parseOptionalMainsVoltageEnv(env.HA_WALLBOX_MAINS_VOLTAGE);

  return new HomeAssistantProtocolAdapter({
    id: env.HA_ADAPTER_ID?.trim() || 'homeassistant-01',
    host,
    port: env.HA_PORT ? Number(env.HA_PORT) : 8123,
    tls: env.HA_TLS === 'true',
    token,
    deviceId: env.HA_DEVICE_ID?.trim() || 'ha-site',
    entityMappings: entityMappingsResolved,
    ...(env.HA_WALLBOX_CURRENT_ENTITY?.trim()
      ? { wallboxCurrentEntityId: env.HA_WALLBOX_CURRENT_ENTITY.trim() }
      : {}),
    ...(env.HA_WALLBOX_SWITCH_ENTITY?.trim()
      ? { wallboxSwitchEntityId: env.HA_WALLBOX_SWITCH_ENTITY.trim() }
      : {}),
    ...(env.HA_HEAT_PUMP_MODE_ENTITY?.trim()
      ? { heatPumpModeEntityId: env.HA_HEAT_PUMP_MODE_ENTITY.trim() }
      : {}),
    ...(mainsVoltage !== undefined ? { mainsVoltage } : {}),
  });
}

function resolveWallboxCurrentEntity(entityMap: Map<string, HAEntityMapping>): string | undefined {
  for (const [entityId, mapping] of entityMap) {
    if (mapping.role !== 'ev') continue;
    if (entityId.startsWith('number.')) return entityId;
  }
  return undefined;
}

function resolveWallboxSwitchEntity(entityMap: Map<string, HAEntityMapping>): string | undefined {
  for (const [entityId, mapping] of entityMap) {
    if (mapping.role !== 'ev') continue;
    if (entityId.startsWith('switch.')) return entityId;
  }
  return undefined;
}

function writeToDLQ(entry: DLQEntry): void {
  if (dlqLineCount >= MAX_DLQ_LINES) return;
  setImmediate(() => {
    try {
      mkdirSync(API_RUNTIME_DIR, { recursive: true });
      appendFileSync(DEAD_LETTER_QUEUE_PATH, `${JSON.stringify(entry)}\n`, 'utf8');
      dlqLineCount++;
    } catch {
      /* best-effort */
    }
  });
}
