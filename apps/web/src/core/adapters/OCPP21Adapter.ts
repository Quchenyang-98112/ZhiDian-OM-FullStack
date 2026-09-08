/**
 * OCPP21Adapter — Production OCPP 2.1 EV Charging Station adapter
 *
 * Implements OCPP 2.1 JSON-RPC over WebSocket with:
 *   • Proper message correlation (pending call map with timeouts)
 *   • Full CALL / CALLRESULT / CALLERROR handling
 *   • Smart charging profiles (TxDefaultProfile, TxProfile, ChargingStationMaxProfile)
 *   • V2X (Vehicle-to-Grid / Vehicle-to-Home) discharge control
 *   • ISO 15118 Plug & Charge readiness
 *   • §14a EnWG grid operator curtailment via ChargingStationMaxProfile
 *   • Security profiles 0–3 (unsecured, basic auth, TLS, mTLS)
 *
 * Architecture:
 *   EVSE (Wallbox) ←→ OCPP 2.1 CSMS Backend ←→ WebSocket ←→ This Adapter
 *
 * The adapter acts as a mini-CSMS for direct wallbox integration, or connects
 * to an existing CSMS backend as a monitoring client.
 */

import { BaseAdapter } from './BaseAdapter';
import type {
  AdapterCapability,
  AdapterCommand,
  AdapterConnectionConfig,
  BPTNegotiationParams,
  EVChargerData,
  EVPlugType,
  UnifiedEnergyModel,
} from './EnergyAdapter';
import { type OcppRevocationCheck, prepareOcppConnection } from './ocpp-security';

// ── V2G / SOC guardrails ─────────────────────────────────────────────
/** Minimum EV SOC% before V2G discharge is permitted (ISO 15118-20 §9.8 / CharIN Guide 2.0) */
const V2G_MIN_SOC_PERCENT = 15;
/** Maximum EV SOC% at which the V2G discharge session initiates (safety ceiling) */
const V2G_MAX_CHARGE_SOC_PERCENT = 95;

// ─── OCPP 2.1 message types (JSON-RPC) ──────────────────────────────

const OCPP_CALL = 2;
const OCPP_CALLRESULT = 3;
const OCPP_CALLERROR = 4;

type OCPPMessage =
  | [typeof OCPP_CALL, string, string, Record<string, unknown>]
  | [typeof OCPP_CALLRESULT, string, Record<string, unknown>]
  | [typeof OCPP_CALLERROR, string, string, string, Record<string, unknown>];

