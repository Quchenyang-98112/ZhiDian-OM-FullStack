/**
 * EebusProtocolAdapter — Backend IProtocolAdapter for EEBUS SPINE/SHIP
 *
 * Manages persistent SHIP data sessions to all trusted EEBUS devices and
 * converts incoming SPINE datagrams (Measurement, LoadControl, IncentiveTable)
 * to `UnifiedEnergyDatapoint` emissions on the EventBus.
 *
 * Standards:
 *   • SHIP v1.0.1  — EEBus Initiative e.V. (transport + session layer)
 *   • SPINE v1.3.0 — EEBus Initiative e.V. (application layer)
 *   • VDE-AR-E 2829-6 — EEBUS communication framework for HEMS
 *   • §14a EnWG — Controllable power consumer requirements (LPC/LPP)
 *
 * Supported Use Cases (mapped to EnergyRole):
 *   • MPC  — Monitoring of Power Consumption     → role:'load'
 *   • MGCP — Monitoring of Grid Connection Point → role:'grid'
 *   • LPC  — Limitation of Power Consumption     → role:'load' (load-control limit)
 *   • LPP  — Limitation of Power Production      → role:'pv'
 *   • EVCC — EV Charging via SPINE LoadControl   → role:'ev'
 *   • HP   — Heat Pump monitoring/control        → role:'heatpump'
 *
 * Data flow:
 *   EEBus Device (mTLS) ──SHIP WS──▶ EebusDataSession ──SPINE parse──▶ EventBus
 *                                                                           ▼
 *                                                              LiveEnergyAggregator → Dashboard
 */

import { spawnSync } from 'node:child_process';
import { generateKeyPairSync, X509Certificate } from 'node:crypto';
import EventEmitter from 'node:events';
import { appendFileSync, mkdirSync } from 'node:fs';
import { mkdir, readFile } from 'node:fs/promises';
import https from 'node:https';
import { dirname, resolve } from 'node:path';
import {
  type AdapterHealth,
  type EnergyRole,
  energyDatapointSchema,
  type IProtocolAdapter,
  type MetricType,
  type ProtocolType,
  type UnifiedEnergyDatapoint,
} from '@nexus-hems/shared-types';
import { WebSocket } from 'ws';
import {
  recordAdapterDlq,
  recordAdapterError,
  recordAdapterReconnect,
} from '../../middleware/adapter-metrics.js';
import { API_RUNTIME_DIR, DEAD_LETTER_QUEUE_PATH } from '../../runtime-paths.js';
import {
  type EEBUSDeviceEntry,
  listDevices,
  updateDeviceStatus,
} from '../../services/EEBusTrustStore.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_RECONNECT_DELAY_MS = 120_000;
const MAX_DLQ_LINES = 10_000;
const HEARTBEAT_INTERVAL_MS = 30_000;
const SHIP_HELLO_TIMEOUT_MS = 30_000;

/** EEBUS SHIP default port (IANA registered) */
const SHIP_PORT = 4712;

const CERT_FILE = resolve(
  process.cwd(),
  process.env.EEBUS_CERT_FILE ?? 'data/eebus-server.cert.pem',
);
const KEY_FILE = resolve(process.cwd(), process.env.EEBUS_KEY_FILE ?? 'data/eebus-server.key.pem');
const CA_FILE = process.env.EEBUS_CA_FILE
  ? resolve(process.cwd(), process.env.EEBUS_CA_FILE)
  : null;

let dlqLineCount = 0;
let _cachedCert: { cert: string; key: string } | null = null;

// ---------------------------------------------------------------------------
// SPINE Message Types (VDE-AR-E 2829-6 §7)
// ---------------------------------------------------------------------------

interface SPINEHeader {
  protocolId?: 'ee1.0';
  msgCounter?: number;
  cmdClassifier: 'read' | 'reply' | 'write' | 'notify' | 'call' | 'result';
  featureSource?: { entity: number; feature: number };
  featureDestination?: { entity: number; feature: number };
  ackRequest?: boolean;
}

