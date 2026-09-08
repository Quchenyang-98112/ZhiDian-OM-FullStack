/**
 * OpenEMS Edge Integration Adapter
 *
 * Integrates with OpenEMS (https://openems.io) Edge controller via JSON-RPC
 * over WebSocket. OpenEMS provides deep energy algorithms including:
 * - ESS symmetric/asymmetric power control
 * - Peak shaving / Valley filling
 * - Grid-optimized charging
 * - LSTM-based predictor
 * - Dedicated Controller architecture (OSGi-level granularity)
 *
 * Communication: JSON-RPC 2.0 over WebSocket
 * Reference: https://openems.github.io/openems.io/openems/latest/edge/communication.html
 */

import { BaseAdapter } from './BaseAdapter';
import type {
  AdapterCapability,
  AdapterCommand,
  AdapterConnectionConfig,
  UnifiedEnergyModel,
} from './EnergyAdapter';

// ─── OpenEMS JSON-RPC Types ─────────────────────────────────────────

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: string;
  method: string;
  params: Record<string, unknown>;
}

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: string;
  result?: Record<string, unknown>;
  error?: { code: number; message: string; data?: unknown };
}

/** OpenEMS Channel Address format: Component/Channel */
interface ChannelValue {
  address: string;
  value: number | string | boolean | null;
}

/** OpenEMS Edge Configuration Component */
interface OpenEMSComponent {
  factoryId: string;
  id: string;
  alias: string;
  properties: Record<string, unknown>;
  channels: Record<string, unknown>;
}

interface OpenEMSWritableComponentRule {
  idPattern: RegExp;
  factoryPrefix?: string;
  factoryId?: string;
  allowedProperties: readonly string[];
}

const COMPONENT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const PROPERTY_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
/** Validates OpenEMS channel addresses (format: componentId/PropertyName) */
const SAFE_CHANNEL_ADDRESS = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}\/[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

const OPENEMS_WRITABLE_COMPONENT_RULES: readonly OpenEMSWritableComponentRule[] = [
  {
    idPattern: /^ctrlEssFixActivePower\d+$/,
    factoryPrefix: 'Controller.Ess.FixActivePower',
    allowedProperties: ['power', 'mode'],
  },
  {
    idPattern: /^ctrlPeakShaving\d+$/,
    factoryPrefix: 'Controller.Symmetric.PeakShaving',
    allowedProperties: ['peakShavingPower'],
  },
  {
    idPattern: /^evcs\d+$/,
    factoryPrefix: 'Evcs.',
    allowedProperties: ['setChargePowerLimit'],
  },
  {
    idPattern: /^ctrlEvcs\d+$/,
    factoryPrefix: 'Controller.Evcs',
    allowedProperties: ['enabledCharging'],
  },
  {
    idPattern: /^ctrl[A-Za-z0-9._-]+$/,
    factoryId: 'Controller.Io.HeatPump.SgReady',
    allowedProperties: ['mode'],
  },
];

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isSafeComponentId(id: string): boolean {
  return COMPONENT_ID_PATTERN.test(id);
}

function isSafePropertyName(name: string): boolean {
  return PROPERTY_NAME_PATTERN.test(name);
}

function sanitizePropertyValue(value: unknown): number | string | boolean | null {
  if (value === null) return null;
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    return value.length > 256 ? value.slice(0, 256) : value;
  }
  return null;
}

// ─── Channel Address Constants (OpenEMS convention) ──────────────────