/** Pending call entry for message correlation */
interface PendingCall {
  action: string;
  resolve: (result: Record<string, unknown>) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

/** Subset of OCPP 2.1 StatusNotification connectorStatus values */
type OCPPConnectorStatus = 'Available' | 'Occupied' | 'Reserved' | 'Unavailable' | 'Faulted';

/** OCPP 2.1 TransactionEvent data */
interface OCPPTransactionEvent {
  eventType: 'Started' | 'Updated' | 'Ended';
  transactionInfo?: {
    transactionId: string;
    chargingState?: 'Charging' | 'EVConnected' | 'SuspendedEV' | 'SuspendedEVSE' | 'Idle';
  };
  meterValue?: {
    timestamp: string;
    sampledValue: {
      value: number;
      measurand?:
        | 'Energy.Active.Import.Register'
        | 'Power.Active.Import'
        | 'SoC'
        | 'Current.Import'
        | 'Voltage';
      unit?: string;
      phase?: string;
    }[];
  }[];
  evse?: { id: number; connectorId?: number };
}

/** Internal charger state tracking */
interface ChargerState {
  connectorStatus: OCPPConnectorStatus;
  chargingPowerW: number;
  energySessionKWh: number;
  socPercent: number;
  currentA: number;
  voltageV: number;
  maxCurrentA: number;
  vehicleConnected: boolean;
  v2xCapable: boolean;
  v2xActive: boolean;
  transactionId: string | undefined;
  /** ISO 15118 session active (vs. basic IEC 61851) */
  iso15118Active: boolean;
  /** ISO 15118 Plug & Charge certificate present */
  iso15118Certified: boolean;
  /** BPT negotiation parameters received via ISO 15118-20 (null until negotiated) */
  bptParams: BPTNegotiationParams | undefined;
  /** EV-reported SOC% via ISO 15118-20 PowerDelivery (0–100) */
  evSocPercent: number;
  /** Unix ms — EV-reported departure time */
  evDepartureTime: number | undefined;
  /** AFIR Article 5 connector/plug type */
  plugType: EVPlugType;
}

/** OCPP security profile (for config validation) */
export type OCPPSecurityProfile = 0 | 1 | 2 | 3;

const DEFAULT_RECONNECT = {
  enabled: true,
  initialDelayMs: 3000,
  maxDelayMs: 30_000,
  backoffMultiplier: 2,
};

/** Default RPC call timeout (30s) */
const CALL_TIMEOUT_MS = 30_000;

export interface OCPPAdapterConfig extends Partial<AdapterConnectionConfig> {
  /** OCPP Security Profile (0-3) */
  securityProfile?: OCPPSecurityProfile;
  /** Charging station identity (for URI path and Basic Auth username) */
  stationId?: string;
  /** ISO 15118 Plug & Charge support */
  iso15118?: boolean;
  /** Whether the wallbox supports V2G / BPT (CCS2 combo required) */
  v2xCapable?: boolean;
  /** AFIR-compliant plug/connector type */
  plugType?: EVPlugType;
  /** CRL/OCSP revocation check mode (hook; full OCSP via API proxy later) */
  revocationCheck?: OcppRevocationCheck;
}

export class OCPP21Adapter extends BaseAdapter {
  readonly id = 'ocpp-21';
  readonly name = 'OCPP 2.1 Charging Station';
  readonly capabilities: AdapterCapability[] = ['evCharger'];

  private ws: WebSocket | null = null;
  private msgCounter = 0;
  private pendingCalls: Map<string, PendingCall> = new Map();
  private stationId: string;
  /** Security profile — drives TLS, Basic Auth, and mTLS validation in _connect() */
  readonly securityProfile: OCPPSecurityProfile;
  private readonly revocationCheck: OcppRevocationCheck;
  private iso15118Enabled: boolean;

  private charger: ChargerState = {
    connectorStatus: 'Available',
    chargingPowerW: 0,
    energySessionKWh: 0,
    socPercent: 0,
    currentA: 0,
    voltageV: 230,
    maxCurrentA: 32,
    vehicleConnected: false,
    v2xCapable: false,
    v2xActive: false,
    transactionId: undefined,
    iso15118Active: false,
    iso15118Certified: false,
    bptParams: undefined,
    evSocPercent: 0,
    evDepartureTime: undefined,
    plugType: 'IEC_62196_T2_COMBO',
  };

  constructor(config?: OCPPAdapterConfig) {
    super({
      name: 'OCPP 2.1 CSMS',
      host: config?.host ?? '192.168.1.200',
      port: config?.port ?? 9000,
      tls: config?.tls ?? true,
      reconnect: { ...DEFAULT_RECONNECT, ...config?.reconnect },
      ...config,
    });
    this.stationId = config?.stationId ?? 'nexus-station-1';
    this.securityProfile = config?.securityProfile ?? 2;
    this.revocationCheck = config?.revocationCheck ?? 'off';
    this.iso15118Enabled = config?.iso15118 ?? false;
    this.charger.v2xCapable = config?.v2xCapable ?? false;
    this.charger.plugType = config?.plugType ?? 'IEC_62196_T2_COMBO';
  }

  // ─── BaseAdapter abstract implementations ─────────────────────────

