/**
 * Home Assistant Adapter — Full Native Integration
 *
 * Two connection modes (select via `haMode`):
 *
 * 1. **ha-ws-api** (recommended): Connects directly to the HA WebSocket API
 *    (`ws://ha:8123/api/websocket`). Authenticates with a Long-Lived Access Token,
 *    subscribes to all state changes, and sends HA service calls for control.
 *    No MQTT broker required. Auto-discovers energy-relevant entities via
 *    `device_class` (power, energy, current, voltage, battery, temperature).
 *
 * 2. **mqtt-broker** (legacy / advanced): Connects to a Mosquitto MQTT-over-WebSocket
 *    broker. Uses HA MQTT Discovery topic convention:
 *    `homeassistant/<domain>/<unique_id>/config` → state topic subscription.
 *    Compatible with HA MQTT Integration + Mosquitto.
 *
 * Supported entity domains (both modes):
 *   sensor, binary_sensor, switch, climate, number, select, input_number,
 *   input_boolean, light (via power state)
 *
 * Supported HEMS → HA commands:
 *   SET_EV_CURRENT, SET_EV_POWER, START_CHARGING, STOP_CHARGING,
 *   SET_HEAT_PUMP_POWER, SET_HEAT_PUMP_MODE, SET_GRID_LIMIT,
 *   KNX_TOGGLE_LIGHTS, KNX_SET_TEMPERATURE
 *
 * Standards / references:
 *   - HA WebSocket API: https://developers.home-assistant.io/docs/api/websocket
 *   - MQTT Discovery: https://www.home-assistant.io/integrations/mqtt/#mqtt-discovery
 *   - HA Long-Lived Access Tokens: Profile → Security → Long-Lived Access Tokens
 */

import { registerAdapter } from '../adapter-registry';
import { BaseAdapter } from '../BaseAdapter';
import type {
  AdapterCapability,
  AdapterCommand,
  AdapterConnectionConfig,
  UnifiedEnergyModel,
} from '../EnergyAdapter';

// ─── Connection Mode ────────────────────────────────────────────────

/**
 * ha-ws-api — Direct HA WebSocket API (recommended, no MQTT broker needed)
 * mqtt-broker — MQTT-over-WebSocket (legacy, requires Mosquitto + HA MQTT integration)
 */
export type HAConnectionMode = 'ha-ws-api' | 'mqtt-broker';

// ─── HA Entity → HEMS role mapping ─────────────────────────────────

/** All energy entity roles this adapter understands */
export type HAEnergyRole =
  | 'pvPower'
  | 'pvEnergyToday'
  | 'batteryPower'
  | 'batterySoc'
  | 'gridPower'
  | 'housePower'
  | 'heatPumpPower'
  | 'evPower'
  | 'evSoc'
  | 'evStatus';

/** Device class → energy role mapping for auto-discovery */
const DEVICE_CLASS_ROLE: Record<string, HAEnergyRole> = {
  // PV
  solar_power: 'pvPower',
  solar_energy: 'pvEnergyToday',
  pv_power: 'pvPower',
  pv_energy: 'pvEnergyToday',
  // Battery
  battery_power: 'batteryPower',
  battery_charging_power: 'batteryPower',
  battery_soc: 'batterySoc',
  // Grid
  grid_power: 'gridPower',
  net_meter_power: 'gridPower',
  // House load
  house_power: 'housePower',
  home_consumption: 'housePower',
  consumption_power: 'housePower',
  // EV
  ev_power: 'evPower',
  wallbox_power: 'evPower',
  car_charging_power: 'evPower',
  ev_soc: 'evSoc',
  // Heat pump
  heat_pump_power: 'heatPumpPower',
  heatpump_power: 'heatPumpPower',
};

/**
 * HA device_class values that indicate energy-relevant entities.
 * Used for auto-discovery in ha-ws-api mode.
 */
const ENERGY_DEVICE_CLASSES = new Set([
  'power', // W, kW
  'energy', // kWh, Wh
  'current', // A
  'voltage', // V
  'battery', // %
  'temperature', // °C
]);