const CH = {
  // ESS (Energy Storage System)
  ESS_SOC: '_sum/EssSoc',
  ESS_ACTIVE_POWER: '_sum/EssActivePower',
  ESS_CAPACITY: '_sum/EssCapacity',
  ESS_CHARGE_POWER: '_sum/EssActivePowerL1', // simplified
  ESS_MAX_CHARGE: '_sum/EssMaxApparentPower',
  ESS_GRID_MODE: '_sum/GridMode',

  // Grid
  GRID_ACTIVE_POWER: '_sum/GridActivePower',
  GRID_ACTIVE_POWER_L1: '_sum/GridActivePowerL1',
  GRID_ACTIVE_POWER_L2: '_sum/GridActivePowerL2',
  GRID_ACTIVE_POWER_L3: '_sum/GridActivePowerL3',
  GRID_BUY_ENERGY: '_sum/GridBuyActiveEnergy',
  GRID_SELL_ENERGY: '_sum/GridSellActiveEnergy',
  GRID_MIN_POWER: '_sum/GridMinActivePower',
  GRID_MAX_POWER: '_sum/GridMaxActivePower',

  // Production (PV)
  PRODUCTION_POWER: '_sum/ProductionActivePower',
  PRODUCTION_ENERGY: '_sum/ProductionActiveEnergy',
  PRODUCTION_DC_POWER: '_sum/ProductionDcActualPower',
  PRODUCTION_AC_POWER: '_sum/ProductionAcActivePower',
  PRODUCTION_MAX_POWER: '_sum/ProductionMaxActivePower',

  // Consumption
  CONSUMPTION_POWER: '_sum/ConsumptionActivePower',
  CONSUMPTION_ENERGY: '_sum/ConsumptionActiveEnergy',
  CONSUMPTION_POWER_L1: '_sum/ConsumptionActivePowerL1',
  CONSUMPTION_POWER_L2: '_sum/ConsumptionActivePowerL2',
  CONSUMPTION_POWER_L3: '_sum/ConsumptionActivePowerL3',
  CONSUMPTION_MAX_POWER: '_sum/ConsumptionMaxActivePower',

  // EVCS (Electric Vehicle Charging Station)
  EVCS_CHARGE_POWER: 'evcs0/ChargePower',
  EVCS_STATUS: 'evcs0/Status',
  EVCS_SESSION_ENERGY: 'evcs0/EnergySession',
  EVCS_PHASES: 'evcs0/Phases',
  EVCS_MAX_POWER: 'evcs0/MaximumPower',
  EVCS_SET_POWER: 'evcs0/SetChargePowerLimit',
} as const;

// ─── Adapter Implementation ──────────────────────────────────────────

/** OpenEMS controller configuration snapshot */
export interface OpenEMSControllerConfig {
  id: string;
  factoryId: string;
  alias: string;
  enabled: boolean;
  properties: Record<string, unknown>;
}

/** OpenEMS historical timeseries data point */
export interface OpenEMSTimeseriesPoint {
  timestamp: number;
  channels: Record<string, number | null>;
}

export class OpenEMSAdapter extends BaseAdapter {
  readonly id = 'openems';
  readonly name = 'OpenEMS Edge';
  readonly capabilities: AdapterCapability[] = ['pv', 'battery', 'grid', 'load', 'evCharger'];

  private ws: WebSocket | null = null;
  private rpcId = 0;
  private pending = new Map<
    string,
    { resolve: (v: JsonRpcResponse) => void; reject: (e: Error) => void }
  >();
  private subscriptionTimer: ReturnType<typeof setInterval> | null = null;
  private channelValues: Record<string, number | string | boolean | null> = Object.create(
    null,
  ) as Record<string, number | string | boolean | null>;
  private sessionToken: string | null = null;
  private edgeComponents: Map<string, OpenEMSComponent> = new Map();
  private controllerConfigs: OpenEMSControllerConfig[] = [];

  constructor(config?: Partial<AdapterConnectionConfig>) {
    super({
      name: 'OpenEMS Edge',
      host: config?.host ?? 'localhost',
      port: config?.port ?? 8085,
      tls: config?.tls ?? false,
      ...config,
    });
  }

  protected async _connect(): Promise<void> {
    const host = this.config?.host ?? 'localhost';
    const port = this.config?.port ?? 8085;
    const protocol = this.config?.tls ? 'wss' : 'ws';

    return new Promise<void>((resolve, reject) => {
      this.ws = new WebSocket(`${protocol}://${host}:${port}/websocket`);

      const timeout = setTimeout(() => {
        reject(new Error('OpenEMS connection timeout'));
      }, 15000);

      this.ws.onopen = async () => {
        clearTimeout(timeout);
        try {
          await this.authenticate();
          await this.discoverComponents();
          await this.subscribeChannels();
          this.startPolling();
          this.setStatus('connected');
          resolve();
        } catch (e) {
          reject(e);
        }
      };

      this.ws.onmessage = (event) => this.handleMessage(String(event.data));

      this.ws.onerror = () => {
        clearTimeout(timeout);
        reject(new Error('OpenEMS WebSocket error'));
      };

      this.ws.onclose = () => {
        this.ws = null;
      };
    });
  }

  protected async _disconnect(): Promise<void> {
    if (this.subscriptionTimer) {
      clearInterval(this.subscriptionTimer);
      this.subscriptionTimer = null;
    }
    for (const [, p] of this.pending) {
      p.reject(new Error('Disconnected'));
    }
    this.pending.clear();
    if (this.ws) {
      this.ws.close(1000, 'disconnect');
      this.ws = null;
    }
  }

