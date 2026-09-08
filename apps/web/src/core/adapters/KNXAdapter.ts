/**
 * KNXAdapter — Production KNX/IP building automation adapter
 *
 * Connects via one of two transports:
 *   1. WebSocket bridge (default) — knxd / custom bridge exposing KNX telegrams as JSON
 *   2. MQTT bridge — KNX/MQTT gateway (e.g. knx2mqtt, Weinzierl KNX/MQTT)
 *
 * Architecture:
 *   KNX Bus → KNX/IP Gateway → Bridge (knxd/MQTT) → WebSocket/MQTT → This Adapter
 *
 * Supported DPT (KNX Datapoint Types):
 *   • DPT1  — Boolean (switch, window contact)
 *   • DPT5  — 8-bit unsigned (dimming 0–255, percentage 0–100)
 *   • DPT9  — 16-bit float (temperature, humidity, CO₂)
 *   • DPT14 — 32-bit float (energy, power)
 *
 * ETS Project Import:
 *   Room configs can be loaded from an ETS export (JSON) via setRoomConfigs()
 *   to map group addresses to room entities automatically.
 */

import { BaseAdapter } from './BaseAdapter';
import type {
  AdapterCapability,
  AdapterCommand,
  AdapterConnectionConfig,
  KNXRoom,
  UnifiedEnergyModel,
} from './EnergyAdapter';

// ─── KNX telegram message from bridge ────────────────────────────────

interface KNXTelegram {
  /** KNX group address, e.g. "1/1/0" */
  ga: string;
  /** Datapoint type, e.g. "DPT1.001" */
  dpt: string;
  /** Decoded value */
  value: boolean | number | string;
  /** Source physical address */
  src?: string;
  /** Timestamp from bridge */
  ts?: number;
}

/** Room definition from KNX project config / ETS export */
export interface KNXRoomConfig {
  id: string;
  name: string;
  /** Group address for light switching */
  lightGA: string;
  /** Group address for light dimming value */
  dimGA?: string;
  /** Group address for temperature actual value */
  tempGA: string;
  /** Group address for setpoint */
  setpointGA?: string;
  /** Group address for window contact */
  windowGA?: string;
  /** Group address for humidity */
  humidityGA?: string;
  /** Group address for CO₂ */
  co2GA?: string;
  /** Group address for power metering (DPT14) */
  powerGA?: string;
}

/** Transport mode for the KNX adapter */
export type KNXTransport = 'websocket' | 'mqtt';

/** MQTT topic layout for KNX/MQTT bridges */
export interface KNXMQTTConfig {
  /** Topic prefix (e.g. "knx" → knx/1/1/0) */
  topicPrefix: string;
  /** State topic template, {ga} is replaced (e.g. "knx/{ga}/state") */
  stateTopic: string;
  /** Command topic template for writes */
  commandTopic: string;
}

const DEFAULT_ROOMS: KNXRoomConfig[] = [
  {
    id: 'living',
    name: 'Living Room',
    lightGA: '1/1/0',
    dimGA: '1/1/1',
    tempGA: '3/1/0',
    setpointGA: '2/1/0',
    windowGA: '3/1/1',
  },
  {
    id: 'kitchen',
    name: 'Kitchen',
    lightGA: '1/2/0',
    tempGA: '3/2/0',
    windowGA: '3/2/1',
  },
  {
    id: 'bathroom',
    name: 'Bathroom',
    lightGA: '1/3/0',
    tempGA: '3/3/0',
    humidityGA: '3/3/2',
  },
];

const DEFAULT_RECONNECT = {
  enabled: true,
  initialDelayMs: 2000,
  maxDelayMs: 15_000,
  backoffMultiplier: 1.5,
};

const DEFAULT_MQTT_CONFIG: KNXMQTTConfig = {
  topicPrefix: 'knx',
  stateTopic: 'knx/{ga}/state',
  commandTopic: 'knx/{ga}/set',
};

export interface KNXAdapterConfig extends Partial<AdapterConnectionConfig> {
  transport?: KNXTransport;
  mqttConfig?: Partial<KNXMQTTConfig>;
  roomConfigs?: KNXRoomConfig[];
  /** Enable mock mode (no real connection required) */
  mock?: boolean;
}

export class KNXAdapter extends BaseAdapter {
  readonly id = 'knx';
  readonly name = 'KNX/IP Gateway';
  readonly capabilities: AdapterCapability[] = ['knx'];

  private ws: WebSocket | null = null;
  private mqttClient: {
    on: (event: string, cb: (...args: unknown[]) => void) => void;
    subscribe: (topic: string | string[], opts?: Record<string, unknown>) => void;
    publish: (topic: string, message: string, opts?: Record<string, unknown>) => void;
    end: (force?: boolean) => void;
    connected: boolean;
  } | null = null;
  private transport: KNXTransport;
  private mqttConfig: KNXMQTTConfig;

  /** Live room state, keyed by room id */
  private rooms: Map<string, KNXRoom> = new Map();
  /** GA → room id + field mapping */
  private gaIndex: Map<string, { roomId: string; field: string }> = new Map();

