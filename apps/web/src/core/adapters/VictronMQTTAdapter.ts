/**
 * VictronMQTTAdapter — Direct MQTT connection to Victron Venus OS
 *
 * Connects directly to the Venus OS dbus-mqtt bridge via MQTT-over-WebSocket,
 * eliminating the need for a Node-RED relay.
 *
 * Supports:
 *  1. Direct Venus OS MQTT (dbus-mqtt bridge on port 9001 for WS, 1883 for TCP)
 *  2. Fallback: Node-RED WebSocket relay for legacy setups
 *
 * MQTT Topic Layout (Venus OS dbus-mqtt):
 *   N/<portalId>/<service>/<instance>/<path>  — Notification (read values)
 *   R/<portalId>/<service>/<instance>/<path>  — Read request
 *   W/<portalId>/<service>/<instance>/<path>  — Write command  { "value": ... }
 *
 * Works with Cerbo GX, Cerbo GX MK2, and Raspberry Pi running Venus OS Large.
 * D-Bus service paths follow the com.victronenergy.* namespace.
 */

import { BaseAdapter } from './BaseAdapter';
import type {
  AdapterCapability,
  AdapterCommand,
  AdapterConnectionConfig,
  UnifiedEnergyModel,
} from './EnergyAdapter';

// Lazy-load mqtt.js only when needed (keeps initial bundle small)
type MqttClient = {
  on(event: string, cb: (...args: unknown[]) => void): void;
  subscribe(
    topic: string | string[],
    opts?: Record<string, unknown>,
    cb?: (err?: Error) => void,
  ): void;
  publish(
    topic: string,
    message: string,
    opts?: Record<string, unknown>,
    cb?: (err?: Error) => void,
  ): void;
  end(force?: boolean, cb?: () => void): void;
  connected: boolean;
};
type MqttConnectFn = (url: string, opts?: Record<string, unknown>) => MqttClient;
let mqttConnect: MqttConnectFn | null = null;

async function loadMqtt(): Promise<MqttConnectFn> {
  if (mqttConnect) return mqttConnect;
  const mod = await import('mqtt');
  mqttConnect = mod.connect as unknown as MqttConnectFn;
  return mqttConnect;
}

// ─── Gateway device type ─────────────────────────────────────────────

export type VictronGatewayType = 'cerbo-gx' | 'cerbo-gx-mk2' | 'raspberry-pi';

// ─── Venus OS D-Bus path constants ──────────────────────────────────

/** Standard Venus OS D-Bus service paths (com.victronenergy.*) */
export const VENUS_DBUS_PATHS = {
  // System-wide
  system: {
    serial: '/system/0/Serial',
    vrmId: '/system/0/VrmPortalId',
    acIn: '/system/0/Ac/ActiveIn/Source',
    pvOnGrid: '/system/0/Ac/PvOnGrid/L1/Power',
  },
  // Grid meter
  grid: {
    power: 'com.victronenergy.grid/Ac/Power',
    voltageL1: 'com.victronenergy.grid/Ac/L1/Voltage',
    voltageL2: 'com.victronenergy.grid/Ac/L2/Voltage',
    voltageL3: 'com.victronenergy.grid/Ac/L3/Voltage',
    energyFwd: 'com.victronenergy.grid/Ac/Energy/Forward',
    energyRev: 'com.victronenergy.grid/Ac/Energy/Reverse',
  },
  // PV inverter (on AC output or DC-coupled via MPPT)
  pv: {
    power: 'com.victronenergy.pvinverter/Ac/Power',
    yieldToday: 'com.victronenergy.pvinverter/Ac/Energy/Forward',
    position: 'com.victronenergy.pvinverter/Position', // 0=AC-in, 1=AC-out, 2=AC-in2
  },
  // MPPT solar charger (DC-coupled)
  solarCharger: {
    power: 'com.victronenergy.solarcharger/Yield/Power',
    yieldToday: 'com.victronenergy.solarcharger/Yield/System',
    voltage: 'com.victronenergy.solarcharger/Pv/V',
    state: 'com.victronenergy.solarcharger/State',
    errorCode: 'com.victronenergy.solarcharger/ErrorCode',
  },
  // Battery (via BMS or Multi/Quattro)
  battery: {
    power: 'com.victronenergy.battery/Dc/0/Power',
    soc: 'com.victronenergy.battery/Soc',
    voltage: 'com.victronenergy.battery/Dc/0/Voltage',
    current: 'com.victronenergy.battery/Dc/0/Current',
    state: 'com.victronenergy.battery/State',
    timeToGo: 'com.victronenergy.battery/TimeToGo',
  },
  // VE.Bus (Multi/Quattro inverter-charger)
  vebus: {
    power: 'com.victronenergy.vebus/Ac/ActiveIn/P',
    state: 'com.victronenergy.vebus/State',
    mode: 'com.victronenergy.vebus/Mode', // 1=Charger, 2=Inverter, 3=On, 4=Off
    acOutPower: 'com.victronenergy.vebus/Ac/Out/P',
    acOutVolt: 'com.victronenergy.vebus/Ac/Out/L1/V',
  },
  // Temperature sensors
  temperature: {
    battery: 'com.victronenergy.temperature/Temperature',
  },
} as const;