  protected async _sendCommand(command: AdapterCommand): Promise<boolean> {
    switch (command.type) {
      case 'SET_BATTERY_POWER': {
        return this.updateSafeComponentConfig('ctrlEssFixActivePower0', [
          { name: 'power', value: Number(command.value) },
          {
            name: 'mode',
            value: Number(command.value) >= 0 ? 'CHARGE_GRID' : 'DISCHARGE_TO_GRID',
          },
        ]);
      }
      case 'SET_BATTERY_MODE': {
        const mode = String(command.value);
        const mappedMode =
          mode === 'charge'
            ? 'CHARGE_GRID'
            : mode === 'discharge'
              ? 'DISCHARGE_TO_GRID'
              : command.value;

        return this.updateSafeComponentConfig('ctrlEssFixActivePower0', [
          { name: 'mode', value: mappedMode },
        ]);
      }
      case 'SET_EV_POWER': {
        return this.updateSafeComponentConfig(this.findEvcsId(), [
          { name: 'setChargePowerLimit', value: Number(command.value) },
        ]);
      }
      case 'SET_EV_CURRENT': {
        const power = Number(command.value) * 230 * 3;
        return this.updateSafeComponentConfig(this.findEvcsId(), [
          { name: 'setChargePowerLimit', value: power },
        ]);
      }
      case 'START_CHARGING': {
        return this.updateSafeComponentConfig(this.findEvcsControllerId(), [
          { name: 'enabledCharging', value: true },
        ]);
      }
      case 'STOP_CHARGING': {
        return this.updateSafeComponentConfig(this.findEvcsControllerId(), [
          { name: 'enabledCharging', value: false },
        ]);
      }
      case 'SET_GRID_LIMIT': {
        return this.updateSafeComponentConfig('ctrlPeakShaving0', [
          { name: 'peakShavingPower', value: Number(command.value) * 1000 },
        ]);
      }
      case 'SET_HEAT_PUMP_MODE': {
        const sgReadyValue = Number(command.value);
        // OpenEMS SG Ready heat pump controller
        const hpCtrl = this.findComponentByFactory('Controller.Io.HeatPump.SgReady');
        if (!hpCtrl) return false;
        return this.updateSafeComponentConfig(hpCtrl.id, [{ name: 'mode', value: sgReadyValue }]);
      }
      default:
        return false;
    }
  }

  protected _cleanup(): void {
    this.channelValues = Object.create(null) as Record<string, number | string | boolean | null>;
    this.sessionToken = null;
    this.edgeComponents.clear();
    this.controllerConfigs = [];
  }

  getSnapshot(): Partial<UnifiedEnergyModel> {
    return this.snapshot;
  }

  /** Get discovered OpenEMS components */
  getComponents(): OpenEMSComponent[] {
    return Array.from(this.edgeComponents.values());
  }

  /** Get currently registered controllers */
  getControllerConfigs(): OpenEMSControllerConfig[] {
    return this.controllerConfigs;
  }

  /** Query historical timeseries data from OpenEMS */
  async queryHistoricTimeseries(
    fromDate: string,
    toDate: string,
    channels: string[],
    resolution?: number,
  ): Promise<OpenEMSTimeseriesPoint[]> {
    try {
      const response = await this.rpcCall('queryHistoricTimeseriesData', {
        fromDate,
        toDate,
        channels: channels.map((c) => ({ address: c })),
        resolution: resolution ?? 900,
      });
      const data = response.result?.data as Record<string, (number | null)[]> | undefined;
      const timestamps = response.result?.timestamps as number[] | undefined;
      if (!data || !timestamps) return [];
      return timestamps.map((ts, i) => {
        const point: OpenEMSTimeseriesPoint = { timestamp: ts, channels: {} };
        for (const [addr, values] of Object.entries(data)) {
          point.channels[addr] = values[i] ?? null;
        }
        return point;
      });
    } catch {
      return [];
    }
  }

  /** Query cumulated energy values for a time range */
  async queryHistoricEnergy(
    fromDate: string,
    toDate: string,
    channels: string[],
  ): Promise<Record<string, number>> {
    try {
      const response = await this.rpcCall('queryHistoricTimeseriesEnergy', {
        fromDate,
        toDate,
        channels: channels.map((c) => ({ address: c })),
      });
      return (response.result?.data as Record<string, number>) ?? {};
    } catch {
      return {};
    }
  }

