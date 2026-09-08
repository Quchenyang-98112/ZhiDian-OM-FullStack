/**
 * HomeAssistantMqttProtocolAdapter — Backend IProtocolAdapter for HA MQTT Discovery.
 *
 * Phase 1 (MVP): native mqtt.js transport, HA MQTT Discovery config topics,
 * static entity map + device_class heuristics (shared ha-role-resolver).
 * Phase 6: EV + heat-pump commands via MQTT service publish.
 *
 * Env vars (live mode only):
 *   HA_MQTT_BROKER_URL     — MQTT broker URL (required to enable)
 *   HA_MQTT_TOPIC_PREFIX   — discovery prefix (default: homeassistant)
 *   HA_MQTT_ADAPTER_ID     — adapter instance id (default: ha-mqtt-01)
 *   HA_DEVICE_ID           — deviceId prefix (default: ha-site)
 *   HA_ENTITY_MAP_PATH     — override path to entity map JSON
 *   HA_WALLBOX_CURRENT_ENTITY — number entity for max current (optional)
 *   HA_WALLBOX_SWITCH_ENTITY  — switch entity for start/stop (optional)
 *   HA_WALLBOX_MAINS_VOLTAGE  — mains voltage for SET_EV_POWER→amps (default: 230)
 *   HA_HEAT_PUMP_MODE_ENTITY    — number/select entity for SET_HEAT_PUMP_MODE SG Ready 1–4 (optional)
 */

import EventEmitter from 'node:events';
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
import mqtt, { type IClientOptions, type MqttClient } from 'mqtt';
import {
  recordAdapterDlq,
  recordAdapterError,
  recordAdapterReconnect,
} from '../../middleware/adapter-metrics.js';
import { loadHAEntityMappings } from '../homeassistant/HomeAssistantProtocolAdapter.js';
import {
  type HAEntityMapping,
  parseHANumericState,
  resolveHAEntityRole,
} from '../homeassistant/ha-role-resolver.js';
import type {
  IProtocolCommandHandler,
  ProtocolCommandRequest,
  ProtocolCommandResult,
} from '../protocol-command.js';
import { HeatPumpModeEntityIdSchema, parseOptionalMainsVoltageEnv } from '../protocol-command.js';
import { writeToProtocolDLQ } from '../protocol-dlq.js';
import {
  haMqttSupportsCommand,
  mapProtocolCommandToMqttService,
  mqttServiceTopic,
} from './ha-mqtt-command-mapper.js';

interface HAMqttDiscoveryConfig {
  unique_id?: string;
  state_topic?: string;
  device_class?: string;
  unit_of_measurement?: string;
}

interface TrackedEntity {
  entityId: string;
  stateTopic: string;
  deviceClass: string;
  unit: string;
}

export interface HomeAssistantMqttProtocolAdapterConfig {
  id: string;
  brokerUrl: string;
  topicPrefix?: string;
  deviceId?: string;
  entityMappings?: HAEntityMapping[];
  clientOptions?: IClientOptions;
  wallboxCurrentEntityId?: string;
  wallboxSwitchEntityId?: string;
  heatPumpModeEntityId?: string;
  mainsVoltage?: number;
}

export class HomeAssistantMqttProtocolAdapter implements IProtocolAdapter, IProtocolCommandHandler {
  readonly id: string;
  readonly protocol: ProtocolType = 'homeassistant-mqtt';

  private readonly config: Required<
    Pick<HomeAssistantMqttProtocolAdapterConfig, 'brokerUrl' | 'topicPrefix'>
  > &
    HomeAssistantMqttProtocolAdapterConfig;
  private readonly deviceIdPrefix: string;
  private readonly staticMap: Map<string, HAEntityMapping>;
  private readonly wallboxCurrentEntityId: string | undefined;
  private readonly wallboxSwitchEntityId: string | undefined;
  private readonly heatPumpModeEntityId: string | undefined;
  private readonly mainsVoltage: number;
  private readonly stateTopicToEntity = new Map<string, TrackedEntity>();
  private client: MqttClient | null = null;
  private connected = false;
  private destroyed = false;
  private lastSuccessMs: number | undefined;
  private consecutiveErrors = 0;
  private readonly emitter = new EventEmitter();