/** MQTT topic prefix for Venus OS dbus-mqtt bridge (N/<portalId>/...) */
export const VENUS_MQTT_PREFIX = 'N';

// ─── Connection mode ─────────────────────────────────────────────────

export type VictronConnectionMode = 'mqtt' | 'websocket-legacy';

// ─── MQTT value payload from Venus OS ────────────────────────────────

interface VenusMQTTValue {
  value: number | string | null;
}

// ─── Node-RED WebSocket message (legacy fallback) ────────────────────

interface NodeREDEnergyMessage {
  type: 'ENERGY_UPDATE';
  data: {
    gridPower?: number;
    pvPower?: number;
    batteryPower?: number;
    houseLoad?: number;
    batterySoC?: number;
    heatPumpPower?: number;
    evPower?: number;
    gridVoltage?: number;
    batteryVoltage?: number;
    pvYieldToday?: number;
    priceCurrent?: number;
    gatewayType?: VictronGatewayType;
  };
}

const DEFAULT_RECONNECT = {
  enabled: true,
  initialDelayMs: 1500,
  maxDelayMs: 10_000,
  backoffMultiplier: 1.6,
};

export interface VictronAdapterConfig extends Partial<AdapterConnectionConfig> {
  gatewayType?: VictronGatewayType;
  /** Venus OS portal ID for MQTT topic prefix. Auto-detected if omitted. */
  portalId?: string;
  /** Connection mode: 'mqtt' (direct) or 'websocket-legacy' (Node-RED) */
  mode?: VictronConnectionMode;
}

export class VictronMQTTAdapter extends BaseAdapter {
  readonly id = 'victron-mqtt';
  readonly name = 'Victron Cerbo GX (MQTT)';
  readonly capabilities: AdapterCapability[] = ['pv', 'battery', 'grid', 'load'];

  private mqttClient: MqttClient | null = null;
  private legacyWs: WebSocket | null = null;
  private portalId: string | null = null;
  private connectionMode: VictronConnectionMode;

  /** Detected or configured gateway hardware type */
  gatewayType: VictronGatewayType = 'cerbo-gx';

  /** Live values keyed by D-Bus path suffix */
  private values: Map<string, number> = new Map();

  /** Keepalive timer for MQTT reads */
  private keepaliveTimer: ReturnType<typeof setInterval> | null = null;

  constructor(config?: VictronAdapterConfig) {
    super({
      name: 'Victron Cerbo GX',
      host: config?.host ?? window.location.hostname,
      port: config?.port ?? 9001, // Venus OS MQTT-over-WebSocket default
      tls: config?.tls ?? window.location.protocol === 'https:',
      reconnect: { ...DEFAULT_RECONNECT, ...config?.reconnect },
      ...config,
    });
    this.gatewayType = config?.gatewayType ?? 'cerbo-gx';
    this.portalId = config?.portalId ?? null;
    this.connectionMode = config?.mode ?? 'mqtt';
  }

  // ─── BaseAdapter abstract implementations ─────────────────────────

  protected async _connect(): Promise<void> {
    if (this.connectionMode === 'websocket-legacy') {
      return this._connectLegacyWebSocket();
    }
    return this._connectMQTT();
  }