interface SPINEMeasurementEntry {
  measurementId?: number;
  value?: number;
  unit?: string;
  scopeType?: string;
  valueType?: string;
  timestamp?: string;
}

interface SPINELoadControlLimit {
  limitId?: number;
  limitType?: string;
  unit?: string;
  value?: number;
  isActive?: boolean;
}

interface SPINEElectricalConnection {
  connectionId?: number;
  powerW?: number;
  currentA?: number;
  voltageV?: number;
  frequencyHz?: number;
  phase?: string;
}

interface SPINECmd {
  measurementListData?: { measurementData?: SPINEMeasurementEntry[] };
  loadControlLimitListData?: { loadControlLimitData?: SPINELoadControlLimit[] };
  electricalConnectionParameterDescriptionListData?: { data?: SPINEElectricalConnection[] };
  deviceDiagnosisStateData?: { operatingState?: string; heartbeatGracePeriod?: number };
  resultData?: { errorNumber?: number; description?: string; replyMsgCounter?: number };
  subscribeResultData?: unknown;
  notifyResultData?: unknown;
}

interface SPINEDatagram {
  header: SPINEHeader;
  payload: { cmd: SPINECmd[] };
}

/**
 * Maps SPINE scopeType to EnergyRole and MetricType for EventBus emission.
 * Reference: VDE-AR-E 2829-6 §7.4 Measurement Use Cases.
 */
const SCOPE_ROLE_MAP: Record<string, { role: EnergyRole; metric: MetricType } | undefined> = {
  // MPC: Monitoring of Power Consumption (total house load)
  ACPowerTotal: { role: 'load', metric: 'POWER_W' },
  ACPowerPhaseA: { role: 'load', metric: 'POWER_W' },
  ACPowerPhaseB: { role: 'load', metric: 'POWER_W' },
  ACPowerPhaseC: { role: 'load', metric: 'POWER_W' },
  // MGCP: Monitoring of Grid Connection Point
  GridFeedIn: { role: 'grid', metric: 'POWER_W' },
  GridFeedInPhaseA: { role: 'grid', metric: 'POWER_W' },
  // PV production (LPP)
  SelfConsumption: { role: 'pv', metric: 'POWER_W' },
  // Battery
  BatteryChargingPower: { role: 'battery', metric: 'POWER_W' },
  StateOfCharge: { role: 'battery', metric: 'SOC_PERCENT' },
  BatteryTemperature: { role: 'battery', metric: 'TEMPERATURE_C' },
  // EV Charging (EVCC)
  ChargingPower: { role: 'ev', metric: 'POWER_W' },
  EVStateOfCharge: { role: 'ev', metric: 'SOC_PERCENT' },
  // Heat pump (HP)
  HeatPumpPower: { role: 'heatpump', metric: 'POWER_W' },
  // AC measurements (mapped from device entity context)
  ACCurrent: { role: 'load', metric: 'CURRENT_A' },
  ACVoltage: { role: 'load', metric: 'VOLTAGE_V' },
  ACFrequency: { role: 'grid', metric: 'FREQUENCY_HZ' },
};

// ---------------------------------------------------------------------------
// TLS Certificate Loading
// ---------------------------------------------------------------------------