  constructor(config: HomeAssistantMqttProtocolAdapterConfig) {
    this.config = {
      ...config,
      topicPrefix: config.topicPrefix ?? 'homeassistant',
    };
    this.id = config.id;
    this.deviceIdPrefix = config.deviceId ?? 'ha-site';
    this.wallboxCurrentEntityId = config.wallboxCurrentEntityId;
    this.wallboxSwitchEntityId = config.wallboxSwitchEntityId;
    this.heatPumpModeEntityId = config.heatPumpModeEntityId;
    this.mainsVoltage = config.mainsVoltage ?? 230;
    this.staticMap = new Map((config.entityMappings ?? []).map((entry) => [entry.entityId, entry]));
    // Populate stateTopicToEntity only — client is null; subscribeCoreTopics() subscribes on connect.
    for (const mapping of config.entityMappings ?? []) {
      this.trackEntity(mapping.entityId, this.stateTopicForEntity(mapping.entityId), '', '');
    }
  }

  async connect(): Promise<void> {
    if (this.destroyed) return;

    return new Promise((resolve, reject) => {
      let connectSettled = false;

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
        connectSettled = true;
        resolve();
      });

      this.client.on('error', (err) => {
        if (!this.connected && !connectSettled) {
          connectSettled = true;
          reject(err);
          return;
        }
        recordAdapterError(this.id, this.protocol, 'connection_error');
        this.consecutiveErrors++;
      });

      this.client.on('reconnect', () => {
        this.connected = false;
        recordAdapterReconnect(this.id, this.protocol);
      });

      this.client.on('message', (topic, payload) => {
        try {
          this.handleMessage(topic, payload.toString('utf8'));
        } catch (err) {
          recordAdapterError(this.id, this.protocol, 'parse_error');
          this.consecutiveErrors++;
          writeToProtocolDLQ({
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
        const timer = setTimeout(resolve, 5_000);
        this.client?.end(false, {}, () => {
          clearTimeout(timer);
          resolve();
        });
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
      errorMessage: 'HA MQTT client not connected',
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
    const prefix = this.config.topicPrefix;
    this.client?.subscribe(`${prefix}/+/+/config`, { qos: 1 });
    for (const entity of this.stateTopicToEntity.values()) {
      this.client?.subscribe(entity.stateTopic, { qos: 1 });
    }
  }

  private stateTopicForEntity(entityId: string): string {
    const [domain, ...rest] = entityId.split('.');
    const objectId = rest.join('.');
    return `${this.config.topicPrefix}/${domain}/${objectId}/state`;
  }

  private trackEntity(
    entityId: string,
    stateTopic: string,
    deviceClass: string,
    unit: string,
  ): void {
    const tracked: TrackedEntity = { entityId, stateTopic, deviceClass, unit };
    this.stateTopicToEntity.set(stateTopic, tracked);
    // Subscribe when client is already connected (discovery); constructor path is map-only.
    this.client?.subscribe(stateTopic, { qos: 1 });
  }

  private handleMessage(topic: string, raw: string): void {
    const prefix = this.config.topicPrefix;
    if (topic.endsWith('/config') && topic.startsWith(`${prefix}/`)) {
      this.handleDiscoveryConfig(raw);
      return;
    }

    const tracked = this.stateTopicToEntity.get(topic);
    if (!tracked) return;

    const resolution = resolveHAEntityRole(
      tracked.entityId,
      tracked.deviceClass,
      tracked.unit,
      this.staticMap,
    );
    if (!resolution) return;

    const value = parseHANumericState(raw, tracked.unit, resolution.metric, resolution.scale);
    if (value === null) {
      recordAdapterDlq(this.id, this.protocol);
      return;
    }

    const datapoint = energyDatapointSchema.safeParse({
      timestamp: Date.now(),
      deviceId: `${this.deviceIdPrefix}:${tracked.entityId}`,
      protocol: this.protocol,
      metric: resolution.metric,
      value,
      qualityIndicator: 'GOOD',
      role: resolution.role,
    });

    if (!datapoint.success) {
      writeToProtocolDLQ({
        ts: Date.now(),
        source: tracked.entityId,
        rawPayload: raw,
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

  private handleDiscoveryConfig(raw: string): void {
    let config: HAMqttDiscoveryConfig;
    try {
      config = JSON.parse(raw) as HAMqttDiscoveryConfig;
    } catch {
      writeToProtocolDLQ({
        ts: Date.now(),
        source: 'discovery-config',
        rawPayload: raw.slice(0, 4096),
        error: 'invalid discovery config JSON',
        protocol: this.protocol,
      });
      recordAdapterDlq(this.id, this.protocol);
      return;
    }

    if (!config.state_topic) return;
    const entityId =
      config.unique_id ?? config.state_topic.split('/').slice(-2, -1)[0] ?? config.state_topic;
    const deviceClass = config.device_class ?? '';
    const unit = config.unit_of_measurement ?? '';
    const resolution = resolveHAEntityRole(entityId, deviceClass, unit, this.staticMap);
    if (!resolution) return;

    this.trackEntity(entityId, config.state_topic, deviceClass, unit);
  }

  supportsCommand(type: WSCommandType): boolean {
    return haMqttSupportsCommand(type);
  }

  async sendCommand(command: ProtocolCommandRequest): Promise<ProtocolCommandResult> {
    if (!this.supportsCommand(command.type)) {
      return { handled: false, success: false };
    }

    if (!this.connected || !this.client?.connected) {
      return {
        handled: true,
        success: false,
        adapterId: this.id,
        error: 'HA MQTT client not connected',
      };
    }

    const mapped = mapProtocolCommandToMqttService(command, {
      mainsVoltage: this.mainsVoltage,
      ...(this.wallboxCurrentEntityId
        ? { wallboxCurrentEntityId: this.wallboxCurrentEntityId }
        : {}),
      ...(this.wallboxSwitchEntityId ? { wallboxSwitchEntityId: this.wallboxSwitchEntityId } : {}),
      ...(this.heatPumpModeEntityId ? { heatPumpModeEntityId: this.heatPumpModeEntityId } : {}),
    });

    if ('error' in mapped) {
      return {
        handled: true,
        success: false,
        adapterId: this.id,
        error: mapped.error,
      };
    }

    const topic = mqttServiceTopic(this.config.topicPrefix, mapped);
    const payload = JSON.stringify(mapped.payload);

    return new Promise<ProtocolCommandResult>((resolve) => {
      this.client?.publish(topic, payload, { qos: 1 }, (err) => {
        resolve(
          err
            ? {
                handled: true,
                success: false,
                adapterId: this.id,
                error: err.message,
              }
            : { handled: true, success: true, adapterId: this.id },
        );
      });
    });
  }
}

export function createHomeAssistantMqttAdapterFromEnv(
  env: NodeJS.ProcessEnv = process.env,
  entityMappings?: HAEntityMapping[],
): HomeAssistantMqttProtocolAdapter | null {
  const brokerUrl = env.HA_MQTT_BROKER_URL?.trim();
  if (!brokerUrl) return null;

  const mapPath =
    env.HA_ENTITY_MAP_PATH?.trim() ||
    join(dirname(fileURLToPath(import.meta.url)), '../../data/ha-entity-map.json');

  const mappings = entityMappings ?? loadHAEntityMappings(mapPath);
  const mainsVoltage = parseOptionalMainsVoltageEnv(env.HA_WALLBOX_MAINS_VOLTAGE);
  const heatPumpModeRaw = env.HA_HEAT_PUMP_MODE_ENTITY?.trim();
  const heatPumpModeEntity = heatPumpModeRaw
    ? HeatPumpModeEntityIdSchema.safeParse(heatPumpModeRaw)
    : null;
  if (heatPumpModeRaw && heatPumpModeEntity && !heatPumpModeEntity.success) {
    console.warn(
      `[HomeAssistantMqttProtocolAdapter] ignoring invalid HA_HEAT_PUMP_MODE_ENTITY "${heatPumpModeRaw}": ${heatPumpModeEntity.error.issues[0]?.message}`,
    );
  }

  return new HomeAssistantMqttProtocolAdapter({
    id: env.HA_MQTT_ADAPTER_ID?.trim() || 'ha-mqtt-01',
    brokerUrl,
    topicPrefix: env.HA_MQTT_TOPIC_PREFIX?.trim() || 'homeassistant',
    deviceId: env.HA_DEVICE_ID?.trim() || 'ha-site',
    entityMappings: mappings,
    ...(env.HA_WALLBOX_CURRENT_ENTITY?.trim()
      ? { wallboxCurrentEntityId: env.HA_WALLBOX_CURRENT_ENTITY.trim() }
      : {}),
    ...(env.HA_WALLBOX_SWITCH_ENTITY?.trim()
      ? { wallboxSwitchEntityId: env.HA_WALLBOX_SWITCH_ENTITY.trim() }
      : {}),
    ...(heatPumpModeEntity?.success ? { heatPumpModeEntityId: heatPumpModeEntity.data } : {}),
    ...(mainsVoltage !== undefined ? { mainsVoltage } : {}),
  });
}