  private async _connectMQTT(): Promise<void> {
    this.setStatus('connecting');

    try {
      const connect = await loadMqtt();
      const protocol = this.config.tls ? 'wss' : 'ws';
      const url = `${protocol}://${this.config.host}:${this.config.port}/mqtt`;

      // Unique, identifiable client ID (prefix + random hex to avoid collisions)
      const clientSuffix =
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID().slice(0, 8)
          : Math.random().toString(36).slice(2, 10);
      const clientId = `nexus-hems-victron-${clientSuffix}`;

      const opts: Record<string, unknown> = {
        clientId,
        protocolVersion: 4,
        clean: true,
        connectTimeout: 10_000,
        keepalive: 30,
        // Disable mqtt.js built-in reconnect — BaseAdapter handles it with
        // exponential backoff, jitter, circuit breaker, and navigator.onLine
        reconnectPeriod: 0,
        // Last Will and Testament: inform subscribers on unexpected disconnect
        will: {
          topic: `nexus-hems/victron/${clientId}/status`,
          payload: JSON.stringify({ online: false, timestamp: Date.now() }),
          qos: 1,
          retain: true,
        },
      };

      // TLS hardening: reject untrusted certificates in production
      if (this.config.tls) {
        opts.rejectUnauthorized = true;
      }

      // Forward mTLS client certificates if configured
      if (this.config.clientCert) opts.cert = this.config.clientCert;
      if (this.config.clientKey) opts.key = this.config.clientKey;

      if (this.config.authToken) {
        opts.username = '';
        opts.password = this.config.authToken;
      }

      const client = connect(url, opts);
      this.mqttClient = client;

      client.on('connect', () => {
        this.resetRetryDelay();
        this.setStatus('connected');

        // Subscribe to all Venus OS notifications with QoS 1 for reliable delivery
        client.subscribe('N/+/+/+/#', { qos: 1 } as Record<string, unknown>);

        // Start keepalive reads (Venus OS requires periodic R/ reads to keep N/ flowing)
        this.startKeepalive();
      });

      client.on('message', (_topic: unknown, _payload: unknown) => {
        const topic = _topic as string;
        const payload = _payload as Buffer;
        this.handleMQTTMessage(topic, payload.toString());
      });

      client.on('close', () => {
        this.setStatus('disconnected');
        this.stopKeepalive();
        this.scheduleReconnect();
      });

      client.on('error', () => {
        this.setStatus('error', 'MQTT connection error');
      });
    } catch {
      this.setStatus('error', 'Failed to load MQTT library');
      this.scheduleReconnect();
    }
  }

