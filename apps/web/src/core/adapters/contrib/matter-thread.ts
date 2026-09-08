/**
 * Matter/Thread Adapter — Smart Home devices via Matter protocol
 *
 * Connects to a Matter controller (e.g. chip-tool, HA Matter Server)
 * through its WebSocket commissioning/control API.
 *
 * Matter device clusters mapped to HEMS:
 *   - ElectricalMeasurement (0x0B04) → power readings
 *   - SimpleMetering (0x0702) → energy counters
 *   - DoorLock (0x0101) / OnOff (0x0006) → load control
 *   - Thermostat (0x0201) → heat pump setpoint
 *   - EnergyPreference — Thread border router energy data
 *
 * Supports Thread 1.3+ mesh networking for low-power sensor data.
 *
 * Prerequisites:
 *   - Matter controller running (python-chip-controller, HA Matter Server)
 *   - WebSocket API endpoint reachable
 *   - Devices commissioned and accessible
 */

import { registerAdapter } from '../adapter-registry';
import { BaseAdapter } from '../BaseAdapter';
import type {
  AdapterCapability,
  AdapterCommand,
  AdapterConnectionConfig,
  UnifiedEnergyModel,
} from '../EnergyAdapter';

// ─── Matter Cluster IDs ─────────────────────────────────────────────

const CLUSTER = {
  ON_OFF: 0x0006,
  THERMOSTAT: 0x0201,
  ELECTRICAL_MEASUREMENT: 0x0b04,
  SIMPLE_METERING: 0x0702,
  POWER_SOURCE: 0x002f,
  // Matter 1.3 Energy Management clusters (DEM, EPM, EEM)
  /** Electrical Power Measurement — real-time active/reactive/apparent power */
  EPM: 0x0090,
  /** Electrical Energy Measurement — cumulative import/export counters */
  EEM: 0x0091,
  /** Device Energy Management — load control, power adjustment, V2G dispatch */
  DEM: 0x0098,
} as const;

// ─── DEM cluster attribute structures (Matter 1.3 §4.2) ─────────────

/** DEM ESA State: Device operating state within the Energy Management system */
type DEMESAState = 'offline' | 'online' | 'running' | 'paused' | 'error';

/** DEM Opt-out State: Whether a device is opted out of grid control */
type DEMOptOutState = 'none' | 'local' | 'grid' | 'both';

/** Per-device DEM cluster state */
interface DEMDeviceState {
  nodeId: number;
  /** DEM feature bitmap (PA=0x01, PFR=0x02, STA=0x04, PAU=0x08, FA=0x10, CON=0x20) */
  featureMap: number;
  esaState: DEMESAState;
  optOutState: DEMOptOutState;
  /** Whether this device can generate energy (V2G, inverter) */
  canGenerate: boolean;
  /** Current power adjustment active (W) */
  currentPowerAdjustmentW: number | null;
  /** EPM: real-time active power (W) */
  activePowerW: number;
  /** EPM: reactive power (VAR) */
  reactivePowerVAR: number;
  /** EEM: cumulative import energy (Wh) */
  cumulativeImportWh: number;
  /** EEM: cumulative export energy (Wh) */
  cumulativeExportWh: number;
  /** Last updated timestamp */
  updatedAt: number;
}

// ─── Config ─────────────────────────────────────────────────────────

export interface MatterThreadConfig extends Partial<AdapterConnectionConfig> {
  /** Controller type (default: 'ha-matter-server') */
  controllerType?: 'ha-matter-server' | 'chip-tool' | 'custom';
  /** Known node IDs to subscribe to */
  nodeIds?: number[];
  /** Polling interval for attribute reads (ms) */
  pollIntervalMs?: number;
}

// ─── Matter message types ───────────────────────────────────────────

interface MatterNodeState {
  nodeId: number;
  endpoints: MatterEndpoint[];
}

interface MatterEndpoint {
  endpointId: number;
  clusters: Record<number, Record<string, unknown>>;
}

interface MatterWSMessage {
  type: string;
  messageId?: string;
  result?: MatterNodeState[];
  event?: string;
  data?: {
    nodeId?: number;
    endpoint?: number;
    cluster?: number;
    attribute?: string;
    value?: number;
  };
}

// ─── Adapter ────────────────────────────────────────────────────────

export class MatterThreadAdapter extends BaseAdapter {
  readonly id = 'matter-thread';
  readonly name = 'Matter/Thread';
  readonly capabilities: AdapterCapability[] = ['pv', 'grid', 'load', 'evCharger'];

