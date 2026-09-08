/**
 * EEBUSAdapter — Full EEBUS SPINE/SHIP Integration
 *
 * Implements the EEBUS SPINE (Smart Premises Interoperable Neutral-message Exchange)
 * protocol over SHIP (Smart Home IP) transport layer.
 *
 * Standards:
 *   • VDE-AR-E 2829-6 — EEBUS Communication Framework
 *   • SPINE Protocol — Application layer (JSON-RPC over WebSocket)
 *   • SHIP — Transport layer (mDNS discovery + TLS 1.3 mutual auth)
 *
 * Supported Use Cases (VDE-AR-E 2829-6):
 *   • EVCC → EVSE — EV Charging Communication
 *   • CEM → Controllable System — Heat Pump / Battery CEM
 *   • Grid Operator → CEM — §14a EnWG limitation signals
 *   • Monitoring — Device diagnostics & energy metering
 *
 * Architecture:
 *   EEBUS Device → mDNS Discovery → SHIP Handshake → TLS 1.3 → SPINE JSON-RPC
 *                                                                    ↓
 *                                                            This Adapter → Dashboard
 */

import { fetchWsTicket, getAuthHeader } from '../../lib/auth-token';
import { BaseAdapter } from './BaseAdapter';
import type {
  AdapterCapability,
  AdapterCommand,
  AdapterConnectionConfig,
  EVChargerData,
  UnifiedEnergyModel,
} from './EnergyAdapter';
import { validateEebusConnectConfig } from './eebus-security';

// ─── EEBUS SPINE Data Types ──────────────────────────────────────────

/** SPINE Device Classification (VDE-AR-E 2829-6 Table 1) */
export type EEBUSDeviceType =
  | 'EnergyManagementSystem'
  | 'Compressor'
  | 'EVCharger'
  | 'Inverter'
  | 'SmartEnergyAppliance'
  | 'ElectricitySupplyPoint'
  | 'DHWCircuit'
  | 'HeatingCircuit';

/** SPINE Entity → Feature mapping */
export interface EEBUSEntity {
  id: number;
  entityType: EEBUSDeviceType;
  description: string;
  features: EEBUSFeature[];
}

/** SPINE Feature (functional block on a device entity) */
export interface EEBUSFeature {
  id: number;
  featureType: EEBUSFeatureType;
  role: 'client' | 'server';
  description: string;
}

/** Supported SPINE Feature Types (VDE-AR-E 2829-6 §7) */
export type EEBUSFeatureType =
  | 'DeviceDiagnosis'
  | 'DeviceConfiguration'
  | 'ElectricalConnection'
  | 'Measurement'
  | 'LoadControl'
  | 'DeviceClassification'
  | 'TimeSeries'
  | 'IncentiveTable'
  | 'SmartEnergyManagementPs'
  | 'Bill';

/** SPINE Measurement (VDE-AR-E 2829-6 §7.4) */
export interface EEBUSMeasurement {
  measurementId: number;
  valueType: 'value' | 'averageValue' | 'minValue' | 'maxValue';
  unit: 'W' | 'Wh' | 'A' | 'V' | 'Hz' | '°C' | '%';
  scopeType:
    | 'ACPowerTotal'
    | 'ACPower'
    | 'ACCurrent'
    | 'ACVoltage'
    | 'StateOfCharge'
    | 'Temperature';
  value: number;
  timestamp: string;
}

/** SPINE LoadControl Limit (§14a EnWG / CEM) */
export interface EEBUSLoadControlLimit {
  limitId: number;
  limitType: 'minValueLimit' | 'maxValueLimit' | 'signOfChargingValue';
  unit: 'W' | 'A';
  value: number;
  isChangeable: boolean;
  isActive: boolean;
  timePeriod?: { startTime: string; endTime: string };
}

/** SPINE IncentiveTable entry for tariff-based optimization */
export interface EEBUSIncentive {
  tariffId: number;
  incentiveType: 'absoluteCost' | 'relativeCost' | 'renewableEnergyRequest' | 'co2Emission';
  currency?: string;
  value: number;
  timePeriod: { startTime: string; endTime: string };
}

/** SHIP Connection State */
export type SHIPConnectionState =
  | 'init'
  | 'cmi'
  | 'sme_hello'
  | 'sme_protocol'
  | 'pin_verify'
  | 'access_methods'
  | 'connected'
  | 'closed';

