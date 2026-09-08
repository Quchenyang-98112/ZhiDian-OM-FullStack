/**
 * EnergyAdapter — Adapter Pattern Interface for HEMS Protocols
 *
 * Every protocol adapter (Victron MQTT, Modbus SunSpec, KNX, OCPP 2.1, EEBUS)
 * implements this interface so the dashboard can aggregate data from any source.
 */

// ─── Unified Data Models ─────────────────────────────────────────────

/** Granular PV inverter reading (SunSpec Model 103/160) */
export interface PVData {
  totalPowerW: number;
  yieldTodayKWh: number;
  strings?: { id: number; powerW: number; voltageV: number; currentA: number }[] | undefined;
}

/** Battery Energy Storage System (SunSpec Model 124 / Victron) */
export interface BatteryData {
  powerW: number; // positive = charging, negative = discharging
  socPercent: number;
  voltageV: number;
  currentA: number;
  capacityWh?: number | undefined;
  temperatureC?: number | undefined;
  cycleCount?: number | undefined;
  stateOfHealthPercent?: number | undefined;
}

/** Grid meter reading (SunSpec Model 201–204) */
export interface GridData {
  powerW: number; // positive = import, negative = export
  voltageV: number;
  frequencyHz?: number | undefined;
  energyImportKWh?: number | undefined;
  energyExportKWh?: number | undefined;
  phases?: { voltageV: number; currentA: number; powerW: number }[] | undefined;
}

/** Household load breakdown */
export interface LoadData {
  totalPowerW: number;
  heatPumpPowerW: number;
  evPowerW: number;
  otherPowerW: number;
}

/**
 * ISO 15118-20 Annex D — Bidirectional Power Transfer (BPT) negotiation parameters.
 * All power values in W; all current values in A; energy values in Wh.
 * Exchanged during OCPP 2.1 RequestStartTransaction / ISO 15118-20 PowerDelivery.
 */
export interface BPTNegotiationParams {
  // ── Charge limits (mandatory) ─────────────────────────────────────
  /** Maximum charging power the EV will accept (W, positive) */
  evMaximumChargePowerW: number;
  /** Minimum charging power below which EV cannot operate (W, ≥ 0) */
  evMinimumChargePowerW: number;
  /** Maximum AC charge current the EV will accept (A, positive) */
  evMaximumChargeCurrentA: number;
  /** Minimum AC charge current the EV requires (A, ≥ 0) */
  evMinimumChargeCurrentA: number;
  // ── Discharge limits (mandatory for BPT / V2G) ───────────────────
  /** Maximum discharge power the EV can supply back to EVSE (W, positive) */
  evMaximumDischargePowerW: number;
  /** Minimum discharge power below which EV cannot operate in V2G mode (W, ≥ 0) */
  evMinimumDischargePowerW: number;
  /** Maximum discharge current the EV can supply (A, positive) */
  evMaximumDischargeCurrentA: number;
  /** Minimum discharge current the EV requires in V2G mode (A, ≥ 0) */
  evMinimumDischargeCurrentA: number;
  // ── V2X energy guardrails (optional, ISO 15118-20 §9.8) ──────────
  /** Maximum total energy the EV will export during this session (Wh) */
  evMaximumV2XEnergyRequestWh?: number | undefined;
  /** Minimum total energy the EV requires to export (Wh) */
  evMinimumV2XEnergyRequestWh?: number | undefined;
  // ── DER / §14a / VPP fields ───────────────────────────────────────
  /**
   * DER capability bitmap (ISO 15118-20 §8.3.5.3.3 / CharIN Guide 2.0)
   * Bit 0: Charge, Bit 1: Discharge, Bit 2: Reactive-Q, Bit 3: Islanding
   */
  derBitmap?: number | undefined;
  /** Target energy for the session (Wh); used by MPC optimizer as EV demand */
  targetEnergyRequestWh?: number | undefined;
}