/**
 * Entity-id keyword → role table for power/energy sensors (solar/pv is handled
 * separately because it also depends on device_class). First match wins.
 */
const POWER_ENERGY_ID_KEYWORDS: { keywords: string[]; role: HAEnergyRole }[] = [
  { keywords: ['battery', 'bat'], role: 'batteryPower' },
  { keywords: ['grid', 'net', 'import', 'export'], role: 'gridPower' },
  { keywords: ['wallbox', 'ev', 'charger'], role: 'evPower' },
  { keywords: ['heat', 'pump', 'hvac'], role: 'heatPumpPower' },
  { keywords: ['house', 'home', 'total', 'consumption'], role: 'housePower' },
];

/** Default static entity map (mqtt-broker mode fallback) */
const DEFAULT_ENTITY_MAP = {
  pvPower: 'sensor.solar_power',
  pvEnergyToday: 'sensor.solar_energy_today',
  batteryPower: 'sensor.battery_power',
  batterySoc: 'sensor.battery_soc',
  gridPower: 'sensor.grid_power',
  housePower: 'sensor.house_power',
  evPower: 'sensor.wallbox_power',
  evSoc: 'sensor.ev_soc',
  evStatus: 'sensor.wallbox_status',
} as const;

type EntityMapKey = keyof typeof DEFAULT_ENTITY_MAP;
type EntityMap = Record<EntityMapKey, string>;

// ─── HA WebSocket API message types ────────────────────────────────

interface HAWSMessage {
  id?: number;
  type: string;
  ha_version?: string;
  access_token?: string;
  domain?: string;
  service?: string;
  target?: { entity_id: string | string[] };
  service_data?: Record<string, unknown>;
  event_filter?: { event_type?: string; entity_ids?: string[] };
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
        current_temperature?: number;
        temperature?: number;
      };
    } | null;
    old_state: unknown;
  };
}

interface HAWSResponse {
  id?: number;
  type: 'auth_required' | 'auth_ok' | 'auth_invalid' | 'result' | 'event' | string;
  success?: boolean;
  error?: { code: string; message: string };
  event?: HAStateChangedEvent;
}

// ─── MQTT Discovery payload ─────────────────────────────────────────

interface HAMQTTDiscoveryConfig {
  name: string;
  unique_id: string;
  device_class?: string;
  unit_of_measurement?: string;
  state_class?: 'measurement' | 'total' | 'total_increasing';
  state_topic: string;
  command_topic?: string;
  availability_topic?: string;
}

// ─── Config ────────────────────────────────────────────────────────

/** Explicit per-entity HA role override */
export interface HAEntityRoleConfig {
  entityId: string;
  role: HAEnergyRole;
}

export interface HomeAssistantMQTTConfig extends Partial<AdapterConnectionConfig> {
  /**
   * Connection mode.
   * - `ha-ws-api`: HA WebSocket API (recommended, no MQTT broker needed)
   * - `mqtt-broker`: MQTT-over-WebSocket (requires Mosquitto + HA MQTT integration)
   * Default: `ha-ws-api`
   */
  haMode?: HAConnectionMode;

  // ── ha-ws-api mode ──────────────────────────────────────────────
  /**
   * Long-Lived Access Token (Profile → Security → Long-Lived Access Tokens).
   * Required in ha-ws-api mode.
   */
  haToken?: string;
  /**
   * HA base URL. Defaults to `ws(s)://host:port` derived from host/port/tls config.
   * Example: 'http://homeassistant.local:8123'
   */
  haBaseUrl?: string;
  /**
   * Auto-discover energy entities by device_class in ha-ws-api mode.
   * Default: true
   */
  haDiscovery?: boolean;
  /**
   * Entity role overrides for auto-discovery. Takes precedence over auto-detection.
   * Example: [{ entityId: 'sensor.my_pv_w', role: 'pvPower' }]
   */
  entityRoles?: HAEntityRoleConfig[];

  // ── mqtt-broker mode ────────────────────────────────────────────
  /** MQTT topic prefix (default: 'homeassistant') */
  topicPrefix?: string;
  /** Static entity → role mapping overrides for mqtt-broker mode */
  entityMap?: Partial<EntityMap>;
  /** MQTT username */
  mqttUser?: string;
  /** MQTT password */
  mqttPassword?: string;