/** Discovered EEBUS device (via mDNS) */
export interface EEBUSDiscoveredDevice {
  ski: string;
  brand: string;
  model: string;
  deviceType: EEBUSDeviceType;
  host: string;
  port: number;
  path: string;
  register: boolean;
  trusted: boolean;
}

/** Connection event for the UI */
export interface EEBUSConnectionEvent {
  type: 'discovered' | 'ship_state' | 'paired' | 'pin_required' | 'data' | 'error' | 'loadcontrol';
  device?: EEBUSDiscoveredDevice;
  shipState?: SHIPConnectionState;
  ski?: string;
  pinHint?: string;
  message?: string;
  data?: Partial<UnifiedEnergyModel>;
}

// ─── SPINE Message Protocol ─────────────────────────────────────────

interface SPINEHeader {
  protocolId: 'ee1.0';
  msgCounter: number;
  cmdClassifier: 'read' | 'reply' | 'write' | 'notify' | 'call' | 'result';
  featureSource: { entity: number; feature: number };
  featureDestination: { entity: number; feature: number };
  ackRequest?: boolean;
}

interface SPINEPayload {
  cmd: Array<Record<string, unknown>>;
}

interface SPINEMessage {
  header: SPINEHeader;
  payload: SPINEPayload;
}

/** EEBUS adapter configuration */
export interface EEBUSAdapterConfig extends Partial<AdapterConnectionConfig> {
  /** Server base URL for mDNS discovery + pairing (defaults to window.location.origin) */
  serverBaseUrl?: string;
  /** Device SKI (hex) — required for browser proxy mode */
  skiFingerprint?: string;
  /** Enable mock mode (no real connection required) */
  mock?: boolean;
}

// ─── Adapter Implementation ─────────────────────────────────────────

export class EEBUSAdapter extends BaseAdapter {
  readonly id = 'eebus';
  readonly name = 'EEBUS SPINE/SHIP';
  readonly capabilities: AdapterCapability[] = ['evCharger', 'load', 'grid'];

  private eventCallbacks: Array<(event: EEBUSConnectionEvent) => void> = [];
  private ws: WebSocket | null = null;
  private msgCounter = 0;
  private shipState: SHIPConnectionState = 'init';
  private discoveredDevices: Map<string, EEBUSDiscoveredDevice> = new Map();
  private pairedDevices: Set<string> = new Set();
  private measurements: Map<number, EEBUSMeasurement> = new Map();
  private loadLimits: Map<number, EEBUSLoadControlLimit> = new Map();
  private incentives: EEBUSIncentive[] = [];
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private _serverBaseUrl: string | undefined;
  private pendingPinSki: string | null = null;
  private _skiFingerprint: string | undefined;
  private readonly _isMock: boolean;

  constructor(config?: EEBUSAdapterConfig) {
    // HIGH-01: host is required in non-mock mode
    if (!config?.host && config?.mock !== true) {
      throw new Error('EEBUSAdapter: config.host is required');
    }
    super({
      name: 'EEBUS SPINE/SHIP',
      host: config?.host ?? 'localhost',
      port: config?.port ?? 4712,
      tls: config?.tls ?? true,
      reconnect: {
        enabled: true,
        initialDelayMs: 5000,
        maxDelayMs: 30_000,
        backoffMultiplier: 2,
        ...config?.reconnect,
      },
      ...config,
    });
    this._serverBaseUrl = config?.serverBaseUrl;
    this._skiFingerprint = config?.skiFingerprint;
    this._isMock = config?.mock === true;
  }

  get devices(): EEBUSDiscoveredDevice[] {
    return Array.from(this.discoveredDevices.values());
  }

  get connectionState(): SHIPConnectionState {
    return this.shipState;
  }

  get activeLoadLimits(): EEBUSLoadControlLimit[] {
    return Array.from(this.loadLimits.values()).filter((l) => l.isActive);
  }

  get currentIncentives(): EEBUSIncentive[] {
    return this.incentives;
  }

  onEvent(callback: (event: EEBUSConnectionEvent) => void): void {
    this.eventCallbacks.push(callback);
  }

  override async connect(config?: AdapterConnectionConfig): Promise<void> {
    if (config) Object.assign(this.config, config);
    return super.connect();
  }