async function loadOrGenerateCert(): Promise<{ cert: string; key: string }> {
  if (_cachedCert) return _cachedCert;
  try {
    const cert = await readFile(CERT_FILE, 'utf-8');
    const key = await readFile(KEY_FILE, 'utf-8');
    _cachedCert = { cert, key };
    return _cachedCert;
  } catch {
    console.info('[EebusAdapter] Generating ECDSA P-256 certificate for SHIP...');
    const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    const keyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string;
    try {
      await mkdir(dirname(CERT_FILE), { recursive: true });
      const result = spawnSync(
        'openssl',
        [
          'req',
          '-x509',
          '-newkey',
          'ec',
          '-pkeyopt',
          'ec_paramgen_curve:prime256v1',
          '-keyout',
          KEY_FILE,
          '-out',
          CERT_FILE,
          '-days',
          '3650',
          '-nodes',
          '-subj',
          '/CN=nexus-hems-eebus/O=Nexus HEMS',
        ],
        { stdio: 'pipe', shell: false, encoding: 'utf-8' },
      );
      if (result.error ?? result.status !== 0)
        throw new Error(result.stderr?.trim() ?? 'openssl failed');
      const cert = await readFile(CERT_FILE, 'utf-8');
      const key = await readFile(KEY_FILE, 'utf-8');
      _cachedCert = { cert, key };
      return _cachedCert;
    } catch {
      console.warn('[EebusAdapter] openssl unavailable — operating without mTLS cert (dev mode).');
      _cachedCert = { cert: '', key: keyPem };
      return _cachedCert;
    }
  }
}

async function loadCaBundle(): Promise<string | undefined> {
  if (!CA_FILE) return undefined;
  try {
    return await readFile(CA_FILE, 'utf-8');
  } catch {
    return undefined;
  }
}

function extractSKI(rawDerCert: Buffer): string {
  try {
    const cert = new X509Certificate(rawDerCert);
    const ski = (cert as unknown as Record<string, unknown>).subjectKeyIdentifier;
    if (typeof ski === 'string' && ski.length > 0) return ski.replace(/:/g, '').toLowerCase();
    return cert.fingerprint256.replace(/:/g, '').toLowerCase();
  } catch {
    return '';
  }
}

// ---------------------------------------------------------------------------
// Dead-Letter Queue
// ---------------------------------------------------------------------------

interface DLQEntry {
  ts: number;
  source: string;
  rawPayload: string;
  error: string;
  protocol: string;
}

function writeToDLQ(entry: DLQEntry): void {
  if (dlqLineCount >= MAX_DLQ_LINES) dlqLineCount = 0;
  try {
    mkdirSync(API_RUNTIME_DIR, { recursive: true });
    appendFileSync(DEAD_LETTER_QUEUE_PATH, `${JSON.stringify(entry)}\n`, 'utf8');
    dlqLineCount++;
  } catch {
    // DLQ errors must never propagate
  }
}

// ---------------------------------------------------------------------------
// EebusDataSession — one persistent SHIP/SPINE session per trusted device
// ---------------------------------------------------------------------------

/**
 * Manages a single long-lived SHIP WebSocket session to a trusted EEBUS device.
 * After the SHIP hello exchange confirms the device is already trusted (no PIN
 * required), this session stays open to receive continuous SPINE notifications.
 */
class EebusDataSession {
  readonly ski: string;
  private readonly device: EEBUSDeviceEntry;
  private readonly emitter: EventEmitter;
  private readonly adapterId: string;

  private ws: WebSocket | null = null;
  private destroyed = false;
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private msgCounter = 0;
  private connected = false;

  constructor(device: EEBUSDeviceEntry, emitter: EventEmitter, adapterId: string) {
    this.ski = device.ski;
    this.device = device;
    this.emitter = emitter;
    this.adapterId = adapterId;
  }

  async start(): Promise<void> {
    await this.connect();
  }

  destroy(): void {
    this.destroyed = true;
    this.clearTimers();
    if (this.ws) {
      this.ws.removeAllListeners();
      if (this.ws.readyState < WebSocket.CLOSING) this.ws.close(1000, 'Adapter destroyed');
      this.ws = null;
    }
    this.connected = false;
  }

  isConnected(): boolean {
    return this.connected;
  }