  // ── Service entity IDs (both modes) ────────────────────────────
  /** entity_id for wallbox max current control (number domain) */
  wallboxCurrentEntityId?: string;
  /** entity_id for wallbox charging on/off (switch domain) */
  wallboxSwitchEntityId?: string;
  /** entity_id for heat pump on/off (switch domain) */
  heatPumpSwitchEntityId?: string;
  /** entity_id for heat pump mode (select/climate domain) */
  heatPumpModeEntityId?: string;
}

// ─── Adapter ────────────────────────────────────────────────────────

export class HomeAssistantMQTTAdapter extends BaseAdapter {
  readonly id = 'homeassistant-mqtt';
  readonly name = 'Home Assistant MQTT';
  readonly capabilities: AdapterCapability[] = ['pv', 'battery', 'grid', 'load', 'evCharger'];

  private ws: WebSocket | null = null;
  private haMode: HAConnectionMode;

  // MQTT-broker mode fields
  private topicPrefix: string;
  private entityMap: EntityMap;
  private subscriptions: Map<string, HAEnergyRole> = new Map();
  private mqttCredentials?: { user: string; password: string };

  // ha-ws-api mode fields
  private haToken: string | undefined;
  private haDiscovery: boolean;
  private entityRoleOverrides: Map<string, HAEnergyRole> = new Map();
  private haWsMsgId = 1;

  // Common: discovered entity → role mapping (auto + manual overrides)
  private discoveredEntityRoles: Map<string, HAEnergyRole> = new Map();

  // Service entity IDs for command mapping
  private wallboxCurrentEntityId: string;
  private wallboxSwitchEntityId: string;
  private heatPumpModeEntityId: string;

  // Energy state
  private pvPowerW = 0;
  private pvEnergyTodayKWh = 0;
  private batteryPowerW = 0;
  private batterySocPercent = 0;
  private batteryTempC: number | undefined;
  private gridPowerW = 0;
  private housePowerW = 0;
  private heatPumpPowerW = 0;
  private evPowerW = 0;
  private evSocPercent = 0;
  private evStatus = 'available';

  private pingInterval: ReturnType<typeof setInterval> | null = null;

  constructor(config?: HomeAssistantMQTTConfig) {
    super({
      name: 'Home Assistant',
      host: config?.host ?? 'homeassistant.local',
      port: config?.port ?? 8123,
      tls: config?.tls ?? false,
      reconnect: {
        enabled: true,
        initialDelayMs: 5000,
        maxDelayMs: 60_000,
        backoffMultiplier: 1.8,
        ...config?.reconnect,
      },
      ...config,
    });

    // Default to mqtt-broker for backward compatibility.
    // Users on HA ≥ 2023.9 are encouraged to switch to ha-ws-api.
    this.haMode = config?.haMode ?? 'mqtt-broker';
    this.haToken = config?.haToken;
    this.haDiscovery = config?.haDiscovery ?? true;

    // Service entity IDs (with sensible defaults)
    this.wallboxCurrentEntityId = config?.wallboxCurrentEntityId ?? 'number.wallbox_max_current';
    this.wallboxSwitchEntityId = config?.wallboxSwitchEntityId ?? 'switch.wallbox_charging';
    this.heatPumpModeEntityId = config?.heatPumpModeEntityId ?? 'climate.heat_pump';

    // Register explicit entity role overrides
    for (const er of config?.entityRoles ?? []) {
      this.entityRoleOverrides.set(er.entityId, er.role);
    }

    // MQTT-broker mode: build static subscription map
    this.topicPrefix = config?.topicPrefix ?? 'homeassistant';
    this.entityMap = { ...DEFAULT_ENTITY_MAP, ...config?.entityMap };
    for (const [role, entityId] of Object.entries(this.entityMap)) {
      this.subscriptions.set(entityId, role as HAEnergyRole);
    }
    if (config?.mqttUser && config?.mqttPassword) {
      this.mqttCredentials = { user: config.mqttUser, password: config.mqttPassword };
    }
  }