  /** Update a controller configuration on OpenEMS Edge */
  async updateControllerConfig(
    componentId: string,
    properties: Array<{ name: string; value: unknown }>,
  ): Promise<boolean> {
    return this.updateSafeComponentConfig(componentId, properties);
  }

  // ─── Private Helpers ─────────────────────────────────────────────

  private async authenticate(): Promise<void> {
    const password = this.config?.authToken ?? 'user';
    const response = await this.rpcCall('authenticateWithPassword', { password });
    if (response.result?.token) {
      this.sessionToken = response.result.token as string;
    }
  }

  /** Discover all Edge components via getEdgeConfig RPC */
  private async discoverComponents(): Promise<void> {
    try {
      const response = await this.rpcCall('getEdgeConfig', {});
      const components = response.result?.components;
      if (!isPlainObject(components)) return;
      this.edgeComponents.clear();
      this.controllerConfigs = [];
      for (const [id, comp] of Object.entries(components)) {
        if (!isSafeComponentId(id) || !isPlainObject(comp)) continue;

        const factoryId = typeof comp.factoryId === 'string' ? comp.factoryId : '';
        const alias = typeof comp.alias === 'string' ? comp.alias : id;
        const properties = isPlainObject(comp.properties) ? comp.properties : {};
        const channels = isPlainObject(comp.channels) ? comp.channels : {};

        const normalized: OpenEMSComponent = {
          id,
          factoryId,
          alias,
          properties,
          channels,
        };

        this.edgeComponents.set(id, normalized);
        // Collect controller configs
        if (id.startsWith('ctrl') || factoryId.startsWith('Controller.')) {
          this.controllerConfigs.push({
            id,
            factoryId,
            alias,
            enabled: properties.enabled !== false,
            properties,
          });
        }
      }
    } catch {
      // Non-fatal: continue without component discovery
    }
  }

  /** Find a component by factory ID */
  private findComponentByFactory(factoryId: string): OpenEMSComponent | undefined {
    for (const comp of this.edgeComponents.values()) {
      if (comp.factoryId === factoryId) return comp;
    }
    return undefined;
  }

  /** Find the first EVCS component ID (auto-discovery) */
  private findEvcsId(): string {
    for (const [id, comp] of this.edgeComponents) {
      if (comp.factoryId?.startsWith('Evcs.') || id.startsWith('evcs')) return id;
    }
    return 'evcs0';
  }

  /** Find the first EVCS controller ID (auto-discovery) */
  private findEvcsControllerId(): string {
    for (const [id, comp] of this.edgeComponents) {
      if (comp.factoryId?.startsWith('Controller.Evcs') || id.startsWith('ctrlEvcs')) return id;
    }
    return 'ctrlEvcs0';
  }

  private getWritablePropertyAllowlist(componentId: string): Set<string> | null {
    const component = this.edgeComponents.get(componentId);
    const extra =
      this.config?.additionalWritableProperties?.[componentId]?.filter(isSafePropertyName) ?? [];

    for (const rule of OPENEMS_WRITABLE_COMPONENT_RULES) {
      if (!rule.idPattern.test(componentId)) continue;
      if (rule.factoryId && (!component || component.factoryId !== rule.factoryId)) continue;
      if (rule.factoryPrefix && !component?.factoryId.startsWith(rule.factoryPrefix)) continue;
      return new Set([...rule.allowedProperties, ...extra]);
    }

    if (extra.length > 0) {
      return new Set(extra);
    }

    return null;
  }

  private sanitizeWritableProperties(
    componentId: string,
    properties: Array<{ name: string; value: unknown }>,
  ): Array<{ name: string; value: number | string | boolean | null }> {
    const allowlist = this.getWritablePropertyAllowlist(componentId);
    if (!allowlist) return [];

    return properties
      .filter((property) => allowlist.has(property.name) && isSafePropertyName(property.name))
      .map((property) => ({
        name: property.name,
        value: sanitizePropertyValue(property.value),
      }));
  }