  private roomConfigs: KNXRoomConfig[];

  constructor(config?: KNXAdapterConfig) {
    // HIGH-01: host is required in non-mock mode
    if (!config?.host && config?.mock !== true) {
      throw new Error('KNXAdapter: config.host is required');
    }
    super({
      name: 'KNX/IP',
      host: config?.host ?? '192.168.1.101',
      port: config?.port ?? 3671,
      tls: config?.tls ?? false,
      reconnect: { ...DEFAULT_RECONNECT, ...config?.reconnect },
      ...config,
    });
    this.transport = config?.transport ?? 'websocket';
    this.mqttConfig = { ...DEFAULT_MQTT_CONFIG, ...config?.mqttConfig };
    this.roomConfigs = config?.roomConfigs ?? DEFAULT_ROOMS;
    this.initRooms();
  }

  /** Update room configs (e.g. from ETS import) and rebuild GA index */
  setRoomConfigs(configs: KNXRoomConfig[]): void {
    this.roomConfigs = configs;
    this.rooms.clear();
    this.gaIndex.clear();
    this.initRooms();
  }

  /** Get current room configs (for serialization / Settings UI) */
  getRoomConfigs(): KNXRoomConfig[] {
    return [...this.roomConfigs];
  }

  override getSnapshot(): Partial<UnifiedEnergyModel> {
    return {
      knx: { rooms: Array.from(this.rooms.values()) },
    };
  }

  // ─── BaseAdapter abstract implementations ─────────────────────────

  protected async _connect(): Promise<void> {
    if (this.transport === 'mqtt') {
      return this._connectMQTT();
    }
    return this._connectWebSocket();
  }