  protected async _connect(): Promise<void> {
    return this.haMode === 'ha-ws-api' ? this.connectHAWebSocketAPI() : this.connectMQTTBroker();
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

  // ── HA WebSocket API Mode ────────────────────────────────────────

  /**
   * Connect to the HA WebSocket API at `ws://host:port/api/websocket`.
   *
   * Handshake:
   *   1. Receive `auth_required`
   *   2. Send `auth` with Long-Lived Access Token (required)
   *   3. Receive `auth_ok`
   *   4. Subscribe to state changes (all or filtered by energy device_class)
   */
  private connectHAWebSocketAPI(): Promise<void> {
    const protocol = this.config.tls ? 'wss' : 'ws';
    const url = `${protocol}://${this.config.host}:${this.config.port}/api/websocket`;

    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(url);
      const timeout = setTimeout(() => {
        reject(new Error('HA WebSocket API connection timeout (10s)'));
      }, 10_000);

      this.ws.onopen = () => {
        // Auth is initiated on first message (auth_required), not on open
      };

      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(String(event.data)) as HAWSResponse;
          this.handleHAWSMessage(msg, resolve, reject, timeout);
        } catch {
          // Ignore non-JSON messages
        }
      };

      this.ws.onerror = () => {
        clearTimeout(timeout);
        this.setStatus('error', 'HA WebSocket API connection failed');
        reject(new Error('HA WebSocket connection error'));
      };