  private _connectLegacyWebSocket(): void {
    this.setStatus('connecting');

    const protocol = this.config.tls ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${this.config.host}:${this.config.port}`;
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      this.resetRetryDelay();
      this.setStatus('connected');
    };

    ws.onmessage = (event: MessageEvent) => {
      try {
        const message = JSON.parse(String(event.data)) as NodeREDEnergyMessage;
        if (message.type === 'ENERGY_UPDATE') {
          if (message.data.gatewayType) {
            this.gatewayType = message.data.gatewayType;
          }
          const model = this.legacyToUnifiedModel(message.data);
          this.emitData(model);
        }
      } catch {
        // Non-JSON or unknown message format
      }
    };

    ws.onclose = () => {
      this.setStatus('disconnected');
      this.scheduleReconnect();
    };

    ws.onerror = () => {
      ws.close();
    };

    this.legacyWs = ws;
  }

  protected async _disconnect(): Promise<void> {
    this.stopKeepalive();
    if (this.mqttClient) {
      this.mqttClient.end(true);
      this.mqttClient = null;
    }
    if (this.legacyWs) {
      this.legacyWs.close();
      this.legacyWs = null;
    }
  }

  protected async _sendCommand(command: AdapterCommand): Promise<boolean> {
    if (this.connectionMode === 'websocket-legacy') {
      return this._sendLegacyCommand(command);
    }
    return this._sendMQTTCommand(command);
  }

  private _sendMQTTCommand(command: AdapterCommand): boolean {
    if (!this.mqttClient?.connected || !this.portalId) return false;

    const mapping = this.mapCommandToDBus(command);
    if (!mapping) return false;

    const topic = `W/${this.portalId}/${mapping.service}/${mapping.path}`;
    this.mqttClient.publish(topic, JSON.stringify({ value: mapping.value }));
    return true;
  }

  private _sendLegacyCommand(command: AdapterCommand): boolean {
    const mapped = this.mapLegacyCommand(command);
    if (!mapped) return false;

    if (this.legacyWs?.readyState === WebSocket.OPEN) {
      this.legacyWs.send(JSON.stringify(mapped));
      return true;
    }
    return false;
  }

  protected _cleanup(): void {
    this.stopKeepalive();
    this.mqttClient?.end(true);
    this.mqttClient = null;
    this.legacyWs?.close();
    this.legacyWs = null;
    this.values.clear();
  }

  // ─── MQTT message handling ────────────────────────────────────────

  private handleMQTTMessage(topic: string, payload: string): void {
    // Topic: N/<portalId>/<service>/<instance>/<path...>
    const parts = topic.split('/');
    if (parts.length < 4 || parts[0] !== 'N') return;

    // Auto-detect portal ID from first message
    if (!this.portalId) {
      this.portalId = parts[1];
      this.log.debug('Auto-detected Venus OS portal ID', { portalId: this.portalId });
    }

    try {
      const msg = JSON.parse(payload) as VenusMQTTValue;
      if (msg.value === null || msg.value === undefined) return;

      const value = typeof msg.value === 'string' ? parseFloat(msg.value) : msg.value;
      if (typeof value !== 'number' || !Number.isFinite(value)) return;

      // Build a normalized key: service/path (skip portalId and instance)
      const service = parts[2]; // e.g. "com.victronenergy.grid"
      const path = parts.slice(4).join('/'); // e.g. "Ac/Power"
      const key = `${service}/${path}`;

      this.values.set(key, value);
      this.emitCurrentModel();
    } catch {
      // Invalid JSON payload
    }
  }

  private emitCurrentModel(): void {
    const v = (key: string) => this.values.get(key);

    const pvPower =
      v('com.victronenergy.pvinverter/Ac/Power') ??
      v('com.victronenergy.solarcharger/Yield/Power') ??
      0;
    const pvYield =
      v('com.victronenergy.pvinverter/Ac/Energy/Forward') ??
      v('com.victronenergy.solarcharger/Yield/System') ??
      0;

    const battPower = v('com.victronenergy.battery/Dc/0/Power') ?? 0;
    const battSoc = v('com.victronenergy.battery/Soc') ?? 0;
    const battVoltage = v('com.victronenergy.battery/Dc/0/Voltage') ?? 51.2;
    const battCurrent = v('com.victronenergy.battery/Dc/0/Current') ?? 0;

    const gridPower = v('com.victronenergy.grid/Ac/Power') ?? 0;
    const gridVoltage = v('com.victronenergy.grid/Ac/L1/Voltage') ?? 230;
    const gridEnergyFwd = v('com.victronenergy.grid/Ac/Energy/Forward');
    const gridEnergyRev = v('com.victronenergy.grid/Ac/Energy/Reverse');

    const gridL1V = v('com.victronenergy.grid/Ac/L1/Voltage');
    const gridL2V = v('com.victronenergy.grid/Ac/L2/Voltage');
    const gridL3V = v('com.victronenergy.grid/Ac/L3/Voltage');

    const vebusPower = v('com.victronenergy.vebus/Ac/Out/P') ?? 0;

    // House load = PV + Battery discharge + Grid import - Battery charge - Grid export
    // Or use VE.Bus AC out power if available
    const houseLoad = vebusPower > 0 ? vebusPower : Math.max(0, pvPower - battPower + gridPower);

    const model: Partial<UnifiedEnergyModel> = {
      timestamp: Date.now(),
      pv: {
        totalPowerW: pvPower,
        yieldTodayKWh: pvYield / 1000,
      },
      battery: {
        powerW: battPower,
        socPercent: battSoc,
        voltageV: battVoltage,
        currentA: battCurrent,
      },
      grid: {
        powerW: gridPower,
        voltageV: gridVoltage,
        energyImportKWh: gridEnergyFwd ? gridEnergyFwd / 1000 : undefined,
        energyExportKWh: gridEnergyRev ? gridEnergyRev / 1000 : undefined,
        phases:
          gridL1V != null
            ? [
                { voltageV: gridL1V, currentA: 0, powerW: 0 },
                ...(gridL2V != null ? [{ voltageV: gridL2V, currentA: 0, powerW: 0 }] : []),
                ...(gridL3V != null ? [{ voltageV: gridL3V, currentA: 0, powerW: 0 }] : []),
              ]
            : undefined,
      },
      load: {
        totalPowerW: houseLoad,
        heatPumpPowerW: 0,
        evPowerW: 0,
        otherPowerW: houseLoad,
      },
    };

    this.emitData(model);
  }

  // ─── Keepalive (Venus OS requires periodic R/ reads) ──────────────

  private startKeepalive(): void {
    this.stopKeepalive();
    this.keepaliveTimer = setInterval(() => {
      if (!this.mqttClient?.connected || !this.portalId) return;
      // Send keepalive read to system service to keep N/ messages flowing
      this.mqttClient.publish(`R/${this.portalId}/system/0/Serial`, '');
    }, 25_000);
  }

  private stopKeepalive(): void {
    if (this.keepaliveTimer) {
      clearInterval(this.keepaliveTimer);
      this.keepaliveTimer = null;
    }
  }

  // ─── Command mapping → Venus OS D-Bus writes ─────────────────────

  private mapCommandToDBus(
    command: AdapterCommand,
  ): { service: string; path: string; value: number | string | boolean } | null {
    switch (command.type) {
      case 'SET_BATTERY_POWER':
        return {
          service: 'com.victronenergy.settings/0',
          path: 'Settings/CGwacs/MaxDischargePower',
          value: Number(command.value),
        };
      case 'SET_BATTERY_MODE':
        // VE.Bus mode: 1=Charger, 2=Inverter, 3=On, 4=Off
        return {
          service: 'com.victronenergy.vebus/276',
          path: 'Mode',
          value: Number(command.value),
        };
      case 'SET_GRID_LIMIT':
        return {
          service: 'com.victronenergy.settings/0',
          path: 'Settings/CGwacs/MaxFeedInPower',
          value: Number(command.value),
        };
      case 'SET_EV_POWER':
      case 'SET_HEAT_PUMP_POWER':
        // These go through the relay on the Cerbo GX
        return {
          service: 'com.victronenergy.system/0',
          path: `Relay/${command.type === 'SET_EV_POWER' ? '1' : '0'}/State`,
          value: Number(command.value) > 0 ? 1 : 0,
        };
      default:
        return null;
    }
  }

  // ─── Legacy helpers ───────────────────────────────────────────────

  private legacyToUnifiedModel(data: NodeREDEnergyMessage['data']): Partial<UnifiedEnergyModel> {
    return {
      timestamp: Date.now(),
      pv: {
        totalPowerW: data.pvPower ?? 0,
        yieldTodayKWh: data.pvYieldToday ?? 0,
      },
      battery: {
        powerW: data.batteryPower ?? 0,
        socPercent: data.batterySoC ?? 0,
        voltageV: data.batteryVoltage ?? 51.2,
        currentA: (data.batteryPower ?? 0) / (data.batteryVoltage || 51.2),
      },
      grid: {
        powerW: data.gridPower ?? 0,
        voltageV: data.gridVoltage ?? 230,
      },
      load: {
        totalPowerW: data.houseLoad ?? 0,
        heatPumpPowerW: data.heatPumpPower ?? 0,
        evPowerW: data.evPower ?? 0,
        otherPowerW: Math.max(
          0,
          (data.houseLoad ?? 0) - (data.heatPumpPower ?? 0) - (data.evPower ?? 0),
        ),
      },
      ...(data.priceCurrent != null && {
        tariff: { currentPriceEurKWh: data.priceCurrent, provider: 'tibber' as const },
      }),
    };
  }

  private mapLegacyCommand(
    command: AdapterCommand,
  ): { type: string; value: number | string | boolean } | null {
    const mapping: Record<string, string> = {
      SET_EV_POWER: 'SET_EV_POWER',
      SET_HEAT_PUMP_POWER: 'SET_HEAT_PUMP_POWER',
      SET_HEAT_PUMP_MODE: 'SET_HEAT_PUMP_POWER',
      SET_BATTERY_POWER: 'SET_BATTERY_POWER',
      SET_BATTERY_MODE: 'SET_BATTERY_POWER',
    };

    const type = mapping[command.type];
    if (!type) return null;
    return { type, value: command.value };
  }
}