  protected async _connect(): Promise<void> {
    this.setStatus('connecting');

    const { mergeCredentialsIntoConfig } = await import('../../lib/secure-store');
    const merged = await mergeCredentialsIntoConfig('ocpp-21', this.config);

    const prep = prepareOcppConnection({
      host: merged.host,
      port: merged.port,
      securityProfile: this.securityProfile,
      stationId: this.stationId,
      revocationCheck: this.revocationCheck,
      ...(merged.tls !== undefined ? { tls: merged.tls } : {}),
      ...(merged.authToken !== undefined ? { authToken: merged.authToken } : {}),
      ...(merged.clientCert !== undefined ? { clientCert: merged.clientCert } : {}),
      ...(merged.clientKey !== undefined ? { clientKey: merged.clientKey } : {}),
      ...(merged.caCert !== undefined ? { caCert: merged.caCert } : {}),
    });

    if (!prep.ok) {
      this.setStatus('error', prep.error);
      return;
    }

    let connectUrl = prep.url;
    const useBrowserProxy = this.securityProfile === 3 && typeof window !== 'undefined';

    if (useBrowserProxy) {
      const { createOcppProxySession, buildOcppProxyWebSocketUrl } = await import(
        '../../lib/ocpp-proxy'
      );
      const session = await createOcppProxySession({
        host: merged.host,
        port: merged.port,
        stationId: this.stationId,
        clientCert: merged.clientCert ?? '',
        clientKey: merged.clientKey ?? '',
        ...(merged.caCert !== undefined ? { caCert: merged.caCert } : {}),
        revocationCheck: this.revocationCheck,
      });
      if (!session.ok) {
        const msg =
          session.error === 'no_auth'
            ? 'JWT required — exchange API key in Settings → Security before connecting'
            : 'Failed to create OCPP proxy session';
        this.setStatus('error', msg);
        return;
      }
      const proxyUrl = await buildOcppProxyWebSocketUrl(session.sessionId);
      if (!proxyUrl.ok) {
        this.setStatus('error', 'Failed to obtain WebSocket ticket for OCPP proxy');
        return;
      }
      connectUrl = proxyUrl.url;
    } else if (prep.warnings?.length) {
      this.log.warn(prep.warnings.join(' '), { securityProfile: this.securityProfile });
    }

    const ws = new WebSocket(connectUrl, prep.protocols);

    ws.onopen = () => {
      this.resetRetryDelay();
      this.setStatus('connected');

      // Send BootNotification (required by OCPP spec on connect)
      // .catch() ensures no unhandled rejection if connection drops before CALLRESULT
      this.call('BootNotification', {
        chargingStation: {
          model: 'NexusHEMS',
          vendorName: 'NexusDash',
          firmwareVersion: '4.2.0',
          serialNumber: this.stationId,
        },
        reason: 'PowerUp',
      }).catch(() => {});
    };

    ws.onmessage = (event: MessageEvent) => {
      try {
        const msg = JSON.parse(String(event.data)) as OCPPMessage;
        this.handleMessage(msg);
      } catch {
        // Ignore non-JSON
      }
    };

    ws.onclose = () => {
      this.setStatus('disconnected');
      this.cleanupPendingCalls();
      this.scheduleReconnect();
    };

    ws.onerror = () => {
      ws.close();
    };

    this.ws = ws;
  }

  protected async _disconnect(): Promise<void> {
    this.cleanupPendingCalls();
    this.ws?.close();
    this.ws = null;
  }

  protected async _sendCommand(command: AdapterCommand): Promise<boolean> {
    if (this.ws?.readyState !== WebSocket.OPEN) return false;

    switch (command.type) {
      case 'SET_EV_CURRENT':
        return this.sendSetChargingProfile(Number(command.value));
      case 'SET_EV_POWER':
        // Convert W → A using measured/nominal voltage
        return this.sendSetChargingProfileW(Number(command.value));
      case 'SET_EV_MIN_CURRENT':
        return this.sendMinCurrentLimit(Number(command.value));
      case 'SET_EV_PHASES':
        return this.sendPhaseConfig(Number(command.value) as 1 | 3);
      case 'SET_EV_TARGET_SOC':
        return this.sendTargetSocProfile(
          Number(command.value),
          command.payload as Record<string, unknown> | undefined,
        );
      case 'SET_SMART_COST_LIMIT':
        return this.sendSmartCostLimit(Number(command.value));
      case 'START_CHARGING':
        return this.sendRemoteStart();
      case 'STOP_CHARGING':
        return this.sendRemoteStop();
      case 'SET_V2X_DISCHARGE':
        return this.sendV2XDischarge(Number(command.value));
      case 'SET_V2G_BPT_PARAMS':
        return this.sendV2GBPTParams(command.payload as unknown as BPTNegotiationParams);
      case 'SET_GRID_LIMIT':
        // §14a EnWG: curtailment in WATTS via ChargingStationMaxProfile (OCPP 2.1 B12)
        return this.sendGridCurtailment(Number(command.value));
      default:
        return false;
    }
  }

