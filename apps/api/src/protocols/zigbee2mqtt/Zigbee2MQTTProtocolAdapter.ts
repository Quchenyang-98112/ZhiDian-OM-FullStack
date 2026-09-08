/**
 * Zigbee2MQTTProtocolAdapter — Backend IProtocolAdapter for Zigbee2MQTT.
 *
 * Phase 1 (MVP): native mqtt.js transport, bridge auto-discovery,
 * static device map + name/model heuristics. Read-only telemetry.
 *
 * Env vars (live mode only):
 *   Z2M_BROKER_URL        — MQTT broker URL (required to enable)
 *   Z2M_BASE_TOPIC        — Z2M base topic (default: zigbee2mqtt)
 *   Z2M_ADAPTER_ID        — adapter instance id (default: zigbee2mqtt-01)
 *   Z2M_DEVICE_ID         — deviceId prefix (default: z2m-site)
 *   Z2M_DEVICE_MAP_PATH   — override path to device map JSON
 *   Z2M_HEAT_PUMP_HINTS    — comma-separated friendly-name hints
 *   Z2M_EV_HINTS           — comma-separated friendly-name hints
 *   Z2M_ENERGY_DEVICES    — comma-separated friendly names (skip auto-discovery)
 */

import EventEmitter from 'node:events';
import { appendFileSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  type AdapterHealth,
  energyDatapointSchema,
  type IProtocolAdapter,
  type MetricType,
  type ProtocolType,
  type UnifiedEnergyDatapoint,
  type WSCommandType,
} from '@nexus-hems/shared-types';
import mqtt, { type IClientOptions, type MqttClient } from 'mqtt';
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
import { HeatPumpModeValueSchema } from '../protocol-command.js';
import {
  classifyZ2mDevice,
  hasZ2mEnergyExpose,
  resolveZ2mDeviceRole,
  type Z2mBridgeDevice,
  type Z2mDeviceMapping,
} from './z2m-role-resolver.js';

const MAX_DLQ_LINES = 10_000;
let dlqLineCount = 0;

interface DLQEntry {
  ts: number;
  source: string;
  rawPayload: string;
  error: string;
  protocol: ProtocolType;
}

export interface Zigbee2MQTTProtocolAdapterConfig {
  id: string;
  brokerUrl: string;
  baseTopic?: string;
  deviceId?: string;
  deviceMappings?: Z2mDeviceMapping[];
  energyDevices?: string[];
  heatPumpHints?: string[];
  evHints?: string[];
  heatPumpDevice?: string;
  evDevice?: string;
  clientOptions?: IClientOptions;
}

interface DeviceRuntimeState {
  available: boolean;
  role: ReturnType<typeof resolveZ2mDeviceRole>;
  device?: Z2mBridgeDevice;
}

function validateFinitePowerW(
  value: unknown,
  label: 'SET_HEAT_PUMP_POWER' | 'SET_EV_POWER',
): { ok: true; watts: number } | { ok: false; error: string } {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return { ok: false, error: `${label} requires a finite non-negative number` };
  }
  return { ok: true, watts: value };
}

export class Zigbee2MQTTProtocolAdapter implements IProtocolAdapter, IProtocolCommandHandler {
  readonly id: string;
  readonly protocol: ProtocolType = 'zigbee2mqtt';

  private readonly config: Required<
    Pick<Zigbee2MQTTProtocolAdapterConfig, 'baseTopic' | 'brokerUrl'>
  > &
    Zigbee2MQTTProtocolAdapterConfig;
  private readonly deviceIdPrefix: string;
  private readonly staticMap: Map<string, Z2mDeviceMapping>;
  private readonly heatPumpHints?: string[];
  private readonly evHints?: string[];
  private readonly heatPumpDevice?: string;
  private readonly evDevice?: string;
  private readonly configuredEnergyDevices: Set<string>;
  private readonly deviceState = new Map<string, DeviceRuntimeState>();
  private client: MqttClient | null = null;
  private connected = false;
  private destroyed = false;
  private lastSuccessMs: number | undefined;
  private consecutiveErrors = 0;
  private readonly emitter = new EventEmitter();

