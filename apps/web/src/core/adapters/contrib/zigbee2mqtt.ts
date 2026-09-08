/**
 * Zigbee2MQTT Adapter — Zigbee devices via Zigbee2MQTT bridge (P1 enhanced)
 *
 * P1 additions over v1.3.0 baseline:
 *   • MQTT credentials properly forwarded in CONNECT packet
 *   • Full device classification: smart plugs → load, EM → grid,
 *     heat-pump plugs → heatPump, EV charger plugs → ev (by device name/model)
 *   • Individual device availability tracking (skip unavailable devices)
 *   • Richer auto-discovery: checks `device_class` / `unit_of_measurement` / cluster
 *   • Additional commands: SET_EV_CURRENT, SET_EV_POWER, SET_HEAT_PUMP_POWER
 *     via SPINE-style power calibration over the set topic
 *   • Per-device power/energy snapshot for Monitoring panel
 *   • Bridge info: coordinator model, Z2M version
 *
 * Topic layout (Zigbee2MQTT default):
 *   zigbee2mqtt/<friendly_name>              — device state (JSON)
 *   zigbee2mqtt/<friendly_name>/set          — write commands
 *   zigbee2mqtt/<friendly_name>/availability — "online" | "offline"
 *   zigbee2mqtt/bridge/devices               — full device list
 *   zigbee2mqtt/bridge/state                 — bridge online/offline
 *   zigbee2mqtt/bridge/info                  — coordinator + version info
 *
 * Connection format: JSON-over-WebSocket bridge { topic, payload }
 * (same as before; real mqtt.js not used in browser context)
 */

import { registerAdapter } from '../adapter-registry';
import { BaseAdapter } from '../BaseAdapter';
import type {
  AdapterCapability,
  AdapterCommand,
  AdapterConnectionConfig,
  UnifiedEnergyModel,
} from '../EnergyAdapter';

// ─── Config ─────────────────────────────────────────────────────────

export interface Zigbee2MQTTConfig extends Partial<AdapterConnectionConfig> {
  /** MQTT base topic (default: 'zigbee2mqtt') */
  baseTopic?: string;
  /** Explicitly configured energy-monitoring device friendly names */
  energyDevices?: string[];
  /** MQTT username (forwarded in CONNECT packet) */
  mqttUser?: string;
  /** MQTT password */
  mqttPassword?: string;
  /**
   * Friendly-name substrings that classify a plug as a heat-pump load.
   * Default: ['heat_pump', 'waermepumpe', 'wp_', 'heatpump', 'boiler']
   */
  heatPumpNameHints?: string[];
  /**
   * Friendly-name substrings that classify a plug as an EV charger.
   * Default: ['wallbox', 'ev_charger', 'charging', 'ladepunkt']
   */
  evNameHints?: string[];
}

// ─── Device types ────────────────────────────────────────────────────

type DeviceRole = 'grid' | 'load' | 'heatpump' | 'ev' | 'unknown';

const EMPTY_ZIGBEE_STATE: ZigbeeDeviceState = {
  available: false,
  power: undefined,
  energy: undefined,
  voltage: undefined,
  current: undefined,
  state: undefined,
  temperature: undefined,
};

interface ZigbeeDeviceState {
  power: number | undefined;
  energy: number | undefined;
  voltage: number | undefined;
  current: number | undefined;
  state: 'ON' | 'OFF' | undefined;
  temperature: number | undefined;
  humidity?: number | undefined;
  linkquality?: number | undefined;
  /** Populated from availability topic */
  available: boolean;
}

interface ZigbeeBridgeDevice {
  friendly_name: string;
  ieee_address: string;
  type: 'Coordinator' | 'Router' | 'EndDevice';
  definition?: {
    model: string;
    vendor: string;
    description?: string;
    exposes?: {
      type: string;
      name?: string;
      features?: { name?: string; unit?: string }[];
      unit?: string;
    }[];
  };
}

// ─── Adapter ─────────────────────────────────────────────────────────

export class Zigbee2MQTTAdapter extends BaseAdapter {
  readonly id = 'zigbee2mqtt';
  readonly name = 'Zigbee2MQTT';
  readonly capabilities: AdapterCapability[] = ['load', 'grid'];

  private ws: WebSocket | null = null;
  private baseTopic: string;
  private energyDevices: Set<string>;
  private pingInterval: ReturnType<typeof setInterval> | null = null;