  private ws: WebSocket | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private pollIntervalMs: number;
  private nodeIds: number[];
  private msgCounter = 0;

  // Aggregated power readings from Matter devices
  private totalLoadW = 0;
  private gridPowerW = 0;
  private pvPowerW = 0;
  private deviceReadings: Map<number, { powerW: number; energyKWh: number }> = new Map();
  /** DEM cluster states per node (Matter 1.3 DEM 0x98) */
  private demStates: Map<number, DEMDeviceState> = new Map();

  constructor(config?: MatterThreadConfig) {
    super({
      name: 'Matter/Thread',
      host: config?.host ?? 'localhost',
      port: config?.port ?? 5580, // HA Matter Server default WS port
      tls: config?.tls ?? false,
      ...config,
    });

    this.pollIntervalMs = config?.pollIntervalMs ?? 10_000;
    this.nodeIds = config?.nodeIds ?? [];
  }

  protected async _connect(): Promise<void> {
    const protocol = this.config.tls ? 'wss' : 'ws';
    const url = `${protocol}://${this.config.host}:${this.config.port}/ws`;

    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(url);

      const timeout = setTimeout(() => {
        reject(new Error('Matter controller connection timeout'));
      }, 15_000);

      this.ws.onopen = () => {
        clearTimeout(timeout);
        this.setStatus('connected');

        // Request initial node list
        this.sendWS({ type: 'get_nodes' });

        // Start polling for attribute updates
        this.pollTimer = setInterval(() => {
          this.pollAttributes();
        }, this.pollIntervalMs);

        resolve();
      };

      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(String(event.data)) as MatterWSMessage;
          this.handleMessage(msg);
        } catch {
          // Ignore malformed messages
        }
      };

      this.ws.onerror = () => {
        clearTimeout(timeout);
        this.setStatus('error', 'Matter controller connection failed');
        reject(new Error('WebSocket error'));
      };

      this.ws.onclose = () => {
        this.setStatus('disconnected');
        this.scheduleReconnect();
      };
    });
  }

  protected async _disconnect(): Promise<void> {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.close();
      this.ws = null;
    }
  }

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: large command dispatch switch — all cases are necessary
  protected async _sendCommand(command: AdapterCommand): Promise<boolean> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return false;

    switch (command.type) {
      case 'KNX_TOGGLE_LIGHTS': {
        // Map to Matter OnOff cluster
        const nodeId = command.targetDeviceId ? parseInt(command.targetDeviceId, 10) : undefined;
        if (!nodeId) return false;
        this.sendWS({
          type: 'write_attribute',
          data: {
            nodeId,
            endpoint: 1,
            cluster: CLUSTER.ON_OFF,
            attribute: 'onOff',
            value: command.value ? 1 : 0,
          },
        });
        return true;
      }
      case 'SET_HEAT_PUMP_MODE': {
        const nodeId = command.targetDeviceId ? parseInt(command.targetDeviceId, 10) : undefined;
        if (!nodeId) return false;
        this.sendWS({
          type: 'write_attribute',
          data: {
            nodeId,
            endpoint: 1,
            cluster: CLUSTER.THERMOSTAT,
            attribute: 'systemMode',
            value: command.value,
          },
        });
        return true;
      }
      case 'VPP_OFFER_FLEX': {
        // DEM PA: Write power adjustment to the target device
        const nodeId = command.targetDeviceId ? parseInt(command.targetDeviceId, 10) : undefined;
        if (!nodeId) return false;
        const powerW = Number(command.value);
        this.sendWS({
          type: 'invoke_command',
          data: {
            nodeId,
            endpoint: 1,
            cluster: CLUSTER.DEM,
            command: 'PowerAdjustRequest',
            fields: {
              power: Math.round(powerW * 1000), // Matter: milliwatts
              duration: command.payload?.durationS ?? 900, // seconds
              cause: 'LocalOptimization',
            },
          },
        });
        const demState = this.demStates.get(nodeId);
        if (demState) demState.currentPowerAdjustmentW = powerW;
        return true;
      }
      case 'SET_V2G_BPT_PARAMS': {
        // DEM CON: Write BPT constraints to the DEM controller (e.g. EVSEs)
        const nodeId = command.targetDeviceId ? parseInt(command.targetDeviceId, 10) : undefined;
        if (!nodeId) return false;
        const params = command.payload;
        if (!params) return false;
        this.sendWS({
          type: 'write_attribute',
          data: {
            nodeId,
            endpoint: 1,
            cluster: CLUSTER.DEM,
            attribute: 'forecast',
            value: [
              {
                slotIsPausable: false,
                minDuration: 0,
                maxDuration: 3600,
                defaultDuration: 900,
                elapsedSlotTime: 0,
                slotTime: 900,
                manufactOpt: false,
                nominalPower: Math.round(((params.evMaximumChargePowerW as number) ?? 7400) * 1000),
                minPower: Math.round(((params.evMinimumChargePowerW as number) ?? 0) * 1000),
                maxPower: Math.round(((params.evMaximumChargePowerW as number) ?? 7400) * 1000),
                nominalEnergy: 0,
              },
            ],
          },
        });
        return true;
      }
      default:
        return false;
    }
  }

  private sendWS(payload: Record<string, unknown>): void {
    if (this.ws?.readyState !== WebSocket.OPEN) return;
    this.msgCounter += 1;
    this.ws.send(JSON.stringify({ ...payload, messageId: String(this.msgCounter) }));
  }

  private pollAttributes(): void {
    // Request power readings from all known nodes — both legacy and DEM clusters
    for (const nodeId of this.nodeIds) {
      this.sendWS({
        type: 'read_attribute',
        data: {
          nodeId,
          endpoint: 1,
          cluster: CLUSTER.ELECTRICAL_MEASUREMENT,
          attribute: 'activePower',
        },
      });
      // Poll DEM cluster state (Matter 1.3)
      this.sendWS({
        type: 'read_attribute',
        data: {
          nodeId,
          endpoint: 1,
          cluster: CLUSTER.DEM,
          attribute: 'esaState',
        },
      });
      // Poll EPM: real-time active power
      this.sendWS({
        type: 'read_attribute',
        data: {
          nodeId,
          endpoint: 1,
          cluster: CLUSTER.EPM,
          attribute: 'activePower',
        },
      });
    }
  }

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: multi-cluster attribute dispatch — branches required for EPM/EEM/DEM/legacy
  private handleMessage(msg: MatterWSMessage): void {
    // Handle node list response
    if (msg.type === 'result' && msg.result) {
      for (const node of msg.result) {
        if (!this.nodeIds.includes(node.nodeId)) {
          this.nodeIds.push(node.nodeId);
        }
        this.parseNodeState(node);
      }
      this.emitModel();
      return;
    }

    // Handle attribute update events
    if (msg.event === 'attribute_updated' && msg.data) {
      const { nodeId, cluster, attribute, value } = msg.data;
      if (nodeId != null && value != null) {
        if (cluster === CLUSTER.ELECTRICAL_MEASUREMENT && attribute === 'activePower') {
          const existing = this.deviceReadings.get(nodeId) ?? { powerW: 0, energyKWh: 0 };
          existing.powerW = value;
          this.deviceReadings.set(nodeId, existing);
          this.emitModel();
        } else if (cluster === CLUSTER.DEM) {
          this.parseDEMAttribute(nodeId, attribute ?? '', value);
        } else if (cluster === CLUSTER.EPM) {
          this.parseEPMAttribute(nodeId, attribute ?? '', value);
        } else if (cluster === CLUSTER.EEM) {
          this.parseEEMAttribute(nodeId, attribute ?? '', value);
        }
      }
    }
  }

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: per-cluster state parsing — all cluster branches necessary
  private parseNodeState(node: MatterNodeState): void {
    for (const ep of node.endpoints) {
      const elec = ep.clusters[CLUSTER.ELECTRICAL_MEASUREMENT];
      if (elec && typeof elec.activePower === 'number') {
        const existing = this.deviceReadings.get(node.nodeId) ?? { powerW: 0, energyKWh: 0 };
        existing.powerW = elec.activePower as number;
        this.deviceReadings.set(node.nodeId, existing);
      }
      // Parse DEM cluster
      const dem = ep.clusters[CLUSTER.DEM];
      if (dem) {
        const state = this.getOrCreateDEMState(node.nodeId);
        if (typeof dem.featureMap === 'number') state.featureMap = dem.featureMap as number;
        if (typeof dem.esaState === 'string') state.esaState = dem.esaState as DEMESAState;
        if (typeof dem.optOutState === 'string')
          state.optOutState = dem.optOutState as DEMOptOutState;
        if (typeof dem.esaCanGenerate === 'boolean')
          state.canGenerate = dem.esaCanGenerate as boolean;
        state.updatedAt = Date.now();
        this.demStates.set(node.nodeId, state);
      }
      // Parse EPM (Electrical Power Measurement 0x90)
      const epm = ep.clusters[CLUSTER.EPM];
      if (epm) {
        const state = this.getOrCreateDEMState(node.nodeId);
        if (typeof epm.activePower === 'number')
          state.activePowerW = (epm.activePower as number) / 1000; // mW → W
        if (typeof epm.reactivePower === 'number')
          state.reactivePowerVAR = (epm.reactivePower as number) / 1000;
        state.updatedAt = Date.now();
      }
      // Parse EEM (Electrical Energy Measurement 0x91)
      const eem = ep.clusters[CLUSTER.EEM];
      if (eem) {
        const state = this.getOrCreateDEMState(node.nodeId);
        if (typeof eem.cumulativeEnergyImported === 'number') {
          state.cumulativeImportWh = (eem.cumulativeEnergyImported as number) / 1000; // mWh → Wh
        }
        if (typeof eem.cumulativeEnergyExported === 'number') {
          state.cumulativeExportWh = (eem.cumulativeEnergyExported as number) / 1000;
        }
        state.updatedAt = Date.now();
      }
    }
  }

  private getOrCreateDEMState(nodeId: number): DEMDeviceState {
    if (!this.demStates.has(nodeId)) {
      this.demStates.set(nodeId, {
        nodeId,
        featureMap: 0,
        esaState: 'offline',
        optOutState: 'none',
        canGenerate: false,
        currentPowerAdjustmentW: null,
        activePowerW: 0,
        reactivePowerVAR: 0,
        cumulativeImportWh: 0,
        cumulativeExportWh: 0,
        updatedAt: 0,
      });
    }
    return this.demStates.get(nodeId)!;
  }

  private parseDEMAttribute(nodeId: number, attribute: string, value: number): void {
    const state = this.getOrCreateDEMState(nodeId);
    switch (attribute) {
      case 'featureMap':
        state.featureMap = value;
        break;
      case 'esaState':
        state.esaState =
          (['offline', 'online', 'running', 'paused', 'error'] as DEMESAState[])[value] ??
          'offline';
        break;
      case 'optOutState':
        state.optOutState =
          (['none', 'local', 'grid', 'both'] as DEMOptOutState[])[value] ?? 'none';
        break;
      case 'esaCanGenerate':
        state.canGenerate = Boolean(value);
        break;
    }
    state.updatedAt = Date.now();
    this.demStates.set(nodeId, state);
    this.emitModel();
  }

  private parseEPMAttribute(nodeId: number, attribute: string, value: number): void {
    const state = this.getOrCreateDEMState(nodeId);
    if (attribute === 'activePower') {
      state.activePowerW = value / 1000; // Matter: milliwatts
      // Update aggregated load too
      const existing = this.deviceReadings.get(nodeId) ?? { powerW: 0, energyKWh: 0 };
      existing.powerW = state.activePowerW;
      this.deviceReadings.set(nodeId, existing);
    } else if (attribute === 'reactivePower') {
      state.reactivePowerVAR = value / 1000;
    }
    state.updatedAt = Date.now();
    this.emitModel();
  }

  private parseEEMAttribute(nodeId: number, attribute: string, value: number): void {
    const state = this.getOrCreateDEMState(nodeId);
    if (attribute === 'cumulativeEnergyImported') {
      state.cumulativeImportWh = value / 1000;
    } else if (attribute === 'cumulativeEnergyExported') {
      state.cumulativeExportWh = value / 1000;
    }
    state.updatedAt = Date.now();
  }

  /** Get all DEM device states (used by UC26Translator and VPP service) */
  getDEMStates(): ReadonlyMap<number, DEMDeviceState> {
    return this.demStates;
  }

  private emitModel(): void {
    // Sum all device power readings
    this.totalLoadW = 0;
    for (const reading of this.deviceReadings.values()) {
      this.totalLoadW += Math.abs(reading.powerW);
    }

    const model: Partial<UnifiedEnergyModel> = {
      timestamp: Date.now(),
      pv: { totalPowerW: this.pvPowerW, yieldTodayKWh: 0 },
      grid: { powerW: this.gridPowerW, voltageV: 230 },
      load: {
        totalPowerW: this.totalLoadW,
        heatPumpPowerW: 0,
        evPowerW: 0,
        otherPowerW: this.totalLoadW,
      },
    };
    this.emitData(model);
  }
}

// ─── Registration ───────────────────────────────────────────────────

export function register(): void {
  registerAdapter(
    'matter-thread',
    (config) => new MatterThreadAdapter(config as MatterThreadConfig | undefined),
    {
      displayName: 'Matter/Thread',
      description: 'Matter-Geräte über Thread/WiFi Mesh',
      source: 'contrib',
    },
  );
}