  constructor(config: Zigbee2MQTTProtocolAdapterConfig) {
    this.config = {
      ...config,
      baseTopic: config.baseTopic ?? 'zigbee2mqtt',
    };
    this.id = config.id;
    this.deviceIdPrefix = config.deviceId ?? 'z2m-site';
    this.staticMap = new Map(
      (config.deviceMappings ?? []).map((entry) => [entry.friendlyName, entry]),
    );
    if (config.heatPumpHints) this.heatPumpHints = config.heatPumpHints;
    if (config.evHints) this.evHints = config.evHints;
    if (config.heatPumpDevice) this.heatPumpDevice = config.heatPumpDevice;
    if (config.evDevice) this.evDevice = config.evDevice;
    this.configuredEnergyDevices = new Set(config.energyDevices ?? []);
  }

  async connect(): Promise<void> {
    if (this.destroyed) return;

    return new Promise((resolve, reject) => {
      const opts: IClientOptions = {
        reconnectPeriod: 5_000,
        connectTimeout: 10_000,
        ...(process.env.MQTT_USERNAME ? { username: process.env.MQTT_USERNAME } : {}),
        ...(process.env.MQTT_PASSWORD ? { password: process.env.MQTT_PASSWORD } : {}),
        ...this.config.clientOptions,
      };

      this.client = mqtt.connect(this.config.brokerUrl, opts);

      this.client.once('connect', () => {
        this.connected = true;
        this.consecutiveErrors = 0;
        this.subscribeCoreTopics();
        resolve();
      });

      this.client.once('error', (err) => {
        if (!this.connected) reject(err);
      });

      this.client.on('reconnect', () => {
        this.connected = false;
        recordAdapterReconnect(this.id, this.protocol);
      });

      this.client.on('message', (topic, payload, packet) => {
        try {
          this.handleMessage(topic, payload, packet.retain);
        } catch (err) {
          recordAdapterError(this.id, this.protocol, 'parse_error');
          this.consecutiveErrors++;
          writeToDLQ({
            ts: Date.now(),
            source: topic,
            rawPayload: payload.toString('utf8').slice(0, 4096),
            error: err instanceof Error ? err.message : String(err),
            protocol: this.protocol,
          });
        }
      });

      this.client.on('close', () => {
        this.connected = false;
      });
    });
  }