/** AFIR Article 5 — compliant plug / connector type for V2G wallboxes */
export type EVPlugType =
  | 'IEC_62196_T2'
  | 'IEC_62196_T2_COMBO'
  | 'CHADEMO'
  | 'IEC_62196_T1'
  | 'IEC_62196_T1_COMBO';

/** EV charger state (OCPP 2.1 / IEC 61851) */
export interface EVChargerData {
  status: 'available' | 'preparing' | 'charging' | 'suspended' | 'finishing' | 'faulted';
  powerW: number;
  energySessionKWh: number;
  socPercent?: number | undefined;
  currentA?: number | undefined;
  voltageV?: number | undefined;
  maxCurrentA: number;
  vehicleConnected: boolean;
  v2xCapable: boolean;
  v2xActive: boolean;
  /** Full ISO 15118-20 Annex D BPT negotiation parameters — populated when ISO 15118-20 is active */
  bptParams?: BPTNegotiationParams | undefined;
  /** EV state-of-charge reported via ISO 15118-20 PowerDelivery (0–100) */
  evSocPercent?: number | undefined;
  /** Unix ms — when the EV driver expects the vehicle to be ready (departure time) */
  evDepartureTime?: number | undefined;
  /** Whether ISO 15118-20 protocol is active on this session (vs. basic IEC 61851) */
  iso15118Active?: boolean | undefined;
  /** AFIR-compliant plug/connector type */
  plugType?: EVPlugType | undefined;
}

/** KNX building automation state */
export interface KNXData {
  rooms: KNXRoom[];
}

export interface KNXRoom {
  id: string;
  name: string;
  temperature: number;
  setpoint?: number;
  lightsOn: boolean;
  brightness?: number;
  windowOpen: boolean;
  humidity?: number;
  co2ppm?: number;
}

/** Tariff / price signal */
export interface TariffData {
  currentPriceEurKWh: number;
  provider: 'tibber' | 'awattar' | 'entsoe' | 'none';
  sgReadyState?: 1 | 2 | 3 | 4 | undefined;
}

/** Unified energy model — aggregated from all adapters */
export interface UnifiedEnergyModel {
  timestamp: number;
  pv: PVData;
  battery: BatteryData;
  grid: GridData;
  load: LoadData;
  evCharger?: EVChargerData | undefined;
  knx?: KNXData | undefined;
  tariff?: TariffData | undefined;
}

// ─── Adapter Connection ──────────────────────────────────────────────

export type AdapterStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface AdapterConnectionConfig {
  /** Display name for logs & UI */
  name: string;
  /** Host / IP address */
  host: string;
  /** Port number */
  port: number;
  /** Enable TLS (wss:// / mqtts://) */
  tls?: boolean;
  /** mTLS client certificate (PEM base64) */
  clientCert?: string;
  /** mTLS client key (PEM base64) */
  clientKey?: string;
  /** CA certificate or CRL bundle for server/revocation verification (PEM) */
  caCert?: string;
  /** Authentication token / password */
  authToken?: string;
  /** Reconnection config */
  reconnect?: {
    enabled: boolean;
    initialDelayMs: number;
    maxDelayMs: number;
    backoffMultiplier: number;
  };
  /** Polling interval for poll-based adapters (Modbus) */
  pollIntervalMs?: number;
  /**
   * OpenEMS-only: extra writable property names per component ID.
   * Merged into the built-in allowlist for `updateComponentConfig` commands.
   */
  additionalWritableProperties?: Record<string, string[]>;
}

// ─── Adapter Commands ────────────────────────────────────────────────