  /**
   * Send a SPINE LoadControl write to limit device power (§14a EnWG / LPC).
   * Returns true if the message was sent successfully.
   */
  sendLoadControlLimit(
    limitId: number,
    unit: 'W' | 'A',
    value: number,
    isActive: boolean,
  ): boolean {
    return this.sendSPINE({
      header: {
        protocolId: 'ee1.0',
        msgCounter: ++this.msgCounter,
        cmdClassifier: 'write',
        featureSource: { entity: 1, feature: 1 },
        featureDestination: { entity: 2, feature: 4 },
        ackRequest: true,
      },
      payload: {
        cmd: [
          {
            loadControlLimitListData: {
              loadControlLimitData: [
                {
                  limitId,
                  limitType: 'maxValueLimit',
                  unit,
                  value,
                  isActive,
                },
              ],
            },
          },
        ],
      },
    });
  }

  // ── Private ──────────────────────────────────────────────────────────────

  private async connect(): Promise<void> {
    if (this.destroyed) return;

    let serverCert = '';
    let serverKey = '';
    let caBundle: string | undefined;
    try {
      const certs = await loadOrGenerateCert();
      serverCert = certs.cert;
      serverKey = certs.key;
      caBundle = await loadCaBundle();
    } catch (err) {
      console.error(`[EebusAdapter:${this.adapterId}] Failed to load TLS material:`, err);
      this.scheduleReconnect();
      return;
    }

    const { ski, hostname, port } = this.device;
    const url = `wss://${hostname}:${port ?? SHIP_PORT}/ship/`;

    type PeerCert = { raw?: Buffer; fingerprint256?: string };
    const tlsAgent = serverCert
      ? new https.Agent({
          cert: serverCert,
          key: serverKey,
          ...(caBundle ? { ca: caBundle } : {}),
          rejectUnauthorized: true,
          minVersion: 'TLSv1.3',
          maxVersion: 'TLSv1.3',
          checkServerIdentity: (_host: string, peerCert: PeerCert) => {
            const peerSKI = peerCert.raw
              ? extractSKI(peerCert.raw)
              : (peerCert.fingerprint256?.replace(/:/g, '').toLowerCase() ?? '');
            if (peerSKI && peerSKI !== ski) {
              return new Error(`SKI mismatch: expected ${ski}, got ${peerSKI}`);
            }
            return undefined;
          },
        } as unknown as https.AgentOptions)
      : undefined;

    let ws: WebSocket;
    try {
      ws = new WebSocket(url, ['ship'], { agent: tlsAgent } as ConstructorParameters<
        typeof WebSocket
      >[2]);
    } catch (err) {
      console.error(`[EebusAdapter:${this.adapterId}] WS creation failed for ${ski}:`, err);
      this.scheduleReconnect();
      return;
    }

    this.ws = ws;
    const helloTimeout = setTimeout(() => {
      if (!this.connected) {
        ws.terminate();
        this.scheduleReconnect();
      }
    }, SHIP_HELLO_TIMEOUT_MS);

    ws.once('open', () => {
      // SHIP ConnectionHello — device is already in our trust store so no PIN required
      ws.send(JSON.stringify({ connectionHello: [{ phase: 'ready', waiting: false }] }));
    });

    ws.on('message', (data: Buffer | string) => {
      const raw = typeof data === 'string' ? data : data.toString('utf-8');
      this.handleShipMessage(raw, ws, helloTimeout);
    });

    ws.once('error', (err: Error) => {
      clearTimeout(helloTimeout);
      if (!this.connected) {
        console.warn(`[EebusAdapter:${this.adapterId}] WS error for ${ski}: ${err.message}`);
        this.scheduleReconnect();
      }
    });

    ws.once('close', () => {
      clearTimeout(helloTimeout);
      const wasConnected = this.connected;
      this.connected = false;
      this.clearHeartbeat();
      if (!this.destroyed) {
        if (wasConnected) {
          recordAdapterReconnect(this.adapterId, 'eebus');
          void updateDeviceStatus(ski, 'trusted').catch(() => undefined);
        }
        this.scheduleReconnect();
      }
    });
  }