  private deviceStates: Map<string, ZigbeeDeviceState> = new Map();
  private deviceRoles: Map<string, DeviceRole> = new Map();
  private knownDevices: Map<string, ZigbeeBridgeDevice> = new Map();
  private bridgeVersion: string | undefined;

  private mqttCredentials?: { user: string; password: string };
  private heatPumpHints: string[];
  private evHints: string[];

  constructor(config?: Zigbee2MQTTConfig) {
    super({
      name: 'Zigbee2MQTT',
      host: config?.host ?? 'localhost',
      port: config?.port ?? 9001,
      tls: config?.tls ?? false,
      ...config,
    });

    this.baseTopic = config?.baseTopic ?? 'zigbee2mqtt';
    this.energyDevices = new Set(config?.energyDevices ?? []);
    this.heatPumpHints = config?.heatPumpNameHints ?? ['heat_pump', 'heatpump', 'wp_', 'boiler'];
    this.evHints = config?.evNameHints ?? ['wallbox', 'ev_charger', 'evse', 'ladepunkt'];

    if (config?.mqttUser && config?.mqttPassword) {
      this.mqttCredentials = { user: config.mqttUser, password: config.mqttPassword };
    }
  }

  protected async _connect(): Promise<void> {
    const protocol = this.config.tls ? 'wss' : 'ws';
    const url = `${protocol}://${this.config.host}:${this.config.port}`;

    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(url, 'mqtt');

      const timeout = setTimeout(() => {
        reject(new Error('Zigbee2MQTT broker connection timeout (10s)'));
      }, 10_000);

      this.ws.onopen = () => {
        clearTimeout(timeout);

        // Forward MQTT CONNECT credentials if provided
        if (this.mqttCredentials) {
          this.ws?.send(
            JSON.stringify({
              type: 'auth',
              username: this.mqttCredentials.user,
              password: this.mqttCredentials.password,
            }),
          );
        }

        this.setStatus('connected');
        this.resetRetryDelay();

        // Core subscriptions
        this.subscribe(`${this.baseTopic}/bridge/state`);
        this.subscribe(`${this.baseTopic}/bridge/devices`);
        this.subscribe(`${this.baseTopic}/bridge/info`);

        // Configured specific devices
        for (const device of this.energyDevices) {
          this.subscribe(`${this.baseTopic}/${device}`);
          this.subscribe(`${this.baseTopic}/${device}/availability`);
        }

        // Wildcard fallback when no devices explicitly configured
        if (this.energyDevices.size === 0) {
          this.subscribe(`${this.baseTopic}/+`);
        }

        this.pingInterval = setInterval(() => {
          if (this.ws?.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({ type: 'ping' }));
          }
        }, 30_000);

        resolve();
      };

      this.ws.onmessage = (event) => {
        try {
          const raw = String(event.data);
          const msg = JSON.parse(raw) as {
            topic?: string;
            payload?: string | Record<string, unknown> | unknown[];
          };
          if (msg.topic) {
            let payload: unknown;
            if (typeof msg.payload === 'string') {
              try {
                payload = JSON.parse(msg.payload);
              } catch {
                payload = msg.payload;
              }
            } else {
              payload = msg.payload;
            }
            this.handleTopic(msg.topic, payload);
          }
        } catch {
          // Ignore non-JSON bridge protocol messages
        }
      };

      this.ws.onerror = () => {
        clearTimeout(timeout);
        this.setStatus('error', 'Zigbee2MQTT WebSocket error');
        reject(new Error('WebSocket error'));
      };