  protected _cleanup(): void {
    this.cleanupPendingCalls();
    this.ws?.close();
    this.ws = null;
  }

  override getSnapshot(): Partial<UnifiedEnergyModel> {
    return { evCharger: this.toEVChargerData() };
  }

  // ─── OCPP JSON-RPC: Correlated Call/Result/Error ──────────────────

  /**
   * Send an OCPP CALL and await CALLRESULT with proper correlation.
   * Returns the response payload or throws on error/timeout.
   */
  async call(action: string, payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    if (this.ws?.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket not connected');
    }

    const messageId = `msg-${++this.msgCounter}-${Date.now()}`;

    return new Promise<Record<string, unknown>>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingCalls.delete(messageId);
        reject(new Error(`OCPP call "${action}" timed out after ${CALL_TIMEOUT_MS}ms`));
      }, CALL_TIMEOUT_MS);

      this.pendingCalls.set(messageId, { action, resolve, reject, timer });
      this.ws!.send(JSON.stringify([OCPP_CALL, messageId, action, payload]));
    });
  }

  private sendCallResult(messageId: string, payload: Record<string, unknown>): void {
    if (this.ws?.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify([OCPP_CALLRESULT, messageId, payload]));
  }

  private sendCallError(messageId: string, errorCode: string, errorDescription: string): void {
    if (this.ws?.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify([OCPP_CALLERROR, messageId, errorCode, errorDescription, {}]));
  }

  private cleanupPendingCalls(): void {
    for (const [id, pending] of this.pendingCalls) {
      clearTimeout(pending.timer);
      pending.reject(new Error('Connection closed'));
      this.pendingCalls.delete(id);
    }
  }

  // ─── Message dispatch ─────────────────────────────────────────────

  private handleMessage(msg: OCPPMessage): void {
    const messageType = msg[0];

    if (messageType === OCPP_CALL) {
      // Inbound CALL from CSMS/wallbox
      const [, messageId, action, payload] = msg as [2, string, string, Record<string, unknown>];
      this.handleInboundCall(messageId, action, payload);
    } else if (messageType === OCPP_CALLRESULT) {
      // Response to our outbound CALL
      const [, messageId, payload] = msg as [3, string, Record<string, unknown>];
      const pending = this.pendingCalls.get(messageId);
      if (pending) {
        clearTimeout(pending.timer);
        this.pendingCalls.delete(messageId);
        pending.resolve(payload);
      }
    } else if (messageType === OCPP_CALLERROR) {
      // Error response to our outbound CALL
      const [, messageId, errorCode, errorDescription] = msg as [
        4,
        string,
        string,
        string,
        Record<string, unknown>,
      ];
      const pending = this.pendingCalls.get(messageId);
      if (pending) {
        clearTimeout(pending.timer);
        this.pendingCalls.delete(messageId);
        pending.reject(new Error(`OCPP error ${errorCode}: ${errorDescription}`));
      }
    }
  }

  private handleInboundCall(
    messageId: string,
    action: string,
    payload: Record<string, unknown>,
  ): void {
    switch (action) {
      case 'StatusNotification':
        this.handleStatusNotification(payload);
        this.sendCallResult(messageId, {});
        break;
      case 'TransactionEvent':
        this.handleTransactionEvent(payload as unknown as OCPPTransactionEvent);
        this.sendCallResult(messageId, {});
        break;
      case 'MeterValues':
        this.handleMeterValues(payload);
        this.sendCallResult(messageId, {});
        break;
      case 'Heartbeat':
        this.sendCallResult(messageId, { currentTime: new Date().toISOString() });
        break;
      case 'Authorize':
        // Auto-authorize for HEMS-managed stations
        this.sendCallResult(messageId, {
          idTokenInfo: { status: 'Accepted' },
        });
        break;
      default:
        this.sendCallError(messageId, 'NotImplemented', `Action ${action} not supported`);
    }
  }

  // ─── Data handlers ────────────────────────────────────────────────

  private handleStatusNotification(payload: Record<string, unknown>): void {
    const status = payload.connectorStatus as OCPPConnectorStatus | undefined;
    if (status) {
      this.charger.connectorStatus = status;
      this.charger.vehicleConnected = status === 'Occupied';
    }
    this.emitChargerData();
  }

  private handleTransactionEvent(event: OCPPTransactionEvent): void {
    if (event.transactionInfo?.transactionId) {
      this.charger.transactionId = event.transactionInfo.transactionId;
    }

    if (event.eventType === 'Started') {
      this.charger.energySessionKWh = 0;
      this.charger.vehicleConnected = true;
    }

    // Parse charging state from transactionInfo
    if (event.transactionInfo?.chargingState) {
      switch (event.transactionInfo.chargingState) {
        case 'Charging':
          this.charger.connectorStatus = 'Occupied';
          this.charger.vehicleConnected = true;
          break;
        case 'SuspendedEV':
        case 'SuspendedEVSE':
          this.charger.vehicleConnected = true;
          break;
        case 'Idle':
        case 'EVConnected':
          this.charger.vehicleConnected = true;
          break;
      }
    }

    if (event.meterValue) {
      for (const mv of event.meterValue) {
        for (const sv of mv.sampledValue) {
          switch (sv.measurand) {
            case 'Power.Active.Import':
              this.charger.chargingPowerW = sv.value;
              break;
            case 'Energy.Active.Import.Register':
              this.charger.energySessionKWh = sv.value / 1000;
              break;
            case 'SoC':
              this.charger.socPercent = sv.value;
              // ISO 15118-20: EV-reported SOC is authoritative for BPT guardrails
              if (this.charger.iso15118Active) {
                this.charger.evSocPercent = sv.value;
              }
              break;
            case 'Current.Import':
              this.charger.currentA = sv.value;
              break;
            case 'Voltage':
              this.charger.voltageV = sv.value;
              break;
          }
        }
      }
    }

    if (event.eventType === 'Ended') {
      this.charger.chargingPowerW = 0;
      this.charger.currentA = 0;
      this.charger.transactionId = undefined;
    }

    this.emitChargerData();
  }

  private handleMeterValues(payload: Record<string, unknown>): void {
    const meterValue = payload.meterValue as
      | { sampledValue: { value: number; measurand?: string }[] }[]
      | undefined;

    if (!meterValue) return;

    for (const mv of meterValue) {
      for (const sv of mv.sampledValue) {
        if (sv.measurand === 'Power.Active.Import') {
          this.charger.chargingPowerW = sv.value;
        }
      }
    }

    this.emitChargerData();
  }

  private emitChargerData(): void {
    this.emitData({
      timestamp: Date.now(),
      evCharger: this.toEVChargerData(),
    });
  }

  private toEVChargerData(): EVChargerData {
    const statusMap: Record<OCPPConnectorStatus, EVChargerData['status']> = {
      Available: 'available',
      Occupied: 'charging',
      Reserved: 'preparing',
      Unavailable: 'suspended',
      Faulted: 'faulted',
    };

    return {
      status: statusMap[this.charger.connectorStatus] ?? 'available',
      powerW: this.charger.chargingPowerW,
      energySessionKWh: this.charger.energySessionKWh,
      socPercent: this.charger.socPercent || undefined,
      currentA: this.charger.currentA || undefined,
      voltageV: this.charger.voltageV,
      maxCurrentA: this.charger.maxCurrentA,
      vehicleConnected: this.charger.vehicleConnected,
      v2xCapable: this.charger.v2xCapable,
      v2xActive: this.charger.v2xActive,
      bptParams: this.charger.bptParams,
      evSocPercent: this.charger.evSocPercent || undefined,
      evDepartureTime: this.charger.evDepartureTime,
      iso15118Active: this.charger.iso15118Active,
      plugType: this.charger.plugType,
    };
  }

  // ─── OCPP 2.1 outbound commands ──────────────────────────────────

  private sendSetChargingProfile(maxCurrentA: number): boolean {
    this.charger.maxCurrentA = maxCurrentA;
    return this.sendProfile(1, 1, 0, 'TxDefaultProfile', {
      chargingRateUnit: 'A',
      chargingSchedulePeriod: [{ startPeriod: 0, limit: maxCurrentA }],
    });
  }

  private sendRemoteStart(): boolean {
    this.call('RequestStartTransaction', {
      evseId: 1,
      remoteStartId: Date.now(),
      idToken: {
        idToken: this.iso15118Enabled ? 'auto-plug-and-charge' : 'nexus-hems',
        type: this.iso15118Enabled ? 'eMAID' : 'Central',
      },
    }).catch(() => {});
    return true;
  }

  private sendRemoteStop(): boolean {
    if (!this.charger.transactionId) return false;
    this.call('RequestStopTransaction', {
      transactionId: this.charger.transactionId,
    }).catch(() => {});
    return true;
  }

  /**
   * V2G BPT: store negotiated parameters and apply them as a SetChargingProfile
   * with discharge limits derived from ISO 15118-20 Annex D values.
   * Guards: v2xCapable must be true; SOC must be above V2G_MIN_SOC_PERCENT.
   */
  private sendV2GBPTParams(params: BPTNegotiationParams): boolean {
    if (!this.charger.v2xCapable) return false;
    // Fail-safe: a non-positive/unknown SOC (0 = not yet reported) is treated as
    // unsafe. Only proceed when SOC is known to be at or above the floor.
    if (!(this.charger.evSocPercent >= V2G_MIN_SOC_PERCENT)) {
      return false; // SOC too low or unknown — cannot initiate V2G
    }
    if (
      this.charger.evSocPercent >= V2G_MAX_CHARGE_SOC_PERCENT &&
      params.evMaximumDischargePowerW <= 0
    ) {
      return false; // Nothing to discharge at max SOC if discharge power is zero
    }

    this.charger.bptParams = params;
    this.charger.iso15118Active = true;
    const ok = this.sendProfile(1, 3, 2, 'TxProfile', {
      chargingRateUnit: 'W',
      chargingSchedulePeriod: [{ startPeriod: 0, limit: -params.evMaximumDischargePowerW }],
      minChargingRate: params.evMinimumDischargePowerW,
    });
    this.charger.v2xActive = params.evMaximumDischargePowerW > 0;
    this.emitChargerData();
    return ok;
  }

  /**
   * V2X discharge: negative limit = vehicle-to-grid.
   * When BPT params are negotiated, clamps to evMaximumDischargePowerW.
   * SOC guardrail: blocks discharge below V2G_MIN_SOC_PERCENT.
   */
  private sendV2XDischarge(dischargePowerW: number): boolean {
    if (!this.charger.v2xCapable) return false;

    // SOC guardrail — fail-safe: 0/unknown SOC is unsafe, block discharge.
    if (!(this.charger.evSocPercent >= V2G_MIN_SOC_PERCENT)) {
      return false;
    }

    const effectivePowerW = this.charger.bptParams
      ? Math.min(dischargePowerW, this.charger.bptParams.evMaximumDischargePowerW)
      : dischargePowerW;
    const ok = this.sendProfile(1, 2, 1, 'TxProfile', {
      chargingRateUnit: 'A',
      chargingSchedulePeriod: [
        { startPeriod: 0, limit: -Math.round(effectivePowerW / this.charger.voltageV) },
      ],
    });
    this.charger.v2xActive = effectivePowerW > 0;
    return ok;
  }

  /** Shared SetChargingProfile helper — reduces duplicated OCPP 2.1 payload boilerplate */
  private sendProfile(
    evseId: number,
    id: number,
    stackLevel: number,
    purpose: string,
    schedule: Record<string, unknown>,
    profileExtra?: Record<string, unknown>,
  ): boolean {
    this.call('SetChargingProfile', {
      evseId,
      chargingProfile: {
        id,
        stackLevel,
        chargingProfilePurpose: purpose,
        chargingProfileKind: 'Absolute',
        chargingSchedule: [{ id, ...schedule }],
        ...profileExtra,
      },
    }).catch(() => {});
    return true;
  }

  /** §14a EnWG: grid limit in W via ChargingStationMaxProfile (OCPP 2.1 B12) */
  private sendGridCurtailment(maxPowerW: number): boolean {
    return this.sendProfile(0, 100, 10, 'ChargingStationMaxProfile', {
      chargingRateUnit: 'W',
      chargingSchedulePeriod: [{ startPeriod: 0, limit: maxPowerW }],
    });
  }

  private sendSetChargingProfileW(powerW: number): boolean {
    return this.sendProfile(1, 1, 0, 'TxDefaultProfile', {
      chargingRateUnit: 'W',
      chargingSchedulePeriod: [{ startPeriod: 0, limit: powerW }],
    });
  }

  private sendMinCurrentLimit(minCurrentA: number): boolean {
    return this.sendProfile(1, 5, 0, 'TxDefaultProfile', {
      chargingRateUnit: 'A',
      chargingSchedulePeriod: [{ startPeriod: 0, limit: this.charger.maxCurrentA }],
      minChargingRate: minCurrentA,
    });
  }

  private sendPhaseConfig(phases: 1 | 3): boolean {
    const limit =
      phases === 1 ? this.charger.maxCurrentA : Math.round(this.charger.maxCurrentA / 3);
    return this.sendProfile(1, 6, 1, 'TxProfile', {
      chargingRateUnit: 'A',
      chargingSchedulePeriod: [{ startPeriod: 0, limit }],
      ...(phases === 1 ? { startSchedule: new Date().toISOString() } : {}),
    });
  }

  private sendTargetSocProfile(
    targetSocPercent: number,
    payload?: Record<string, unknown>,
  ): boolean {
    const departureTime =
      typeof payload?.departureTime === 'number'
        ? new Date(payload.departureTime).toISOString()
        : new Date(Date.now() + 8 * 3600 * 1000).toISOString();
    const maxW = this.charger.maxCurrentA * this.charger.voltageV;
    const ok = this.sendProfile(
      1,
      7,
      0,
      'TxDefaultProfile',
      {
        startSchedule: departureTime,
        chargingRateUnit: 'W',
        chargingSchedulePeriod: [
          { startPeriod: 0, limit: maxW },
          { startPeriod: 3600, limit: Math.round(maxW * 0.2) },
        ],
      },
      targetSocPercent > 0 ? { targetSoC: targetSocPercent } : undefined,
    );
    this.charger.evSocPercent = this.charger.evSocPercent || 0;
    return ok;
  }

  private sendSmartCostLimit(maxCostEurKwh: number): boolean {
    const maxW = this.charger.maxCurrentA * this.charger.voltageV;
    return this.sendProfile(1, 8, 2, 'TxDefaultProfile', {
      chargingRateUnit: 'W',
      chargingSchedulePeriod: [{ startPeriod: 0, limit: maxCostEurKwh <= 0 ? 0 : maxW }],
    });
  }

  /** V2H discharge — negative W limit via TxProfile (OCPP 2.1 B07) */
  sendDischargeToHome(powerW: number): boolean {
    if (!this.charger.v2xCapable) return false;
    // Fail-safe: 0/unknown SOC is unsafe, block discharge to home.
    if (!(this.charger.evSocPercent >= V2G_MIN_SOC_PERCENT)) {
      return false;
    }
    const effectivePowerW = this.charger.bptParams
      ? Math.min(powerW, this.charger.bptParams.evMaximumDischargePowerW)
      : powerW;
    const ok = this.sendProfile(1, 9, 1, 'TxProfile', {
      chargingRateUnit: 'W',
      chargingSchedulePeriod: [{ startPeriod: 0, limit: -effectivePowerW }],
    });
    this.charger.v2xActive = effectivePowerW > 0;
    this.emitChargerData();
    return ok;
  }
}