  private handleShipMessage(
    raw: string,
    ws: WebSocket,
    helloTimeout: ReturnType<typeof setTimeout>,
  ): void {
    let msg: unknown;
    try {
      msg = JSON.parse(raw);
    } catch {
      // Binary SHIP framing — not yet supported; log to DLQ
      writeToDLQ({
        ts: Date.now(),
        source: this.ski,
        rawPayload: raw.slice(0, 256),
        error: 'JSON parse error',
        protocol: 'eebus',
      });
      return;
    }

    const obj = msg as Record<string, unknown>;

    // SHIP Hello response → proceed to SPINE session
    if (!this.connected && (obj.connectionHello !== undefined || raw.includes('connectionHello'))) {
      clearTimeout(helloTimeout);
      this.connected = true;
      this.reconnectAttempt = 0;
      void updateDeviceStatus(this.ski, 'trusted', Date.now()).catch(() => undefined);
      this.emitter.emit('connected', this.ski);
      console.log(`[EebusAdapter:${this.adapterId}] SPINE session established with ${this.ski}`);

      // Subscribe to measurements + load control notifications
      this.sendSPINESubscriptions();
      // Request initial snapshot
      this.requestInitialData();
      this.startHeartbeat(ws);
      return;
    }

    // SPINE datagram
    if (obj.datagram !== undefined) {
      this.handleSPINEDatagram(obj.datagram as SPINEDatagram);
      return;
    }

    // Pong
    if (raw === '{"type":"pong"}' || raw.includes('"type":"pong"')) return;

    // Connection pin state → device requires re-pairing, abort
    if (raw.includes('connectionPinState') || raw.includes('pinState')) {
      console.warn(
        `[EebusAdapter:${this.adapterId}] Device ${this.ski} requires re-pairing (PIN).`,
      );
      void updateDeviceStatus(this.ski, 'pending').catch(() => undefined);
      ws.close(1000, 'PIN required — device needs re-pairing');
    }
  }

  /**
   * Parse a SPINE datagram and emit qualifying measurements to the EventBus.
   * Reference: SPINE v1.3.0 §7 — CmdClassifier 'notify' or 'reply' with measurementListData.
   */
  private handleSPINEDatagram(datagram: SPINEDatagram): void {
    const { header, payload } = datagram;

    for (const cmd of payload.cmd ?? []) {
      // ── Measurement data (MPC / MGCP / EVCC / HP) ────────────────────────
      if (cmd.measurementListData?.measurementData) {
        for (const m of cmd.measurementListData.measurementData) {
          this.emitMeasurement(m);
        }
      }

      // ── LoadControl limit updates (LPC / LPP — limit has changed) ─────────
      if (cmd.loadControlLimitListData?.loadControlLimitData) {
        for (const limit of cmd.loadControlLimitListData.loadControlLimitData) {
          this.emitLoadControlLimit(limit);
        }
      }

      // ── Device heartbeat acknowledgement ────────────────────────────────
      if (cmd.deviceDiagnosisStateData) {
        this.emitter.emit('heartbeatAck', this.ski);
      }
    }

    // Send ACK if requested (SPINE §5.2)
    if (header.ackRequest) {
      this.sendSPINEAck(header.msgCounter ?? 0);
    }
  }

  private emitMeasurement(m: SPINEMeasurementEntry): void {
    if (m.value === undefined || !Number.isFinite(m.value)) return;

    const scope = m.scopeType ?? '';
    const mapping = SCOPE_ROLE_MAP[scope];
    if (!mapping) {
      // Unknown scope — not an error, just not mapped to a role
      return;
    }

    // Apply unit conversion for non-standard SPINE units
    let value = m.value;
    if (m.unit === 'kW') value *= 1000; // SPINE may use kW for some devices
    if (m.unit === 'kWh') value *= 1000;

    const candidate: UnifiedEnergyDatapoint = {
      timestamp: m.timestamp ? new Date(m.timestamp).getTime() : Date.now(),
      deviceId: `eebus-${this.ski.slice(0, 8)}`,
      protocol: 'eebus',
      metric: mapping.metric,
      value,
      qualityIndicator: 'GOOD',
      role: mapping.role,
    };

    const result = energyDatapointSchema.safeParse(candidate);
    if (result.success) {
      this.emitter.emit('data', result.data);
    } else {
      writeToDLQ({
        ts: Date.now(),
        source: `eebus-${this.ski}:measurement`,
        rawPayload: JSON.stringify(candidate),
        error: result.error.message,
        protocol: 'eebus',
      });
      recordAdapterDlq(this.adapterId, 'eebus');
    }
  }