  async disconnect(): Promise<void> {
    this.destroyed = true;
    if (this.client) {
      this.client.removeAllListeners();
      await new Promise<void>((resolve) => {
        this.client?.end(false, {}, () => resolve());
      });
      this.client = null;
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
      errorMessage: 'Zigbee2MQTT MQTT client not connected',
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

  private subscribeCoreTopics(): void {
    const base = this.config.baseTopic;
    this.client?.subscribe(`${base}/bridge/devices`, { qos: 1 });
    this.client?.subscribe(`${base}/bridge/state`, { qos: 1 });
    this.client?.subscribe(`${base}/bridge/info`, { qos: 1 });

    for (const device of this.configuredEnergyDevices) {
      this.subscribeDevice(device);
    }

    if (this.configuredEnergyDevices.size === 0) {
      this.client?.subscribe(`${base}/+`, { qos: 1 });
      this.client?.subscribe(`${base}/+/availability`, { qos: 1 });
    }
  }

  private subscribeDevice(friendlyName: string): void {
    const base = this.config.baseTopic;
    this.client?.subscribe(`${base}/${friendlyName}`, { qos: 1 });
    this.client?.subscribe(`${base}/${friendlyName}/availability`, { qos: 1 });
  }

  private handleMessage(topic: string, payload: Buffer, _retained: boolean): void {
    const base = this.config.baseTopic;
    const text = payload.toString('utf8');

    if (topic === `${base}/bridge/devices`) {
      this.handleBridgeDevices(text);
      return;
    }
    if (topic === `${base}/bridge/state`) {
      if (text === 'offline') this.connected = false;
      return;
    }
    if (topic.endsWith('/availability')) {
      this.handleAvailability(topic, text);
      return;
    }

    if (!topic.startsWith(`${base}/`) || topic.startsWith(`${base}/bridge/`)) return;

    const relative = topic.slice(base.length + 1);
    const friendlyName = relative.split('/')[0];
    if (!friendlyName) return;

    if (this.configuredEnergyDevices.size > 0 && !this.configuredEnergyDevices.has(friendlyName)) {
      return;
    }

    this.handleDeviceState(friendlyName, text);
  }

  private handleBridgeDevices(raw: string): void {
    let devices: Z2mBridgeDevice[];
    try {
      devices = JSON.parse(raw) as Z2mBridgeDevice[];
    } catch {
      recordAdapterDlq(this.id, this.protocol);
      return;
    }
    if (!Array.isArray(devices)) return;

    for (const device of devices) {
      if (device.type === 'Coordinator') continue;
      if (
        this.configuredEnergyDevices.size > 0 &&
        !this.configuredEnergyDevices.has(device.friendly_name)
      ) {
        continue;
      }
      if (!hasZ2mEnergyExpose(device)) continue;

      const role = resolveZ2mDeviceRole(
        device.friendly_name,
        device,
        this.staticMap,
        this.heatPumpHints,
        this.evHints,
      );
      if (!role) continue;

      this.deviceState.set(device.friendly_name, {
        available: true,
        role,
        device,
      });
      this.subscribeDevice(device.friendly_name);
    }
  }

  private handleAvailability(topic: string, raw: string): void {
    const base = this.config.baseTopic;
    const suffix = '/availability';
    const friendlyName = topic.slice(base.length + 1, -suffix.length);
    const isOnline = raw === 'online' || raw.includes('"online"');
    const existing = this.deviceState.get(friendlyName) ?? {
      available: true,
      role: resolveZ2mDeviceRole(
        friendlyName,
        undefined,
        this.staticMap,
        this.heatPumpHints,
        this.evHints,
      ),
    };
    this.deviceState.set(friendlyName, { ...existing, available: isOnline });
  }

  private handleDeviceState(friendlyName: string, raw: string): void {
    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      recordAdapterDlq(this.id, this.protocol);
      return;
    }

    const runtime = this.deviceState.get(friendlyName) ?? {
      available: true,
      role: resolveZ2mDeviceRole(
        friendlyName,
        undefined,
        this.staticMap,
        this.heatPumpHints,
        this.evHints,
      ) ?? {
        role: classifyZ2mDevice({ friendly_name: friendlyName, type: 'EndDevice' }),
        scale: 1,
      },
    };
    this.deviceState.set(friendlyName, runtime);

    if (!runtime.available || !runtime.role) return;

    const fields: Array<{ key: string; metric: MetricType }> = [
      { key: 'power', metric: 'POWER_W' },
      { key: 'energy', metric: 'ENERGY_KWH' },
      { key: 'voltage', metric: 'VOLTAGE_V' },
      { key: 'current', metric: 'CURRENT_A' },
      { key: 'temperature', metric: 'TEMPERATURE_C' },
    ];

    for (const field of fields) {
      const value = payload[field.key];
      if (typeof value !== 'number' || !Number.isFinite(value)) continue;
      this.emitDatapoint({
        friendlyName,
        metric: field.metric,
        value: value * runtime.role.scale,
        role: runtime.role.role,
      });
    }
  }

  private emitDatapoint(input: {
    friendlyName: string;
    metric: MetricType;
    value: number;
    role: UnifiedEnergyDatapoint['role'];
  }): void {
    const datapoint = energyDatapointSchema.safeParse({
      timestamp: Date.now(),
      deviceId: `${this.deviceIdPrefix}:${input.friendlyName}`,
      protocol: this.protocol,
      metric: input.metric,
      value: input.value,
      qualityIndicator: 'GOOD',
      role: input.role,
    });

    if (!datapoint.success) {
      writeToDLQ({
        ts: Date.now(),
        source: input.friendlyName,
        rawPayload: String(input.value),
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

  supportsCommand(type: WSCommandType): boolean {
    return (
      type === 'SET_HEAT_PUMP_MODE' || type === 'SET_HEAT_PUMP_POWER' || type === 'SET_EV_POWER'
    );
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
        error: 'Zigbee2MQTT MQTT not connected',
      };
    }

    if (command.type === 'SET_HEAT_PUMP_POWER' || command.type === 'SET_EV_POWER') {
      const validated = validateFinitePowerW(command.value, command.type);
      if (!validated.ok) {
        return {
          handled: true,
          success: false,
          adapterId: this.id,
          error: validated.error,
        };
      }
    }

    const topicDevice =
      command.type === 'SET_EV_POWER'
        ? this.evDevice
        : (this.heatPumpDevice ?? this.resolveHeatPumpDevice());
    if (!topicDevice) {
      return {
        handled: true,
        success: false,
        adapterId: this.id,
        error: 'Z2M heat pump / EV device not configured',
      };
    }

    let payload: Record<string, unknown>;
    if (command.type === 'SET_HEAT_PUMP_MODE') {
      const mode = HeatPumpModeValueSchema.safeParse(command.value);
      if (!mode.success) {
        return {
          handled: true,
          success: false,
          adapterId: this.id,
          error: 'SET_HEAT_PUMP_MODE requires an integer SG Ready mode between 1 and 4',
        };
      }
      payload = { state: mode.data === 1 ? 'OFF' : 'ON', sg_ready_mode: mode.data };
    } else if (command.type === 'SET_HEAT_PUMP_POWER') {
      payload = { state: (command.value as number) > 0 ? 'ON' : 'OFF' };
    } else {
      payload = { power_limit: command.value as number };
    }

    try {
      const topic = `${this.config.baseTopic}/${topicDevice}/set`;
      await new Promise<void>((resolve, reject) => {
        this.client!.publish(topic, JSON.stringify(payload), { qos: 1 }, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
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

  private resolveHeatPumpDevice(): string | undefined {
    for (const [friendlyName, runtime] of this.deviceState) {
      if (runtime.role?.role === 'heatpump') return friendlyName;
    }
    return undefined;
  }
}

export function loadZ2mDeviceMappings(path: string): Z2mDeviceMapping[] {
  try {
    const raw = readFileSync(path, 'utf8');
    return JSON.parse(raw) as Z2mDeviceMapping[];
  } catch (err) {
    console.warn('[Zigbee2MQTTProtocolAdapter] z2m-device-map.json not found or invalid:', err);
    return [];
  }
}

function parseHintList(value: string | undefined): string[] | undefined {
  const hints = value
    ?.split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
  return hints && hints.length > 0 ? hints : undefined;
}

export function createZigbee2MQTTAdapterFromEnv(
  env: NodeJS.ProcessEnv = process.env,
  deviceMappings?: Z2mDeviceMapping[],
): Zigbee2MQTTProtocolAdapter | null {
  const brokerUrl = env.Z2M_BROKER_URL?.trim();
  if (!brokerUrl) return null;

  const mapPath =
    env.Z2M_DEVICE_MAP_PATH?.trim() ||
    join(dirname(fileURLToPath(import.meta.url)), '../../data/z2m-device-map.json');

  const mappings = deviceMappings ?? loadZ2mDeviceMappings(mapPath);
  if (mappings.length === 0) {
    console.warn(
      '[Adapters] Z2M_BROKER_URL set but z2m-device-map.json is empty — copy z2m-device-map.example.json or rely on bridge auto-discovery',
    );
  }

  const energyDevices = env.Z2M_ENERGY_DEVICES?.split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
  const heatPumpHints = parseHintList(env.Z2M_HEAT_PUMP_HINTS);
  const evHints = parseHintList(env.Z2M_EV_HINTS);

  const adapterConfig: Zigbee2MQTTProtocolAdapterConfig = {
    id: env.Z2M_ADAPTER_ID?.trim() || 'zigbee2mqtt-01',
    brokerUrl,
    baseTopic: env.Z2M_BASE_TOPIC?.trim() || 'zigbee2mqtt',
    deviceId: env.Z2M_DEVICE_ID?.trim() || 'z2m-site',
    deviceMappings: mappings,
  };
  if (energyDevices && energyDevices.length > 0) adapterConfig.energyDevices = energyDevices;
  if (heatPumpHints) adapterConfig.heatPumpHints = heatPumpHints;
  if (evHints) adapterConfig.evHints = evHints;
  if (env.Z2M_HEAT_PUMP_DEVICE?.trim())
    adapterConfig.heatPumpDevice = env.Z2M_HEAT_PUMP_DEVICE.trim();
  if (env.Z2M_EV_DEVICE?.trim()) adapterConfig.evDevice = env.Z2M_EV_DEVICE.trim();

  return new Zigbee2MQTTProtocolAdapter(adapterConfig);
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