  protected async _connect(): Promise<void> {
    this.setStatus('connecting');
    this.shipState = 'init';

    const validation = validateEebusConnectConfig(
      {
        host: this.config.host,
        ...(this.config.tls !== undefined ? { tls: this.config.tls } : {}),
        mock: this._isMock,
        ...(this.config.clientCert !== undefined ? { clientCert: this.config.clientCert } : {}),
        ...(this.config.clientKey !== undefined ? { clientKey: this.config.clientKey } : {}),
        ...(this._skiFingerprint !== undefined ? { skiFingerprint: this._skiFingerprint } : {}),
      },
      { isBrowser: typeof window !== 'undefined' },
    );
    if (!validation.ok) {
      this.setStatus('error', validation.error);
      this.emitEvent({ type: 'error', message: validation.error });
      return;
    }

    if (this._isMock) {
      this.setStatus('connected');
      this.shipState = 'connected';
      this.emitEvent({ type: 'ship_state', shipState: 'connected' });
      return;
    }

    try {
      if (typeof window !== 'undefined') {
        await this._connectViaProxy();
        return;
      }
      await this._connectDirect();
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Connection failed';
      this.setStatus('error', msg);
      this.emitEvent({ type: 'error', message: msg });
    }
  }

  /** Browser path — mTLS terminated at API `/ws/eebus` proxy (Milestone 2.2). */
  private async _connectViaProxy(): Promise<void> {
    const ski = this._skiFingerprint;
    if (!ski) {
      throw new Error('EEBUS skiFingerprint is required for browser connections');
    }

    const ticket = await fetchWsTicket();
    if (!ticket) {
      throw new Error('JWT required — exchange API key in Settings → Security before connecting');
    }

    const wsProtocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const params = new URLSearchParams({
      ticket,
      ski,
      host: this.config.host,
      port: String(this.config.port ?? 4712),
    });
    const url = `${wsProtocol}://${window.location.host}/ws/eebus?${params.toString()}`;

    await this.openWebSocket(url);
  }

  /** Direct SHIP WebSocket (Node/Tauri only — no browser mTLS). */
  private async _connectDirect(): Promise<void> {
    const protocol = this.config.tls ? 'wss' : 'ws';
    const url = `${protocol}://${this.config.host}:${this.config.port}/ship/`;
    await this.openWebSocket(url);
  }