  /**
   * Emit a LoadControl limit as a power measurement datapoint.
   * Active limits constrain the device's operating range (§14a EnWG / LPC).
   */
  private emitLoadControlLimit(limit: SPINELoadControlLimit): void {
    if (!limit.isActive || limit.value === undefined) return;

    // Convert current limit (A) to approximate power (W) assuming 230V single-phase
    const powerW = limit.unit === 'A' ? limit.value * 230 : limit.value;

    // Tag as the relevant role based on limitId convention:
    //   1–9: EV charger, 10–19: heat pump, 100+: grid connection point
    const limitId = limit.limitId ?? 0;
    let role: EnergyRole = 'load';
    if (limitId >= 1 && limitId <= 9) role = 'ev';
    else if (limitId >= 10 && limitId <= 19) role = 'heatpump';
    else if (limitId >= 100) role = 'grid';

    const candidate: UnifiedEnergyDatapoint = {
      timestamp: Date.now(),
      deviceId: `eebus-${this.ski.slice(0, 8)}-limit`,
      protocol: 'eebus',
      metric: 'POWER_W',
      value: powerW,
      qualityIndicator: 'GOOD',
      role,
    };

    const result = energyDatapointSchema.safeParse(candidate);
    if (result.success) {
      this.emitter.emit('data', result.data);
    }
  }

  private sendSPINESubscriptions(): void {
    // Subscribe to measurement notifications (SPINE §7.2 — Subscribe cmd)
    const features: Array<{ entityDest: number; featureDest: number; desc: string }> = [
      { entityDest: 2, featureDest: 2, desc: 'Measurement' },
      { entityDest: 2, featureDest: 4, desc: 'LoadControl' },
      { entityDest: 2, featureDest: 6, desc: 'IncentiveTable' },
      { entityDest: 2, featureDest: 7, desc: 'DeviceDiagnosis' },
    ];

    for (const f of features) {
      this.sendSPINE({
        header: {
          protocolId: 'ee1.0',
          msgCounter: ++this.msgCounter,
          cmdClassifier: 'call',
          featureSource: { entity: 1, feature: 1 },
          featureDestination: { entity: f.entityDest, feature: f.featureDest },
        },
        payload: {
          cmd: [{ subscribeResultData: {} }],
        },
      });
    }
  }

  private requestInitialData(): void {
    // Read measurementListData
    this.sendSPINE({
      header: {
        protocolId: 'ee1.0',
        msgCounter: ++this.msgCounter,
        cmdClassifier: 'read',
        featureSource: { entity: 1, feature: 1 },
        featureDestination: { entity: 2, feature: 2 },
      },
      payload: { cmd: [{ measurementListData: {} }] },
    });

    // Read loadControlLimitListData
    this.sendSPINE({
      header: {
        protocolId: 'ee1.0',
        msgCounter: ++this.msgCounter,
        cmdClassifier: 'read',
        featureSource: { entity: 1, feature: 1 },
        featureDestination: { entity: 2, feature: 4 },
      },
      payload: { cmd: [{ loadControlLimitListData: {} }] },
    });
  }

  private sendSPINEAck(replyTo: number): void {
    this.sendSPINE({
      header: {
        protocolId: 'ee1.0',
        msgCounter: ++this.msgCounter,
        cmdClassifier: 'result',
        featureSource: { entity: 1, feature: 0 },
        featureDestination: { entity: 0, feature: 0 },
      },
      payload: {
        cmd: [{ resultData: { errorNumber: 0, description: 'ok', replyMsgCounter: replyTo } }],
      },
    });
  }