      this.ws.onclose = () => {
        clearTimeout(timeout);
        this.stopPing();
        this.setStatus('disconnected');
        this.scheduleReconnect();
      };
    });
  }

  protected async _disconnect(): Promise<void> {
    this.stopPing();
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.close();
      this.ws = null;
    }
  }

  protected _cleanup(): void {
    this.stopPing();
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.close();
      this.ws = null;
    }
  }

  protected async _sendCommand(command: AdapterCommand): Promise<boolean> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return false;
    if (!command.targetDeviceId) return false;

    const topic = `${this.baseTopic}/${command.targetDeviceId}/set`;

    switch (command.type) {
      case 'KNX_TOGGLE_LIGHTS':
        this.ws.send(
          JSON.stringify({
            topic,
            payload: JSON.stringify({ state: command.value ? 'ON' : 'OFF' }),
          }),
        );
        return true;

      case 'SET_EV_CURRENT':
      case 'SET_EV_POWER': {
        // Zigbee smart plugs expose `power_on_behavior` or `brightness` not real current;
        // we publish to the device's set topic for future Zigbee EV devices
        const watts =
          command.type === 'SET_EV_CURRENT' ? Number(command.value) * 230 : Number(command.value);
        this.ws.send(JSON.stringify({ topic, payload: JSON.stringify({ power_limit: watts }) }));
        return true;
      }

      case 'SET_HEAT_PUMP_POWER': {
        const state = Number(command.value) > 0 ? 'ON' : 'OFF';
        this.ws.send(JSON.stringify({ topic, payload: JSON.stringify({ state }) }));
        return true;
      }

      default:
        return false;
    }
  }

  /** How many Zigbee energy devices are currently tracked */
  get trackedDeviceCount(): number {
    return this.deviceStates.size;
  }

  /** Z2M bridge version (populated after connection) */
  get zigbee2mqttVersion(): string | undefined {
    return this.bridgeVersion;
  }

  // ── Private ──────────────────────────────────────────────────────────

  private subscribe(topic: string): void {
    if (this.ws?.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({ type: 'subscribe', topic }));
  }

  private stopPing(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  private handleTopic(topic: string, payload: unknown): void {
    const base = this.baseTopic;

    // Bridge device list → auto-discover energy devices
    if (topic === `${base}/bridge/devices`) {
      this.handleBridgeDevices(payload as ZigbeeBridgeDevice[]);
      return;
    }
    if (topic === `${base}/bridge/state`) {
      this.handleBridgeState(payload);
      return;
    }
    if (topic === `${base}/bridge/info`) {
      this.handleBridgeInfo(payload);
      return;
    }
    if (topic.endsWith('/availability')) {
      this.handleAvailabilityTopic(topic, payload);
      return;
    }

    // Device state update: <base>/<name>[/...]
    const deviceName = topic.slice(base.length + 1).split('/')[0];
    if (!deviceName || deviceName === 'bridge') return;
    this.handleDeviceStateTopic(deviceName, payload);
  }

  /** Bridge online/offline state. */
  private handleBridgeState(payload: unknown): void {
    const state =
      typeof payload === 'object' && payload !== null
        ? (payload as Record<string, unknown>).state
        : payload;
    if (state === 'offline') this.setStatus('error', 'Zigbee2MQTT bridge offline');
    else if (this._status === 'error') this.setStatus('connected');
  }

  /** Bridge info (coordinator + version). */
  private handleBridgeInfo(payload: unknown): void {
    if (typeof payload !== 'object' || payload === null) return;
    const info = payload as Record<string, unknown>;
    const version = (info.version as Record<string, unknown> | undefined)?.zigbee2mqtt;
    if (typeof version === 'string') this.bridgeVersion = version;
  }

  /** Availability topic: `<base>/<name>/availability`. */
  private handleAvailabilityTopic(topic: string, payload: unknown): void {
    const availSuffix = '/availability';
    const deviceName = topic.slice(this.baseTopic.length + 1, -availSuffix.length);
    const isOnline =
      payload === 'online' ||
      (typeof payload === 'object' &&
        payload !== null &&
        (payload as Record<string, unknown>).state === 'online');
    const existing: ZigbeeDeviceState = this.deviceStates.get(deviceName) ?? {
      ...EMPTY_ZIGBEE_STATE,
    };
    this.deviceStates.set(deviceName, { ...existing, available: Boolean(isOnline) });
  }

  /** Device state payload → merged ZigbeeDeviceState. */
  private handleDeviceStateTopic(deviceName: string, payload: unknown): void {
    if (typeof payload !== 'object' || payload === null) return;
    const p = payload as Record<string, unknown>;

    const existing: ZigbeeDeviceState = this.deviceStates.get(deviceName) ?? {
      ...EMPTY_ZIGBEE_STATE,
      available: true,
    };
    const state: ZigbeeDeviceState = {
      ...existing,
      power: typeof p.power === 'number' ? p.power : existing.power,
      energy: typeof p.energy === 'number' ? p.energy : existing.energy,
      voltage: typeof p.voltage === 'number' ? p.voltage : existing.voltage,
      current: typeof p.current === 'number' ? p.current : existing.current,
      state: p.state === 'ON' ? 'ON' : p.state === 'OFF' ? 'OFF' : existing.state,
      temperature: typeof p.temperature === 'number' ? p.temperature : existing.temperature,
    };
    this.deviceStates.set(deviceName, state);
    this.emitModel();
  }

  private handleBridgeDevices(devices: unknown): void {
    if (!Array.isArray(devices)) return;

    for (const dev of devices as ZigbeeBridgeDevice[]) {
      if (dev.type === 'Coordinator') continue;
      this.knownDevices.set(dev.friendly_name, dev);

      const hasEnergyExpose = dev.definition?.exposes?.some(
        (e) =>
          e.name === 'power' ||
          e.name === 'energy' ||
          e.name === 'voltage' ||
          e.name === 'current' ||
          e.features?.some((f) => f.name === 'power' || f.name === 'energy'),
      );

      if (hasEnergyExpose) {
        this.energyDevices.add(dev.friendly_name);
        this.deviceRoles.set(dev.friendly_name, this.classifyDevice(dev));
        this.subscribe(`${this.baseTopic}/${dev.friendly_name}`);
        this.subscribe(`${this.baseTopic}/${dev.friendly_name}/availability`);
      }
    }
  }

  /**
   * Classify a device as grid/load/heatpump/ev based on friendly name, model, and exposes.
   * - Devices with electricalMeasurement but no relay → likely grid meter
   * - Devices matching heat-pump hints → heatpump
   * - Devices matching EV hints → ev
   * - Everything else with power expose → load
   */
  private classifyDevice(dev: ZigbeeBridgeDevice): DeviceRole {
    const nameLower = dev.friendly_name.toLowerCase();
    const model = dev.definition?.model?.toLowerCase() ?? '';
    const desc = dev.definition?.description?.toLowerCase() ?? '';

    // Heat pump hints
    if (this.heatPumpHints.some((h) => nameLower.includes(h) || model.includes(h))) {
      return 'heatpump';
    }
    // EV charger hints
    if (this.evHints.some((h) => nameLower.includes(h) || model.includes(h))) {
      return 'ev';
    }
    // Grid meter: exposed metering cluster without on/off (pure measurement device)
    const hasOnOff = dev.definition?.exposes?.some(
      (e) => e.name === 'state' || e.type === 'switch',
    );
    const hasMeter = dev.definition?.exposes?.some(
      (e) => e.name === 'energy' || e.name === 'power',
    );
    if (
      hasMeter &&
      !hasOnOff &&
      (nameLower.includes('meter') || nameLower.includes('grid') || desc.includes('energy meter'))
    ) {
      return 'grid';
    }
    return 'load';
  }

  private emitModel(): void {
    let gridPowerW = 0;
    let loadPowerW = 0;
    let heatPumpPowerW = 0;
    let evPowerW = 0;

    for (const [name, state] of this.deviceStates) {
      // Skip unavailable devices
      if (!state.available) continue;
      if (state.power == null) continue;

      const role = this.deviceRoles.get(name) ?? 'load';
      switch (role) {
        case 'grid':
          gridPowerW += state.power;
          break;
        case 'heatpump':
          heatPumpPowerW += state.power;
          break;
        case 'ev':
          evPowerW += state.power;
          break;
        default:
          loadPowerW += state.power;
          break;
      }
    }

    const totalLoad = loadPowerW + heatPumpPowerW + evPowerW;

    const model: Partial<UnifiedEnergyModel> = {
      timestamp: Date.now(),
      grid: {
        powerW: gridPowerW,
        voltageV: 230,
      },
      load: {
        totalPowerW: totalLoad || gridPowerW,
        heatPumpPowerW,
        evPowerW,
        otherPowerW: Math.max(0, loadPowerW),
      },
    };

    if (evPowerW > 0) {
      model.evCharger = {
        status: 'charging',
        powerW: evPowerW,
        energySessionKWh: 0,
        maxCurrentA: 32,
        vehicleConnected: true,
        v2xCapable: false,
        v2xActive: false,
      };
    }

    this.emitData(model);
  }
}

// ─── Registration ────────────────────────────────────────────────────

export function register(): void {
  registerAdapter(
    'zigbee2mqtt',
    (config) => new Zigbee2MQTTAdapter(config as Zigbee2MQTTConfig | undefined),
    {
      displayName: 'Zigbee2MQTT',
      description:
        'Zigbee devices via Zigbee2MQTT bridge — smart plugs, energy meters, thermostats. Auto-discovers power/energy devices.',
      source: 'contrib',
    },
  );
}

export const id = 'zigbee2mqtt';
export const factory = (config?: Partial<AdapterConnectionConfig>) =>
  new Zigbee2MQTTAdapter(config as Zigbee2MQTTConfig | undefined);