  private _connectWebSocket(): void {
    this.setStatus('connecting');

    const protocol = this.config.tls ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${this.config.host}:${this.config.port}`;
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      this.resetRetryDelay();
      this.setStatus('connected');
      // Request initial state of all configured GAs
      this.requestInitialState();
    };

    ws.onmessage = (event: MessageEvent) => {
      try {
        const telegram = JSON.parse(String(event.data)) as KNXTelegram;
        this.handleTelegram(telegram);
      } catch {
        // Ignore non-JSON
      }
    };

    ws.onclose = () => {
      this.setStatus('disconnected');
      this.scheduleReconnect();
    };

    ws.onerror = () => {
      ws.close();
    };

    this.ws = ws;
  }

  private async _connectMQTT(): Promise<void> {
    this.setStatus('connecting');

    try {
      const mqtt = await import('mqtt');
      const protocol = this.config.tls ? 'wss' : 'ws';
      const url = `${protocol}://${this.config.host}:${this.config.port}/mqtt`;

      // Unique client ID
      const clientSuffix =
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID().slice(0, 8)
          : Math.random().toString(36).slice(2, 10);
      const clientId = `nexus-hems-knx-${clientSuffix}`;

      const connectOpts: Record<string, unknown> = {
        clientId,
        protocolVersion: 4,
        clean: true,
        connectTimeout: 10_000,
        reconnectPeriod: 0, // BaseAdapter handles reconnect
        will: {
          topic: `nexus-hems/knx/${clientId}/status`,
          payload: JSON.stringify({ online: false, timestamp: Date.now() }),
          qos: 1,
          retain: true,
        },
        ...(this.config.tls ? { rejectUnauthorized: true } : {}),
        ...(this.config.clientCert ? { cert: this.config.clientCert } : {}),
        ...(this.config.clientKey ? { key: this.config.clientKey } : {}),
        ...(this.config.authToken ? { password: this.config.authToken } : {}),
      };

      const client = (
        mqtt.connect as unknown as (
          url: string,
          opts?: Record<string, unknown>,
        ) => typeof this.mqttClient
      )(url, connectOpts)!;

      this.mqttClient = client;

      client.on('connect', () => {
        this.resetRetryDelay();
        this.setStatus('connected');
        // Subscribe to all KNX state topics with QoS 1
        const prefix = this.mqttConfig.topicPrefix;
        client.subscribe(`${prefix}/+/+/+/state`, { qos: 1 } as Record<string, unknown>);
        client.subscribe(`${prefix}/#`, { qos: 1 } as Record<string, unknown>);
      });

      client.on('message', (_topic: unknown, _payload: unknown) => {
        const topic = _topic as string;
        const payload = (_payload as Buffer).toString();
        this.handleMQTTMessage(topic, payload);
      });

      client.on('close', () => {
        this.setStatus('disconnected');
        this.scheduleReconnect();
      });

      client.on('error', () => {
        this.setStatus('error', 'KNX MQTT connection error');
      });
    } catch {
      this.setStatus('error', 'Failed to load MQTT library');
      this.scheduleReconnect();
    }
  }

  protected async _disconnect(): Promise<void> {
    this.ws?.close();
    this.ws = null;
    if (this.mqttClient) {
      this.mqttClient.end(true);
      this.mqttClient = null;
    }
  }

  protected async _sendCommand(command: AdapterCommand): Promise<boolean> {
    let telegram: { ga: string; value: boolean | number | string } | null = null;

    if (command.type === 'KNX_TOGGLE_LIGHTS' && command.targetDeviceId) {
      const roomCfg = this.roomConfigs.find((r) => r.id === command.targetDeviceId);
      if (roomCfg) {
        telegram = { ga: roomCfg.lightGA, value: Boolean(command.value) };
      }
    } else if (command.type === 'KNX_SET_TEMPERATURE' && command.targetDeviceId) {
      const roomCfg = this.roomConfigs.find((r) => r.id === command.targetDeviceId);
      if (roomCfg?.setpointGA) {
        telegram = { ga: roomCfg.setpointGA, value: Number(command.value) };
      }
    }

    if (!telegram) return false;

    if (this.transport === 'mqtt' && this.mqttClient?.connected) {
      const topic = this.mqttConfig.commandTopic.replace('{ga}', telegram.ga.replace(/\//g, '-'));
      this.mqttClient.publish(topic, JSON.stringify(telegram.value));
      return true;
    }

    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'WRITE', ...telegram }));
      return true;
    }

    return false;
  }

  protected _cleanup(): void {
    this.ws?.close();
    this.ws = null;
    if (this.mqttClient) {
      this.mqttClient.end(true);
      this.mqttClient = null;
    }
  }

  // ─── MQTT message handling ────────────────────────────────────────

  private handleMQTTMessage(topic: string, payload: string): void {
    // Extract GA from topic (e.g. "knx/1/1/0/state" → "1/1/0")
    const prefix = this.mqttConfig.topicPrefix;
    const stripped = topic.startsWith(`${prefix}/`) ? topic.slice(prefix.length + 1) : topic;
    const parts = stripped.split('/');

    // GA is first three parts, rest is suffix (state/set)
    if (parts.length < 3) return;
    const ga = `${parts[0]}/${parts[1]}/${parts[2]}`;

    try {
      const value = JSON.parse(payload) as boolean | number | string;
      this.handleTelegram({ ga, dpt: '', value });
    } catch {
      // Try plain value
      const num = parseFloat(payload);
      if (!Number.isNaN(num)) {
        this.handleTelegram({ ga, dpt: '', value: num });
      } else if (payload === 'true' || payload === 'false') {
        this.handleTelegram({ ga, dpt: '', value: payload === 'true' });
      }
    }
  }

  // ─── Request initial state ────────────────────────────────────────

  private requestInitialState(): void {
    if (this.ws?.readyState !== WebSocket.OPEN) return;

    // Request read for all configured GAs
    for (const ga of this.gaIndex.keys()) {
      this.ws.send(JSON.stringify({ type: 'READ', ga }));
    }
  }

  // ─── Internal ─────────────────────────────────────────────────────

  private initRooms(): void {
    for (const cfg of this.roomConfigs) {
      this.rooms.set(cfg.id, {
        id: cfg.id,
        name: cfg.name,
        temperature: 21.0,
        lightsOn: false,
        windowOpen: false,
      });

      this.gaIndex.set(cfg.lightGA, { roomId: cfg.id, field: 'lightsOn' });
      if (cfg.dimGA) this.gaIndex.set(cfg.dimGA, { roomId: cfg.id, field: 'brightness' });
      this.gaIndex.set(cfg.tempGA, { roomId: cfg.id, field: 'temperature' });
      if (cfg.setpointGA) this.gaIndex.set(cfg.setpointGA, { roomId: cfg.id, field: 'setpoint' });
      if (cfg.windowGA) this.gaIndex.set(cfg.windowGA, { roomId: cfg.id, field: 'windowOpen' });
      if (cfg.humidityGA) this.gaIndex.set(cfg.humidityGA, { roomId: cfg.id, field: 'humidity' });
      if (cfg.co2GA) this.gaIndex.set(cfg.co2GA, { roomId: cfg.id, field: 'co2ppm' });
    }
  }

  private handleTelegram(telegram: KNXTelegram): void {
    const mapping = this.gaIndex.get(telegram.ga);
    if (!mapping) return;

    const room = this.rooms.get(mapping.roomId);
    if (!room) return;

    switch (mapping.field) {
      case 'lightsOn':
        room.lightsOn = Boolean(telegram.value);
        break;
      case 'brightness':
        room.brightness = Number(telegram.value);
        break;
      case 'temperature':
        room.temperature = Number(telegram.value);
        break;
      case 'setpoint':
        room.setpoint = Number(telegram.value);
        break;
      case 'windowOpen':
        room.windowOpen = Boolean(telegram.value);
        break;
      case 'humidity':
        room.humidity = Number(telegram.value);
        break;
      case 'co2ppm':
        room.co2ppm = Number(telegram.value);
        break;
    }

    this.rooms.set(mapping.roomId, room);

    this.emitData({
      timestamp: Date.now(),
      knx: { rooms: Array.from(this.rooms.values()) },
    });
  }
}