  private sendSPINE(datagram: SPINEDatagram): boolean {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return false;
    try {
      this.ws.send(JSON.stringify({ datagram }));
      return true;
    } catch {
      return false;
    }
  }

  private startHeartbeat(ws: WebSocket): void {
    this.clearHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'ping' }));
      }
    }, HEARTBEAT_INTERVAL_MS);
    if (typeof this.heartbeatTimer === 'object' && 'unref' in this.heartbeatTimer) {
      (this.heartbeatTimer as NodeJS.Timeout).unref();
    }
  }

  private clearHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private scheduleReconnect(): void {
    if (this.destroyed || this.reconnectTimer !== null) return;
    this.reconnectAttempt++;
    const delayMs = Math.min(1000 * 2 ** (this.reconnectAttempt - 1), MAX_RECONNECT_DELAY_MS);
    console.info(
      `[EebusAdapter:${this.adapterId}] Reconnecting to ${this.ski} in ${delayMs}ms (attempt ${this.reconnectAttempt})`,
    );
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect().catch((err: unknown) => {
        console.error(`[EebusAdapter:${this.adapterId}] Reconnect error for ${this.ski}:`, err);
        if (!this.destroyed) this.scheduleReconnect();
      });
    }, delayMs);
    if (typeof this.reconnectTimer === 'object' && 'unref' in this.reconnectTimer) {
      (this.reconnectTimer as NodeJS.Timeout).unref();
    }
  }

  private clearTimers(): void {
    this.clearHeartbeat();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
}

// ---------------------------------------------------------------------------
// EebusProtocolAdapter — IProtocolAdapter implementation
// ---------------------------------------------------------------------------

export interface EebusAdapterConfig {
  /** Unique adapter ID */
  id?: string;
  /**
   * Polling interval for trust-store refresh (ms).
   * New devices added to the trust store while the adapter is running will
   * be connected automatically at the next poll cycle.
   * Default: 60 000 ms.
   */
  trustStorePollIntervalMs?: number;
}

/**
 * Backend EEBUS protocol adapter.
 *
 * Reads trusted devices from `EEBusTrustStore` on startup (and periodically
 * polls for newly paired devices), then establishes persistent SHIP/SPINE data
 * sessions to each one, forwarding measurement datapoints to the EventBus.
 *
 * Environment variables (all optional):
 *   EEBUS_CERT_FILE  — Path to server TLS cert PEM (default: data/eebus-server.cert.pem)
 *   EEBUS_KEY_FILE   — Path to server TLS key PEM  (default: data/eebus-server.key.pem)
 *   EEBUS_CA_FILE    — Path to CA bundle PEM for mTLS peer verification
 *   EEBUS_TRUST_FILE — Path to trust store JSON     (default: data/eebus-trust.json)
 *   EEBUS_TRUST_BACKEND — 'file' (default) or 'redis'
 */
export class EebusProtocolAdapter implements IProtocolAdapter {
  readonly id: string;
  readonly protocol: ProtocolType = 'eebus';

  private readonly config: Required<EebusAdapterConfig>;
  private readonly emitter = new EventEmitter();
  private readonly sessions = new Map<string, EebusDataSession>();

  private destroyed = false;
  private lastSuccessMs: number | undefined;
  private consecutiveErrors = 0;
  private trustStorePollTimer: ReturnType<typeof setInterval> | null = null;

  constructor(config: EebusAdapterConfig = {}) {
    this.id = config.id ?? 'eebus-spine-01';
    this.config = {
      id: this.id,
      trustStorePollIntervalMs: config.trustStorePollIntervalMs ?? 60_000,
    };
    // Track freshness metrics from sessions
    this.emitter.on('data', (_dp: UnifiedEnergyDatapoint) => {
      this.lastSuccessMs = Date.now();
      this.consecutiveErrors = 0;
    });
  }