  private async updateSafeComponentConfig(
    componentId: string,
    properties: Array<{ name: string; value: unknown }>,
  ): Promise<boolean> {
    if (!isSafeComponentId(componentId)) {
      return false;
    }

    const safeProperties = this.sanitizeWritableProperties(componentId, properties);
    if (safeProperties.length === 0) {
      return false;
    }

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

  private async subscribeChannels(): Promise<void> {
    // Build dynamic channel list from discovered components
    const channels = new Set(Object.values(CH) as string[]);

    // Add per-component channels from discovery
    for (const [id, comp] of this.edgeComponents) {
      if (comp.factoryId?.startsWith('Evcs.')) {
        channels.add(`${id}/ChargePower`);
        channels.add(`${id}/Status`);
        channels.add(`${id}/EnergySession`);
        channels.add(`${id}/Phases`);
        channels.add(`${id}/MaximumPower`);
      }
      if (comp.factoryId?.startsWith('Ess.')) {
        channels.add(`${id}/Soc`);
        channels.add(`${id}/ActivePower`);
        channels.add(`${id}/Capacity`);
        channels.add(`${id}/MaxApparentPower`);
      }
    }

    await this.rpcCall('subscribeChannels', {
      count: 0,
      channels: Array.from(channels).map((ch) => ({ address: ch })),
    });
  }

  private startPolling(): void {
    const interval = this.config?.pollIntervalMs ?? 5000;
    this.subscriptionTimer = setInterval(async () => {
      try {
        const channels = Object.values(CH);
        await this.rpcCall('subscribeChannels', {
          count: 0,
          channels: channels.map((ch) => ({ address: ch })),
        });
      } catch {
        // Will retry
      }
    }, interval);
  }

  private handleMessage(raw: string): void {
    try {
      const msg = JSON.parse(raw) as JsonRpcResponse & {
        method?: string;
        params?: { channels?: ChannelValue[] };
      };

      // Handle RPC response
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

      // Handle channel subscription updates (notification)
      if (msg.method === 'currentData' && msg.params?.channels) {
        for (const ch of msg.params.channels) {
          // Validate channel address to prevent remote property injection
          if (typeof ch.address === 'string' && SAFE_CHANNEL_ADDRESS.test(ch.address)) {
            this.channelValues[ch.address] = sanitizePropertyValue(ch.value);
          }
        }
        this.updateSnapshot();
      }
    } catch {
      // Ignore malformed messages
    }
  }

  private updateSnapshot(): void {
    const ch = this.channelValues;
    const num = (addr: string) => {
      const v = ch[addr];
      return typeof v === 'number' ? v : 0;
    };

    // Auto-detect EVCS power from discovered component
    const evcsId = this.findEvcsId();
    const evcsPower = num(`${evcsId}/ChargePower`) || num(CH.EVCS_CHARGE_POWER);
    const evcsEnergy = num(`${evcsId}/EnergySession`) || num(CH.EVCS_SESSION_ENERGY);
    const evcsMaxPower = num(`${evcsId}/MaximumPower`) || num(CH.EVCS_MAX_POWER);

    this.snapshot = {
      timestamp: Date.now(),
      pv: {
        totalPowerW: num(CH.PRODUCTION_POWER),
        yieldTodayKWh: num(CH.PRODUCTION_ENERGY) / 1000,
      },
      battery: {
        powerW: num(CH.ESS_ACTIVE_POWER),
        socPercent: num(CH.ESS_SOC),
        voltageV: 0,
        currentA: 0,
        capacityWh: num(CH.ESS_CAPACITY),
      },
      grid: {
        powerW: num(CH.GRID_ACTIVE_POWER),
        voltageV: 230,
        frequencyHz: 50,
        energyImportKWh: num(CH.GRID_BUY_ENERGY) / 1000,
        energyExportKWh: num(CH.GRID_SELL_ENERGY) / 1000,
        phases: [
          {
            voltageV: 230,
            currentA: num(CH.GRID_ACTIVE_POWER_L1) / 230,
            powerW: num(CH.GRID_ACTIVE_POWER_L1),
          },
          {
            voltageV: 230,
            currentA: num(CH.GRID_ACTIVE_POWER_L2) / 230,
            powerW: num(CH.GRID_ACTIVE_POWER_L2),
          },
          {
            voltageV: 230,
            currentA: num(CH.GRID_ACTIVE_POWER_L3) / 230,
            powerW: num(CH.GRID_ACTIVE_POWER_L3),
          },
        ],
      },
      load: {
        totalPowerW: num(CH.CONSUMPTION_POWER),
        heatPumpPowerW: 0,
        evPowerW: evcsPower,
        otherPowerW: num(CH.CONSUMPTION_POWER) - evcsPower,
      },
      evCharger: {
        status: evcsPower > 0 ? 'charging' : 'available',
        powerW: evcsPower,
        energySessionKWh: evcsEnergy / 1000,
        maxCurrentA: evcsMaxPower > 0 ? evcsMaxPower / 230 / 3 : 0,
        vehicleConnected: evcsPower > 0,
        v2xCapable: false,
        v2xActive: false,
      },
    };

    this.emitData(this.snapshot);
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
      }, 10000);

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
}