export type AdapterCommandType =
  | 'SET_EV_POWER'
  | 'SET_EV_CURRENT'
  | 'SET_EV_MODE'
  | 'SET_EV_TARGET_SOC'
  | 'SET_EV_PHASES'
  | 'SET_EV_MIN_CURRENT'
  | 'SET_SMART_COST_LIMIT'
  | 'START_CHARGING'
  | 'STOP_CHARGING'
  | 'SET_V2X_DISCHARGE'
  // ── V2G / BPT (ISO 15118-20) ──────────────────────────────────────
  /** Send full ISO 15118-20 BPT negotiation parameters to the EVSE */
  | 'SET_V2G_BPT_PARAMS'
  // ── OpenADR 3.1.0 ─────────────────────────────────────────────────
  /** Acknowledge an OpenADR demand-response event (opt-in or opt-out) */
  | 'OPENADR_ACKNOWLEDGE_EVENT'
  /** Submit a telemetry report to the OpenADR VTN */
  | 'OPENADR_SUBMIT_REPORT'
  // ── VPP / Flex Market ─────────────────────────────────────────────
  /** Offer flexibility (power + duration + price) to the VPP market */
  | 'VPP_OFFER_FLEX'
  | 'SET_HEAT_PUMP_MODE'
  | 'SET_HEAT_PUMP_POWER'
  | 'SET_BATTERY_POWER'
  | 'SET_BATTERY_MODE'
  | 'SET_GRID_LIMIT'
  | 'KNX_TOGGLE_LIGHTS'
  | 'KNX_SET_TEMPERATURE'
  | 'KNX_TOGGLE_WINDOW';

export interface AdapterCommand {
  type: AdapterCommandType;
  value: number | string | boolean;
  targetDeviceId?: string;
  /** Route command to a single adapter when set (ARCH-03). Omit to broadcast to all connected adapters. */
  targetAdapterId?: string;
  /**
   * Structured payload for commands that require complex objects beyond a scalar value.
   * Used by: SET_V2G_BPT_PARAMS (BPTNegotiationParams), VPP_OFFER_FLEX (FlexOffer),
   * OPENADR_ACKNOWLEDGE_EVENT (event ID + opt decision).
   */
  payload?: Record<string, unknown> | undefined;
}

// ─── Adapter Event / Callback ────────────────────────────────────────

export type AdapterEventType = 'data' | 'status' | 'error' | 'command_ack';

export interface AdapterEvent<T = unknown> {
  adapter: string;
  type: AdapterEventType;
  payload: T;
  timestamp: number;
}

export type AdapterDataCallback = (model: Partial<UnifiedEnergyModel>) => void;
export type AdapterStatusCallback = (status: AdapterStatus, error?: string) => void;

// ─── Core Interface ──────────────────────────────────────────────────

/**
 * Every HEMS protocol adapter MUST implement this interface.
 */
export interface EnergyAdapter {
  /** Unique adapter identifier (e.g. "victron-mqtt", "modbus-sunspec") */
  readonly id: string;

  /** Human-readable name */
  readonly name: string;

  /** Current connection status */
  readonly status: AdapterStatus;

  /** Which data domains this adapter provides */
  readonly capabilities: AdapterCapability[];

  /** Connect to the data source */
  connect(): Promise<void>;

  /** Graceful disconnect */
  disconnect(): Promise<void>;

  /** Subscribe to real-time data updates */
  onData(callback: AdapterDataCallback): void;

  /** Subscribe to status changes */
  onStatus(callback: AdapterStatusCallback): void;

  /** Send a command (returns true if the adapter handles this command type) */
  sendCommand(command: AdapterCommand): Promise<boolean>;

  /** Force a one-time poll (useful for Modbus / REST adapters) */
  poll?(): Promise<Partial<UnifiedEnergyModel>>;

  /** Get the latest known snapshot (for offline fallback) */
  getSnapshot(): Partial<UnifiedEnergyModel>;

  /** Read-only connection config snapshot (settings UI hydration). */
  getConnectionConfig?(): Readonly<AdapterConnectionConfig>;

  /** Cleanup all listeners and timers */
  destroy(): void;
}

export type AdapterCapability = 'pv' | 'battery' | 'grid' | 'load' | 'evCharger' | 'knx' | 'tariff';