  // ---------------------------------------------------------------------------
  // IProtocolAdapter implementation
  // ---------------------------------------------------------------------------

  async connect(): Promise<void> {
    if (this.destroyed) throw new Error('Adapter has been destroyed');

    const trustedDevices = await listDevices();
    const trusted = trustedDevices.filter((d) => d.status === 'trusted');

    if (trusted.length === 0) {
      console.info(
        `[EebusAdapter:${this.id}] No trusted devices in trust store — waiting for pairing.`,
      );
    }

    for (const device of trusted) {
      this.startSession(device);
    }

    this.startTrustStorePoll();
  }

  async disconnect(): Promise<void> {
    this.destroyed = true;
    this.stopTrustStorePoll();
    for (const session of this.sessions.values()) {
      session.destroy();
    }
    this.sessions.clear();
    this.emitter.emit('destroy');
    this.emitter.removeAllListeners();
  }

  async healthCheck(): Promise<AdapterHealth> {
    const sessionCount = this.sessions.size;
    const connectedCount = Array.from(this.sessions.values()).filter((s) => s.isConnected()).length;

    if (sessionCount === 0) {
      return {
        status: 'offline',
        errorMessage: 'No trusted EEBUS devices in trust store',
        consecutiveErrors: 0,
      };
    }

    if (connectedCount === 0) {
      return {
        status: 'offline',
        lastSuccessMs: this.lastSuccessMs,
        errorMessage: `0/${sessionCount} sessions connected`,
        consecutiveErrors: this.consecutiveErrors,
      };
    }

    return {
      status:
        this.consecutiveErrors > 0
          ? 'degraded'
          : connectedCount < sessionCount
            ? 'degraded'
            : 'healthy',
      lastSuccessMs: this.lastSuccessMs,
      consecutiveErrors: this.consecutiveErrors,
    };
  }

  /**
   * Async generator that yields `UnifiedEnergyDatapoint` from all active SPINE sessions.
   * The generator runs until `disconnect()` is called (which emits 'destroy').
   */
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
          await new Promise<void>((r) => {
            notify = r;
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

  // ---------------------------------------------------------------------------
  // Session Management
  // ---------------------------------------------------------------------------

  private startSession(device: EEBUSDeviceEntry): void {
    if (this.sessions.has(device.ski)) return;
    const session = new EebusDataSession(device, this.emitter, this.id);
    this.sessions.set(device.ski, session);

    session.start().catch((err: unknown) => {
      recordAdapterError(this.id, 'eebus', 'connect');
      console.error(`[EebusAdapter:${this.id}] Session start error for ${device.ski}:`, err);
    });
  }

  /**
   * Periodically refresh the trust store to pick up newly paired devices.
   * Devices that were deleted from the trust store between polls are left
   * connected until their WS closes naturally (avoid forceful disconnect races).
   */
  private startTrustStorePoll(): void {
    this.trustStorePollTimer = setInterval(() => {
      listDevices()
        .then((devices) => {
          for (const device of devices) {
            if (device.status === 'trusted' && !this.sessions.has(device.ski)) {
              console.info(
                `[EebusAdapter:${this.id}] New trusted device detected: ${device.ski} — starting session.`,
              );
              this.startSession(device);
            }
          }
        })
        .catch((err: unknown) => {
          console.warn(`[EebusAdapter:${this.id}] Trust store poll error:`, err);
        });
    }, this.config.trustStorePollIntervalMs);

    if (
      this.trustStorePollTimer !== null &&
      typeof this.trustStorePollTimer === 'object' &&
      'unref' in this.trustStorePollTimer
    ) {
      (this.trustStorePollTimer as NodeJS.Timeout).unref();
    }
  }

  private stopTrustStorePoll(): void {
    if (this.trustStorePollTimer !== null) {
      clearInterval(this.trustStorePollTimer);
      this.trustStorePollTimer = null;
    }
  }
}