  private openWebSocket(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(url);

      const connectionTimeout = setTimeout(() => {
        if (this.ws && this.ws.readyState !== WebSocket.OPEN) {
          this.log.warn('Connection timeout after 30s', {
            adapterId: this.id,
            host: this.config.host,
            port: this.config.port,
          });
          this.ws.close();
          this.setStatus('error', 'Connection timeout (30s)');
          this.emitEvent({ type: 'error', message: 'Connection timeout (30s)' });
          reject(new Error('Connection timeout'));
        }
      }, 30_000);

      this.ws.onopen = () => {
        clearTimeout(connectionTimeout);
        this.log.debug('WebSocket connected — initiating SHIP handshake', {
          adapterId: this.id,
          host: this.config.host,
        });
        this.shipState = 'cmi';
        this.emitEvent({ type: 'ship_state', shipState: 'cmi' });
        this.sendSHIPInit();
        resolve();
      };

      this.ws.onmessage = (event) => {
        this.handleMessage(event.data as string);
      };

      this.ws.onerror = () => {
        clearTimeout(connectionTimeout);
        this.setStatus('error', 'WebSocket connection failed');
        this.emitEvent({ type: 'error', message: 'WebSocket connection error' });
        reject(new Error('WebSocket error'));
      };

      this.ws.onclose = (event) => {
        clearTimeout(connectionTimeout);
        this.log.info('WebSocket closed', {
          adapterId: this.id,
          code: event.code,
          reason: event.reason || '(no reason)',
        });
        this.stopHeartbeat();
        this.setStatus('disconnected');
        this.shipState = 'closed';
        this.emitEvent({ type: 'ship_state', shipState: 'closed' });
        if (event.code === 4401) {
          const ski = this.pendingPinSki ?? this._skiFingerprint;
          this.emitEvent({
            type: 'pin_required',
            ...(ski ? { ski } : {}),
            message: 'PIN required — submit via Certificate Management or submitPairingPin()',
          });
        }
        this.scheduleReconnect();
      };
    });
  }

  protected async _disconnect(): Promise<void> {
    this.stopHeartbeat();
    if (this.ws) {
      this.ws.close(1000, 'Client disconnect');
      this.ws = null;
    }
    this.shipState = 'closed';
  }

  override destroy(): void {
    this.eventCallbacks = [];
    this.discoveredDevices.clear();
    this.pairedDevices.clear();
    this.measurements.clear();
    this.loadLimits.clear();
    super.destroy();
  }

  protected _cleanup(): void {
    this.stopHeartbeat();
    if (this.ws) {
      this.ws.close(1000, 'Adapter destroyed');
      this.ws = null;
    }
  }

  protected async _sendCommand(command: AdapterCommand): Promise<boolean> {
    if (this._status !== 'connected' || !this.ws) return false;

    try {
      switch (command.type) {
        case 'SET_EV_CURRENT':
          return this.sendLoadControlWrite({
            limitId: 1,
            limitType: 'maxValueLimit',
            unit: 'A',
            value: command.value as number,
            isActive: true,
            isChangeable: true,
          });
        case 'SET_EV_POWER':
          return this.sendLoadControlWrite({
            limitId: 2,
            limitType: 'maxValueLimit',
            unit: 'W',
            value: command.value as number,
            isActive: true,
            isChangeable: true,
          });
        case 'START_CHARGING':
          return this.sendLoadControlWrite({
            limitId: 3,
            limitType: 'minValueLimit',
            unit: 'A',
            value: 6,
            isActive: true,
            isChangeable: true,
          });
        case 'STOP_CHARGING':
          return this.sendLoadControlWrite({
            limitId: 1,
            limitType: 'maxValueLimit',
            unit: 'A',
            value: 0,
            isActive: true,
            isChangeable: false,
          });
        case 'SET_HEAT_PUMP_MODE': {
          const mode = Number(command.value);
          if (!Number.isInteger(mode) || mode < 1 || mode > 4) return false;
          const ratedW = 5000;
          const powerByMode: Record<number, number> = {
            1: 0,
            2: ratedW * 0.7,
            3: ratedW * 0.9,
            4: ratedW,
          };
          return this.sendLoadControlWrite({
            limitId: 10,
            limitType: 'maxValueLimit',
            unit: 'W',
            value: powerByMode[mode] ?? ratedW * 0.7,
            isActive: true,
            isChangeable: true,
          });
        }
        case 'SET_HEAT_PUMP_POWER':
          return this.sendLoadControlWrite({
            limitId: 10,
            limitType: 'maxValueLimit',
            unit: 'W',
            value: command.value as number,
            isActive: true,
            isChangeable: true,
          });
        case 'SET_GRID_LIMIT':
          return this.sendLoadControlWrite({
            limitId: 100,
            limitType: 'maxValueLimit',
            unit: 'W',
            value: command.value as number,
            isActive: true,
            isChangeable: false,
          });
        default:
          this.log.warn('Unsupported command type', {
            adapterId: this.id,
            commandType: command.type,
          });
          return false;
      }
    } catch (error) {
      this.log.error('Command failed', error instanceof Error ? error : new Error(String(error)), {
        adapterId: this.id,
        commandType: command.type,
      });
      return false;
    }
  }

  pairDevice(ski: string): void {
    void this.pairDeviceAsync(ski);
  }

  /**
   * Discover EEBUS devices via server-side mDNS.
   * The server handles mDNS / DNS-SD queries (_ship._tcp) and returns results.
   * Falls back to direct WS-based discovery if server endpoint is unavailable.
   */
  async discoverDevices(): Promise<EEBUSDiscoveredDevice[]> {
    this.log.debug('Starting device discovery via server', { adapterId: this.id });

    try {
      const baseUrl = this.serverBaseUrl;
      const resp = await fetch(`${baseUrl}/api/eebus/discover`, {
        headers: getAuthHeader() ?? {},
        signal: AbortSignal.timeout(10_000),
      });
      if (!resp.ok) throw new Error(`Discovery endpoint returned ${resp.status}`);
      const discovered = (await resp.json()) as EEBUSDiscoveredDevice[];

      for (const device of discovered) {
        device.trusted = this.pairedDevices.has(device.ski);
        this.discoveredDevices.set(device.ski, device);
        this.emitEvent({ type: 'discovered', device });
      }
      return discovered;
    } catch (err) {
      this.log.warn('Server discovery failed, using cached devices', {
        adapterId: this.id,
        error: err instanceof Error ? err.message : String(err),
      });
      return Array.from(this.discoveredDevices.values());
    }
  }

  /**
   * Pair with device via server-side SKI verification.
   * Server handles TLS certificate trust + SHIP PIN exchange.
   */
  async pairDeviceAsync(ski: string): Promise<boolean> {
    const device = this.discoveredDevices.get(ski);
    if (!device) return false;

    try {
      const baseUrl = this.serverBaseUrl;
      const resp = await fetch(`${baseUrl}/api/eebus/pair`, {
        method: 'POST',
        headers: { ...(getAuthHeader() ?? {}), 'Content-Type': 'application/json' },
        body: JSON.stringify({ ski, host: device.host, port: device.port }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!resp.ok) return false;
      const body = (await resp.json()) as {
        status?: string;
        pinHint?: string;
      };
      if (body.status === 'pin_required') {
        this.pendingPinSki = ski;
        const pinEvent: EEBUSConnectionEvent = {
          type: 'pin_required',
          ski,
          message: 'Enter the PIN shown on your EEBUS device',
        };
        if (body.pinHint) pinEvent.pinHint = body.pinHint;
        this.emitEvent(pinEvent);
        return false;
      }
      if (
        body.status !== 'connected' &&
        body.status !== 'tls_connecting' &&
        body.status !== 'protocol'
      ) {
        return false;
      }
      this.pairedDevices.add(ski);
      device.trusted = true;
      this.discoveredDevices.set(ski, device);
      this.emitEvent({
        type: 'paired',
        device,
        message: `Paired with ${device.brand} ${device.model}`,
      });
      return true;
    } catch {
      return false;
    }
  }

  /** Submit SHIP pairing PIN via API — never auto-approved in the browser (SEC-03). */
  async submitPairingPin(ski: string, pin: string): Promise<boolean> {
    try {
      const baseUrl = this.serverBaseUrl;
      const resp = await fetch(`${baseUrl}/api/eebus/pair/pin`, {
        method: 'POST',
        headers: { ...(getAuthHeader() ?? {}), 'Content-Type': 'application/json' },
        body: JSON.stringify({ ski, pin }),
        signal: AbortSignal.timeout(10_000),
      });
      return resp.ok;
    } catch {
      return false;
    }
  }

  /** Base URL for server-side EEBUS API endpoints */
  private get serverBaseUrl(): string {
    if (this._serverBaseUrl) return this._serverBaseUrl;
    return typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
  }

  // ─── SHIP Protocol ────────────────────────────────────────────────

  private sendSHIPInit(): void {
    this.ws?.send(
      JSON.stringify({
        type: 'init',
        version: [1, 0, 0],
        formats: ['JSON-UTF8'],
      }),
    );
  }

  private sendSHIPHello(): void {
    this.ws?.send(
      JSON.stringify({
        connectionHello: [{ phase: 'ready', waiting: 60000, prolongationRequest: false }],
      }),
    );
  }

  // ─── SPINE Protocol ───────────────────────────────────────────────

  private handleMessage(raw: string): void {
    try {
      const message = JSON.parse(raw);

      if (message.type === 'init' || message.connectionHello) {
        this.handleSHIPMessage(message);
        return;
      }

      if (message.datagram) {
        this.handleSPINEDatagram(message.datagram);
        return;
      }

      if (message.connectionPinState) {
        this.shipState = 'pin_verify';
        const ski = message.connectionPinState?.[0]?.ski;
        if (typeof ski === 'string') {
          this.pendingPinSki = ski;
        }
        const resolvedSki = typeof ski === 'string' ? ski : (this.pendingPinSki ?? undefined);
        this.emitEvent({
          type: 'pin_required',
          ...(resolvedSki ? { ski: resolvedSki } : {}),
          message:
            'SHIP PIN required — use Certificate Management or submitPairingPin(); auto-PIN disabled (SEC-03)',
        });
        return;
      }

      if (message.type === 'ENERGY_UPDATE' || message.data) {
        this.handleSimpleDataUpdate(message.data ?? message);
      }
    } catch (error) {
      this.log.error(
        'SPINE/SHIP message parse error',
        error instanceof Error ? error : new Error(String(error)),
        { adapterId: this.id },
      );
    }
  }

  private handleSHIPMessage(message: Record<string, unknown>): void {
    if (message.type === 'init') {
      this.shipState = 'sme_hello';
      this.emitEvent({ type: 'ship_state', shipState: 'sme_hello' });
      this.sendSHIPHello();
      return;
    }

    if (message.connectionHello) {
      this.shipState = 'sme_protocol';
      this.emitEvent({ type: 'ship_state', shipState: 'sme_protocol' });

      setTimeout(() => {
        this.shipState = 'connected';
        this.resetRetryDelay(); // feed success into circuit breaker + log restoration
        this.setStatus('connected');
        this.emitEvent({ type: 'ship_state', shipState: 'connected' });
        this.startHeartbeat();
        this.requestDeviceData();
      }, 100);
    }
  }

  private handleSPINEDatagram(datagram: { header: SPINEHeader; payload: SPINEPayload }): void {
    const { header, payload } = datagram;

    for (const cmd of payload.cmd) {
      if (cmd.measurementListData) {
        this.handleMeasurementData(
          cmd.measurementListData as { measurementData: EEBUSMeasurement[] },
        );
      }
      if (cmd.loadControlLimitListData) {
        this.handleLoadControlData(
          cmd.loadControlLimitListData as { loadControlLimitData: EEBUSLoadControlLimit[] },
        );
      }
      if (cmd.incentiveTableData) {
        this.handleIncentiveData(cmd.incentiveTableData as { incentiveData: EEBUSIncentive[] });
      }
    }

    if (header.ackRequest) {
      this.sendSPINEAck(header.msgCounter);
    }
  }

  private handleMeasurementData(data: { measurementData: EEBUSMeasurement[] }): void {
    for (const m of data.measurementData) {
      this.measurements.set(m.measurementId, m);
    }
    this.buildAndEmitModel();
  }

  private handleLoadControlData(data: { loadControlLimitData: EEBUSLoadControlLimit[] }): void {
    for (const limit of data.loadControlLimitData) {
      this.loadLimits.set(limit.limitId, limit);
      this.emitEvent({
        type: 'loadcontrol',
        message: `Load limit ${limit.limitType}: ${limit.value}${limit.unit} (${limit.isActive ? 'active' : 'inactive'})`,
      });
    }
  }

  private handleIncentiveData(data: { incentiveData: EEBUSIncentive[] }): void {
    this.incentives = data.incentiveData;
  }

  private handleSimpleDataUpdate(data: Record<string, unknown>): void {
    const model: Partial<UnifiedEnergyModel> = { timestamp: Date.now() };

    if (data.evPower !== undefined || data.evStatus !== undefined) {
      model.evCharger = {
        status: (data.evStatus as EVChargerData['status']) ?? 'available',
        powerW: (data.evPower as number) ?? 0,
        energySessionKWh: (data.evEnergy as number) ?? 0,
        maxCurrentA: (data.evMaxCurrent as number) ?? 32,
        vehicleConnected: (data.vehicleConnected as boolean) ?? false,
        v2xCapable: (data.v2xCapable as boolean) ?? false,
        v2xActive: (data.v2xActive as boolean) ?? false,
      };
    }

    if (data.houseLoad !== undefined || data.heatPumpPower !== undefined) {
      model.load = {
        totalPowerW: (data.houseLoad as number) ?? 0,
        heatPumpPowerW: (data.heatPumpPower as number) ?? 0,
        evPowerW: (data.evPower as number) ?? 0,
        otherPowerW: Math.max(
          0,
          ((data.houseLoad as number) ?? 0) -
            ((data.heatPumpPower as number) ?? 0) -
            ((data.evPower as number) ?? 0),
        ),
      };
    }

    this.snapshot = { ...this.snapshot, ...model };
    this.emitData(this.snapshot);
    this.emitEvent({ type: 'data', data: model });
  }

  private buildAndEmitModel(): void {
    const model: Partial<UnifiedEnergyModel> = { timestamp: Date.now() };

    const evPower = this.findMeasurement('ACPowerTotal', 'W', [1, 2, 3]);
    const evCurrent = this.findMeasurement('ACCurrent', 'A', [4, 5, 6]);
    const evVoltage = this.findMeasurement('ACVoltage', 'V', [7, 8, 9]);

    if (evPower !== null) {
      model.evCharger = {
        status: evPower > 0 ? 'charging' : 'available',
        powerW: evPower,
        energySessionKWh: 0,
        currentA: evCurrent ?? 0,
        voltageV: evVoltage ?? 0,
        maxCurrentA: this.getMaxCurrentLimit(),
        vehicleConnected: evPower > 0 || evCurrent !== null,
        v2xCapable: false,
        v2xActive: false,
      };
    }

    const hpPower = this.findMeasurement('ACPowerTotal', 'W', [10, 11, 12]);
    const totalLoad = this.findMeasurement('ACPowerTotal', 'W', [20, 21, 22]);

    if (hpPower !== null || totalLoad !== null) {
      model.load = {
        totalPowerW: totalLoad ?? 0,
        heatPumpPowerW: hpPower ?? 0,
        evPowerW: evPower ?? 0,
        otherPowerW: Math.max(0, (totalLoad ?? 0) - (hpPower ?? 0) - (evPower ?? 0)),
      };
    }

    this.snapshot = { ...this.snapshot, ...model };
    this.emitData(this.snapshot);
    this.emitEvent({ type: 'data', data: model });
  }

  private findMeasurement(scope: string, unit: string, ids: number[]): number | null {
    for (const id of ids) {
      const m = this.measurements.get(id);
      if (m && m.scopeType === scope && m.unit === unit) return m.value;
    }
    return null;
  }

  private getMaxCurrentLimit(): number {
    for (const limit of this.loadLimits.values()) {
      if (limit.limitType === 'maxValueLimit' && limit.unit === 'A' && limit.isActive)
        return limit.value;
    }
    return 32;
  }

  // ─── SPINE Write Commands ─────────────────────────────────────────

  private sendLoadControlWrite(limit: EEBUSLoadControlLimit): boolean {
    return this.sendSPINEMessage({
      header: {
        protocolId: 'ee1.0',
        msgCounter: ++this.msgCounter,
        cmdClassifier: 'write',
        featureSource: { entity: 1, feature: 1 },
        featureDestination: { entity: 2, feature: 4 },
        ackRequest: true,
      },
      payload: {
        cmd: [{ loadControlLimitListData: { loadControlLimitData: [limit] } }],
      },
    });
  }

  private sendSPINEAck(_replyCounter: number): void {
    this.sendSPINEMessage({
      header: {
        protocolId: 'ee1.0',
        msgCounter: ++this.msgCounter,
        cmdClassifier: 'result',
        featureSource: { entity: 1, feature: 0 },
        featureDestination: { entity: 0, feature: 0 },
      },
      payload: {
        cmd: [{ resultData: { errorNumber: 0, description: 'ok' } }],
      },
    });
  }

  private sendSPINEMessage(message: SPINEMessage): boolean {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return false;
    try {
      this.ws.send(JSON.stringify({ datagram: message }));
      return true;
    } catch {
      return false;
    }
  }

  private requestDeviceData(): void {
    // Request measurements
    this.sendSPINEMessage({
      header: {
        protocolId: 'ee1.0',
        msgCounter: ++this.msgCounter,
        cmdClassifier: 'read',
        featureSource: { entity: 1, feature: 1 },
        featureDestination: { entity: 2, feature: 2 },
      },
      payload: { cmd: [{ measurementListData: {} }] },
    });

    // Request load control limits
    this.sendSPINEMessage({
      header: {
        protocolId: 'ee1.0',
        msgCounter: ++this.msgCounter,
        cmdClassifier: 'read',
        featureSource: { entity: 1, feature: 1 },
        featureDestination: { entity: 2, feature: 4 },
      },
      payload: { cmd: [{ loadControlLimitListData: {} }] },
    });

    // Request incentive table
    this.sendSPINEMessage({
      header: {
        protocolId: 'ee1.0',
        msgCounter: ++this.msgCounter,
        cmdClassifier: 'read',
        featureSource: { entity: 1, feature: 1 },
        featureDestination: { entity: 2, feature: 6 },
      },
      payload: { cmd: [{ incentiveTableData: {} }] },
    });
  }

  // ─── Lifecycle ────────────────────────────────────────────────────

  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'ping' }));
      }
    }, 30000);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  private emitEvent(event: EEBUSConnectionEvent): void {
    for (const cb of this.eventCallbacks) cb(event);
  }
}