      this.ws.onclose = () => {
        clearTimeout(timeout);
        this.stopPing();
        this.setStatus('disconnected');
        this.scheduleReconnect();
      };
    });
  }

  private handleHAWSMessage(
    msg: HAWSResponse,
    resolve: () => void,
    reject: (err: Error) => void,
    timeout: ReturnType<typeof setTimeout>,
  ): void {
    switch (msg.type) {
      case 'auth_required':
        if (!this.haToken) {
          clearTimeout(timeout);
          this.setStatus('error', 'HA authentication required — configure haToken');
          reject(new Error('HA WebSocket API requires haToken'));
          break;
        }
        this.sendHAWS({ type: 'auth', access_token: this.haToken });
        break;

      case 'auth_ok':
        clearTimeout(timeout);
        this.setStatus('connected');
        this.resetRetryDelay();
        this.subscribeHAStateChanges();
        this.startPing();
        resolve();
        break;

      case 'auth_invalid':
        clearTimeout(timeout);
        this.setStatus('error', 'HA authentication failed — check haToken');
        reject(new Error('HA authentication invalid'));
        break;

      case 'event':
        if (msg.event?.event_type === 'state_changed') {
          this.handleHAStateChanged(msg.event);
        }
        break;

      case 'result':
        if (msg.id !== undefined && !msg.success) {
          this.log.warn('HA WS API call failed', {
            adapterId: this.id,
            msgId: msg.id,
            error: msg.error?.message,
          });
        }
        break;

      default:
        // Ignore unknown message types
        break;
    }
  }

  /**
   * Subscribe to HA state_changed events.
   * When haDiscovery is true, all state changes are received and filtered
   * by device_class. When false, only explicitly configured entities are tracked.
   */
  private subscribeHAStateChanges(): void {
    const msgId = this.haWsMsgId++;

    // Subscribe to state_changed events — HA pushes updates automatically
    this.sendHAWS({
      id: msgId,
      type: 'subscribe_events',
      event_filter: { event_type: 'state_changed' },
    } as HAWSMessage & { id: number });

    // If discovery is enabled, also request current states via get_states
    if (this.haDiscovery) {
      this.sendHAWS({ id: this.haWsMsgId++, type: 'get_states' } as HAWSMessage & { id: number });
    }
  }

  private handleHAStateChanged(event: HAStateChangedEvent): void {
    const { entity_id, new_state } = event.data;
    if (!new_state) return; // entity removed

    const { state, attributes } = new_state;
    const deviceClass = attributes.device_class ?? '';
    const unit = attributes.unit_of_measurement ?? '';

    // Determine role: explicit override > friendly name match > device_class auto
    const role = this.resolveEntityRole(entity_id, deviceClass, unit, attributes.friendly_name);
    if (!role) return;

    // Register for future use
    this.discoveredEntityRoles.set(entity_id, role);
    this.updateStateValue(role, state, attributes);
    this.emitData(this.buildModel());
  }

  // ── MQTT Broker Mode ─────────────────────────────────────────────

  /**
   * Connect to a Mosquitto MQTT-over-WebSocket broker.
   * Subscribes to configured entity state topics + MQTT Discovery topics.
   */
  private connectMQTTBroker(): Promise<void> {
    const protocol = this.config.tls ? 'wss' : 'ws';
    const url = `${protocol}://${this.config.host}:${this.config.port}`;

    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(url);
      const timeout = setTimeout(() => {
        reject(new Error('MQTT broker connection timeout (10s)'));
      }, 10_000);

      this.ws.onopen = () => {
        clearTimeout(timeout);

        // Authenticate if credentials provided (broker-level auth)
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

        // Subscribe to static entity state topics
        for (const entityId of this.subscriptions.keys()) {
          const topic = `${this.topicPrefix}/sensor/${entityId.replace('sensor.', '')}/state`;
          this.ws?.send(JSON.stringify({ type: 'subscribe', topic }));
        }

        // Subscribe to MQTT Discovery topics for auto-config detection
        if (this.haDiscovery) {
          this.ws?.send(
            JSON.stringify({ type: 'subscribe', topic: `${this.topicPrefix}/sensor/+/config` }),
          );
        }

        this.startPing();
        resolve();
      };

      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(String(event.data)) as {
            entity_id?: string;
            state?: string;
            topic?: string;
            payload?: string;
          };
          this.handleMQTTMessage(msg);
        } catch {
          // Ignore non-JSON
        }
      };

      this.ws.onerror = () => {
        clearTimeout(timeout);
        this.setStatus('error', 'MQTT broker connection failed');
        reject(new Error('MQTT WebSocket error'));
      };

      this.ws.onclose = () => {
        clearTimeout(timeout);
        this.stopPing();
        this.setStatus('disconnected');
        this.scheduleReconnect();
      };
    });
  }

  private handleMQTTMessage(msg: {
    entity_id?: string;
    state?: string;
    topic?: string;
    payload?: string;
  }): void {
    const entityId = msg.entity_id ?? this.extractEntityFromTopic(msg.topic);
    if (!entityId) return;

    // MQTT Discovery config payload
    if (msg.topic?.endsWith('/config') && msg.payload) {
      try {
        const config = JSON.parse(msg.payload) as HAMQTTDiscoveryConfig;
        this.processMQTTDiscoveryConfig(config);
      } catch {
        // Ignore malformed discovery payloads
      }
      return;
    }

    const role = this.subscriptions.get(entityId) ?? this.discoveredEntityRoles.get(entityId);
    if (!role) return;

    const value = parseFloat(msg.state ?? msg.payload ?? '');
    if (!Number.isNaN(value)) {
      this.updateStateByRoleValue(role, value);
    } else if (role === 'evStatus') {
      this.evStatus = msg.state ?? msg.payload ?? 'available';
    }

    this.emitData(this.buildModel());
  }

  private processMQTTDiscoveryConfig(config: HAMQTTDiscoveryConfig): void {
    if (!config.unique_id || !config.state_topic) return;
    const entityId = config.unique_id;
    const deviceClass = config.device_class ?? '';

    // Auto-subscribe to this entity's state topic
    if (this.haDiscovery && ENERGY_DEVICE_CLASSES.has(deviceClass)) {
      this.ws?.send(JSON.stringify({ type: 'subscribe', topic: config.state_topic }));
      const role = this.resolveEntityRole(entityId, deviceClass, config.unit_of_measurement ?? '');
      if (role) this.discoveredEntityRoles.set(config.state_topic, role);
    }
  }

  // ── Entity Role Resolution ───────────────────────────────────────

  /**
   * Resolve the energy role of an entity using priority order:
   * 1. Explicit entityRoles override
   * 2. Friendly name keyword matching
   * 3. device_class + unit heuristics
   */
  private resolveEntityRole(
    entityId: string,
    deviceClass: string,
    _unit: string,
    friendlyName?: string,
  ): HAEnergyRole | null {
    // 1. Explicit override
    const override = this.entityRoleOverrides.get(entityId);
    if (override) return override;

    // 2. Already discovered
    const existing = this.discoveredEntityRoles.get(entityId);
    if (existing) return existing;

    // 3. Friendly name keyword heuristic
    const nameLower = (friendlyName ?? entityId).toLowerCase().replace(/[_\s-]+/g, '_');
    for (const [keyword, role] of Object.entries(DEVICE_CLASS_ROLE)) {
      if (nameLower.includes(keyword)) return role;
    }

    // 4. device_class + unit heuristics
    if (!ENERGY_DEVICE_CLASSES.has(deviceClass)) return null;

    if (deviceClass === 'battery') return 'batterySoc';
    if (deviceClass === 'temperature') return null; // too ambiguous without name

    // unit-based disambiguation
    if (deviceClass === 'power' || deviceClass === 'energy') {
      return this.classifyPowerEnergyById(entityId.toLowerCase(), deviceClass);
    }

    return null;
  }

  /** Map a lowercased power/energy entity id to a role via keyword table. */
  private classifyPowerEnergyById(id: string, deviceClass: string): HAEnergyRole | null {
    if (id.includes('solar') || id.includes('pv')) {
      return deviceClass === 'energy' ? 'pvEnergyToday' : 'pvPower';
    }
    for (const { keywords, role } of POWER_ENERGY_ID_KEYWORDS) {
      if (keywords.some((keyword) => id.includes(keyword))) return role;
    }
    return null;
  }

  // ── State Update Logic ───────────────────────────────────────────

  private updateStateValue(
    role: HAEnergyRole,
    state: string,
    attributes: {
      unit_of_measurement?: string;
      current_temperature?: number;
      temperature?: number;
    },
  ): void {
    const value = parseFloat(state);

    if (role === 'evStatus') {
      this.evStatus = state;
      return;
    }

    if (Number.isNaN(value)) return;

    // Convert kW → W where applicable
    const unitRaw = attributes.unit_of_measurement ?? '';
    const unit = unitRaw.toLowerCase();
    const adjustedValue = unit === 'kw' ? value * 1000 : unit === 'kwh' ? value : value;

    this.updateStateByRoleValue(role, adjustedValue);
  }

  private updateStateByRoleValue(role: HAEnergyRole, value: number): void {
    switch (role) {
      case 'pvPower':
        this.pvPowerW = value;
        break;
      case 'pvEnergyToday':
        this.pvEnergyTodayKWh = value;
        break;
      case 'batteryPower':
        this.batteryPowerW = value;
        break;
      case 'batterySoc':
        this.batterySocPercent = Math.min(100, Math.max(0, value));
        break;
      case 'gridPower':
        this.gridPowerW = value;
        break;
      case 'housePower':
        this.housePowerW = value;
        break;
      case 'heatPumpPower':
        this.heatPumpPowerW = value;
        break;
      case 'evPower':
        this.evPowerW = value;
        break;
      case 'evSoc':
        this.evSocPercent = Math.min(100, Math.max(0, value));
        break;
      default:
        break;
    }
  }

  // ── Model Building ───────────────────────────────────────────────

  private buildModel(): Partial<UnifiedEnergyModel> {
    return {
      timestamp: Date.now(),
      pv: {
        totalPowerW: this.pvPowerW,
        yieldTodayKWh: this.pvEnergyTodayKWh,
      },
      battery: {
        powerW: this.batteryPowerW,
        socPercent: this.batterySocPercent,
        voltageV: 0,
        currentA: 0,
        ...(this.batteryTempC !== undefined ? { temperatureC: this.batteryTempC } : {}),
      },
      grid: {
        powerW: this.gridPowerW,
        voltageV: 230,
      },
      load: {
        totalPowerW: this.housePowerW,
        heatPumpPowerW: this.heatPumpPowerW,
        evPowerW: this.evPowerW,
        otherPowerW: Math.max(0, this.housePowerW - this.heatPumpPowerW - this.evPowerW),
      },
      evCharger:
        this.evPowerW > 0 || this.evStatus !== 'available'
          ? {
              status: this.mapEvStatus(this.evStatus),
              powerW: this.evPowerW,
              energySessionKWh: 0,
              ...(this.evSocPercent > 0 ? { socPercent: this.evSocPercent } : {}),
              maxCurrentA: 32,
              vehicleConnected: this.evStatus !== 'available',
              v2xCapable: false,
              v2xActive: false,
            }
          : undefined,
    };
  }

  private mapEvStatus(
    status: string,
  ): 'available' | 'preparing' | 'charging' | 'suspended' | 'finishing' | 'faulted' {
    const s = status.toLowerCase().replace(/[_\s]+/g, '_');
    const map: Record<
      string,
      'available' | 'preparing' | 'charging' | 'suspended' | 'finishing' | 'faulted'
    > = {
      available: 'available',
      preparing: 'preparing',
      charging: 'charging',
      suspended: 'suspended',
      suspended_ev: 'suspended',
      suspended_evse: 'suspended',
      finishing: 'finishing',
      faulted: 'faulted',
      error: 'faulted',
      plugged_in: 'preparing',
      not_connected: 'available',
    };
    return map[s] ?? 'available';
  }

  // ── Command Sending ──────────────────────────────────────────────

  protected async _sendCommand(command: AdapterCommand): Promise<boolean> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return false;

    return this.haMode === 'ha-ws-api'
      ? this.sendHAServiceCall(command)
      : this.sendMQTTCommand(command);
  }

  /**
   * Send an HA service call via the WebSocket API.
   * Reference: https://developers.home-assistant.io/docs/api/websocket/#calling-a-service
   */
  private sendHAServiceCall(command: AdapterCommand): boolean {
    const call = this.mapCommandToHAService(command);
    if (!call) return false;

    this.sendHAWS({
      id: this.haWsMsgId++,
      type: 'call_service',
      domain: call.domain,
      service: call.service,
      ...(call.target ? { target: call.target } : {}),
      ...(call.serviceData ? { service_data: call.serviceData } : {}),
    } as HAWSMessage & { id: number });

    return true;
  }

  private sendMQTTCommand(command: AdapterCommand): boolean {
    const serviceCall = this.mapCommandToMQTTPayload(command);
    if (!serviceCall) return false;
    this.ws?.send(JSON.stringify(serviceCall));
    return true;
  }

  /** Map HEMS commands to HA service domain/service/target */
  private mapCommandToHAService(command: AdapterCommand): {
    domain: string;
    service: string;
    target?: { entity_id: string };
    serviceData?: Record<string, unknown>;
  } | null {
    switch (command.type) {
      case 'SET_EV_CURRENT':
        return {
          domain: 'number',
          service: 'set_value',
          target: { entity_id: this.wallboxCurrentEntityId },
          serviceData: { value: command.value },
        };
      case 'SET_EV_POWER':
        // Convert W to A at 230V for wallbox current limit
        return {
          domain: 'number',
          service: 'set_value',
          target: { entity_id: this.wallboxCurrentEntityId },
          serviceData: { value: Math.round((Number(command.value) / 230) * 10) / 10 },
        };
      case 'START_CHARGING':
        return {
          domain: 'switch',
          service: 'turn_on',
          target: { entity_id: this.wallboxSwitchEntityId },
        };
      case 'STOP_CHARGING':
        return {
          domain: 'switch',
          service: 'turn_off',
          target: { entity_id: this.wallboxSwitchEntityId },
        };
      case 'SET_HEAT_PUMP_POWER':
        // In HA, heat pump power is usually controlled via max_temp or a dedicated number
        return {
          domain: 'number',
          service: 'set_value',
          target: { entity_id: this.heatPumpModeEntityId },
          serviceData: { value: command.value },
        };
      case 'SET_HEAT_PUMP_MODE':
        return {
          domain: 'climate',
          service: 'set_hvac_mode',
          target: { entity_id: this.heatPumpModeEntityId },
          serviceData: { hvac_mode: String(command.value) },
        };
      case 'KNX_TOGGLE_LIGHTS':
        return {
          domain: 'light',
          service: command.value ? 'turn_on' : 'turn_off',
          target: { entity_id: `light.${String(command.targetDeviceId ?? 'all')}` },
        };
      case 'KNX_SET_TEMPERATURE':
        return {
          domain: 'climate',
          service: 'set_temperature',
          target: { entity_id: `climate.${String(command.targetDeviceId ?? 'thermostat')}` },
          serviceData: { temperature: command.value },
        };
      default:
        return null;
    }
  }

  /** Map HEMS commands to MQTT service call payloads (mqtt-broker mode) */
  private mapCommandToMQTTPayload(command: AdapterCommand): Record<string, unknown> | null {
    switch (command.type) {
      case 'SET_EV_CURRENT':
        return {
          type: 'call_service',
          domain: 'number',
          service: 'set_value',
          data: { entity_id: this.wallboxCurrentEntityId, value: command.value },
        };
      case 'START_CHARGING':
        return {
          type: 'call_service',
          domain: 'switch',
          service: 'turn_on',
          data: { entity_id: this.wallboxSwitchEntityId },
        };
      case 'STOP_CHARGING':
        return {
          type: 'call_service',
          domain: 'switch',
          service: 'turn_off',
          data: { entity_id: this.wallboxSwitchEntityId },
        };
      case 'SET_HEAT_PUMP_MODE':
        return {
          type: 'call_service',
          domain: 'climate',
          service: 'set_hvac_mode',
          data: { entity_id: this.heatPumpModeEntityId, hvac_mode: command.value },
        };
      case 'KNX_TOGGLE_LIGHTS':
        return {
          type: 'call_service',
          domain: 'light',
          service: command.value ? 'turn_on' : 'turn_off',
          data: { entity_id: `light.${String(command.targetDeviceId ?? 'all')}` },
        };
      case 'KNX_SET_TEMPERATURE':
        return {
          type: 'call_service',
          domain: 'climate',
          service: 'set_temperature',
          data: {
            entity_id: `climate.${String(command.targetDeviceId ?? 'thermostat')}`,
            temperature: command.value,
          },
        };
      default:
        return null;
    }
  }

  // ── HA WebSocket API helpers ─────────────────────────────────────

  private sendHAWS(msg: HAWSMessage & { id?: number }): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  // ── Utility ─────────────────────────────────────────────────────

  private extractEntityFromTopic(topic?: string): string | null {
    if (!topic) return null;
    // `homeassistant/sensor/<name>/state` → `sensor.<name>`
    const parts = topic.split('/');
    if (parts.length >= 3 && parts[0] === this.topicPrefix && parts[2] !== 'config') {
      return `${parts[1]}.${parts[2]}`;
    }
    return null;
  }

  private startPing(): void {
    this.stopPing();
    this.pingInterval = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        if (this.haMode === 'ha-ws-api') {
          this.sendHAWS({ id: this.haWsMsgId++, type: 'ping' });
        } else {
          this.ws.send(JSON.stringify({ type: 'ping' }));
        }
      }
    }, 30_000);
    if (typeof this.pingInterval === 'object' && 'unref' in this.pingInterval) {
      (this.pingInterval as NodeJS.Timeout).unref();
    }
  }

  private stopPing(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  /** Number of auto-discovered energy entities (useful for UI status display) */
  get discoveredEntityCount(): number {
    return this.discoveredEntityRoles.size;
  }

  /** Current connection mode */
  get connectionMode(): HAConnectionMode {
    return this.haMode;
  }
}

// ─── Registration ────────────────────────────────────────────────────

export function register(): void {
  registerAdapter(
    'homeassistant-mqtt',
    (config) => new HomeAssistantMQTTAdapter(config as HomeAssistantMQTTConfig | undefined),
    {
      displayName: 'Home Assistant MQTT',
      description:
        'Home Assistant via HA WebSocket API or MQTT Discovery. Supports sensors, switches, climate, EV, and heat pump entities.',
      source: 'contrib',
    },
  );
}

export const id = 'homeassistant-mqtt';
export const factory = (config?: Partial<AdapterConnectionConfig>) =>
  new HomeAssistantMQTTAdapter(config as HomeAssistantMQTTConfig | undefined);
