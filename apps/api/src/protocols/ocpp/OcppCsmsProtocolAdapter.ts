/**
 * OcppCsmsProtocolAdapter — Backend OCPP 2.1 CSMS WebSocket gateway.
 *
 * Listens for charge-point (EVSE) WebSocket connections and responds as a
 * minimal Central System (BootNotification, Heartbeat, Authorize). Maps
 * MeterValues / TransactionEvent telemetry to role-tagged UnifiedEnergyDatapoint
 * values for the EventBus.
 *
 * Env (live mode only):
 *   OCPP_CSMS_PORT=9000          — enables gateway when set (default path /ocpp)
 *   OCPP_CSMS_HOST=0.0.0.0       — bind address (default 0.0.0.0)
 *   OCPP_CSMS_PATH=/ocpp         — WebSocket HTTP upgrade path
 *
 * Security: SP0 (plain WS) only in this pass; SP3 mTLS tracked as HIGH-12.
 */

import EventEmitter from 'node:events';
import { appendFileSync, mkdirSync } from 'node:fs';
import type { WSCommandType } from '@nexus-hems/shared-types';
import {
  type AdapterHealth,
  energyDatapointSchema,
  type IProtocolAdapter,
  type MetricType,
  type ProtocolType,
  type UnifiedEnergyDatapoint,
} from '@nexus-hems/shared-types';
import { WebSocket, WebSocketServer } from 'ws';
import { z } from 'zod';
import { recordAdapterDlq, recordAdapterError } from '../../middleware/adapter-metrics.js';
import { API_RUNTIME_DIR, DEAD_LETTER_QUEUE_PATH } from '../../runtime-paths.js';
import type {
  IProtocolCommandHandler,
  ProtocolCommandRequest,
  ProtocolCommandResult,
} from '../protocol-command.js';
import {
  EvCurrentValueSchema,
  EvDischargeValueSchema,
  EvPowerValueSchema,
  OcppGridLimitWattsSchema,
  SET_EV_CURRENT_ERROR,
  SET_EV_POWER_ERROR,
} from '../protocol-command.js';

/** SOC guardrail — blocks V2G discharge below this threshold (ISO 15118-20 §9.8). */
const V2G_MIN_SOC_PERCENT = 15;
/** Default mains voltage when no Voltage meter value is available (EU single-phase). */
const DEFAULT_MAINS_VOLTAGE_V = 230;
/** Plausible EVSE mains voltage range (single/three-phase). */
const MIN_MAINS_VOLTAGE_V = 100;
const MAX_MAINS_VOLTAGE_V = 500;
/** Valid SoC percent range from MeterValues telemetry. */
const MAX_SOC_PERCENT = 100;

const OCPP_CALL = 2;
const OCPP_CALLRESULT = 3;
const OCPP_CALLERROR = 4;

const HEARTBEAT_INTERVAL_S = 300;
const OUTBOUND_TIMEOUT_MS = 10_000;
const MAX_DLQ_LINES = 10_000;
let dlqLineCount = 0;

interface OutboundPending {
  resolve: (success: boolean) => void;
  timer: ReturnType<typeof setTimeout>;
}

type OcppInboundMessage =
  | [typeof OCPP_CALL, string, string, Record<string, unknown>]
  | [typeof OCPP_CALLRESULT, string, Record<string, unknown>?]
  | [typeof OCPP_CALLERROR, string, string, string, Record<string, unknown>?];

const OcppCallResultSchema = z.tuple([
  z.literal(OCPP_CALLRESULT),
  z.string(),
  z.record(z.string(), z.unknown()).optional(),
]);

const OcppCallErrorSchema = z.tuple([
  z.literal(OCPP_CALLERROR),
  z.string(),
  z.string(),
  z.string(),
  z.record(z.string(), z.unknown()).optional(),
]);

const OcppCallSchema = z.tuple([
  z.literal(OCPP_CALL),
  z.string(),
  z.string(),
  z.record(z.string(), z.unknown()),
]);

const OcppInboundMessageSchema = z.union([
  OcppCallResultSchema,
  OcppCallErrorSchema,
  OcppCallSchema,
]);

const CallResultPayloadSchema = z
  .object({
    status: z.string().optional(),
  })
  .passthrough();

const TransactionInfoSchema = z.object({
  transactionId: z.string().min(1).optional(),
});

const OcppSampledValueSchema = z.object({
  value: z.union([z.number(), z.string()]),
  measurand: z.string().optional(),
  unit: z.string().optional(),
});

const OcppMeterValueEntrySchema = z.object({
  sampledValue: z.array(OcppSampledValueSchema),
});

const OcppMeterValueSchema = z.array(OcppMeterValueEntrySchema);

const ChargingStationSchema = z.object({
  serialNumber: z.string().min(1).optional(),
});

interface ChargePointSession {
  chargePointId: string;
  lastPowerW: number;
  lastEnergyKWh: number;
  lastSocPercent: number | undefined;
  lastVoltageV: number;
  lastSeenMs: number;
  transactionId: string | undefined;
}

export interface OcppCsmsProtocolAdapterConfig {
  id: string;
  host?: string;
  port: number;
  path?: string;
}

interface DLQEntry {
  ts: number;
  source: string;
  rawPayload: string;
  error: string;
  protocol: ProtocolType;
}

const OCPP_EV_COMMANDS = new Set<WSCommandType>([
  'SET_EV_POWER',
  'SET_EV_CURRENT',
  'START_CHARGING',
  'STOP_CHARGING',
  'SET_V2X_DISCHARGE',
  'SET_GRID_LIMIT',
]);

export class OcppCsmsProtocolAdapter implements IProtocolAdapter, IProtocolCommandHandler {
  readonly id: string;
  readonly protocol: ProtocolType = 'ocpp';

  private readonly config: Required<Pick<OcppCsmsProtocolAdapterConfig, 'host' | 'path'>> &
    OcppCsmsProtocolAdapterConfig;
  private wss: WebSocketServer | null = null;
  private listening = false;
  private lastSuccessMs: number | undefined;
  private consecutiveErrors = 0;
  private readonly sessions = new Map<WebSocket, ChargePointSession>();
  private readonly emitter = new EventEmitter();
  private readonly outboundPending = new Map<string, OutboundPending>();
  private outboundMessageId = 0;

  constructor(config: OcppCsmsProtocolAdapterConfig) {
    this.config = {
      ...config,
      host: config.host ?? '0.0.0.0',
      path: config.path ?? '/ocpp',
    };
    this.id = config.id;
  }

  /** Exposed for tests — actual bound port when `port: 0` was requested. */
  getBoundPort(): number | undefined {
    if (!this.wss) return undefined;
    const addr = this.wss.address();
    return addr && typeof addr === 'object' ? addr.port : undefined;
  }

  async connect(): Promise<void> {
    if (this.listening) return;

    await new Promise<void>((resolve, reject) => {
      const wss = new WebSocketServer({ host: this.config.host, port: this.config.port }, () => {
        this.listening = true;
        this.consecutiveErrors = 0;
        resolve();
      });

      wss.on('error', (err) => {
        if (!this.listening) reject(err);
      });

      wss.on('connection', (ws, req) => {
        const pathParts = (req.url ?? '/').split('/').filter(Boolean);
        const chargePointId = pathParts.at(-1) ?? 'unknown-cp';
        this.sessions.set(ws, {
          chargePointId,
          lastPowerW: 0,
          lastEnergyKWh: 0,
          lastSocPercent: undefined,
          lastVoltageV: DEFAULT_MAINS_VOLTAGE_V,
          lastSeenMs: Date.now(),
          transactionId: undefined,
        });

        ws.on('message', (data) => {
          try {
            const raw =
              typeof data === 'string' ? data : Buffer.from(data as Buffer).toString('utf8');
            const json: unknown = JSON.parse(raw);
            const parsed = OcppInboundMessageSchema.safeParse(json);
            if (!parsed.success) {
              recordAdapterError(this.id, this.protocol, 'parse');
              writeToDLQ({
                ts: Date.now(),
                source: 'ocpp-csms-ws',
                rawPayload: raw.slice(0, 512),
                error: 'Invalid OCPP message shape',
                protocol: this.protocol,
              });
              recordAdapterDlq(this.id, this.protocol);
              return;
            }
            this.handleMessage(ws, parsed.data as OcppInboundMessage);
          } catch (err) {
            recordAdapterError(this.id, this.protocol, 'parse');
            writeToDLQ({
              ts: Date.now(),
              source: 'ocpp-csms-ws',
              rawPayload: String(data).slice(0, 512),
              error: err instanceof Error ? err.message : String(err),
              protocol: this.protocol,
            });
            recordAdapterDlq(this.id, this.protocol);
          }
        });

        ws.on('close', () => {
          this.sessions.delete(ws);
        });

        ws.on('error', () => {
          ws.close();
        });
      });

      this.wss = wss;
    });
  }

  async disconnect(): Promise<void> {
    this.emitter.emit('destroy');
    this.emitter.removeAllListeners();

    for (const pending of this.outboundPending.values()) {
      clearTimeout(pending.timer);
      pending.resolve(false);
    }
    this.outboundPending.clear();

    for (const ws of this.sessions.keys()) {
      ws.close(1000, 'csms shutdown');
    }
    this.sessions.clear();

    if (this.wss) {
      await new Promise<void>((resolve) => {
        this.wss!.close(() => resolve());
      });
      this.wss = null;
    }
    this.listening = false;
  }

  async healthCheck(): Promise<AdapterHealth> {
    const sessionCount = this.sessions.size;
    return {
      status: this.listening
        ? sessionCount > 0 && this.consecutiveErrors === 0
          ? 'healthy'
          : sessionCount > 0
            ? 'degraded'
            : 'healthy'
        : 'offline',
      lastSuccessMs: this.lastSuccessMs,
      errorMessage: this.listening
        ? sessionCount === 0
          ? 'CSMS listening — no charge points connected'
          : this.consecutiveErrors > 0
            ? `${this.consecutiveErrors} consecutive parse errors`
            : undefined
        : 'CSMS gateway not listening',
      consecutiveErrors: this.consecutiveErrors,
    };
  }

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

  private handleMessage(ws: WebSocket, msg: OcppInboundMessage): void {
    if (msg[0] === OCPP_CALLRESULT) {
      const messageId = msg[1];
      if (!this.outboundPending.has(messageId)) return;
      const payload = CallResultPayloadSchema.safeParse(msg[2] ?? {});
      const accepted = payload.success && payload.data.status === 'Accepted';
      this.resolveOutboundPending(messageId, accepted);
      return;
    }
    if (msg[0] === OCPP_CALLERROR) {
      const messageId = msg[1];
      if (typeof messageId === 'string' && this.outboundPending.has(messageId)) {
        this.resolveOutboundPending(messageId, false);
      }
      return;
    }
    if (msg[0] !== OCPP_CALL) return;

    const [, messageId, action, payload] = msg;
    const session = this.sessions.get(ws);
    if (!session) return;

    session.lastSeenMs = Date.now();

    switch (action) {
      case 'BootNotification': {
        const station = ChargingStationSchema.safeParse(payload.chargingStation);
        if (station.success && station.data.serialNumber) {
          session.chargePointId = station.data.serialNumber;
        }
        this.sendCallResult(ws, messageId, {
          currentTime: new Date().toISOString(),
          interval: HEARTBEAT_INTERVAL_S,
          status: 'Accepted',
        });
        break;
      }
      case 'Heartbeat':
        this.sendCallResult(ws, messageId, { currentTime: new Date().toISOString() });
        break;
      case 'Authorize':
        this.sendCallResult(ws, messageId, {
          idTokenInfo: { status: 'Accepted' },
        });
        break;
      case 'StatusNotification':
        this.sendCallResult(ws, messageId, {});
        break;
      case 'MeterValues':
        this.ingestMeterPayload(session, payload);
        this.sendCallResult(ws, messageId, {});
        break;
      case 'TransactionEvent':
        this.ingestTransactionPayload(session, payload);
        this.sendCallResult(ws, messageId, {});
        break;
      default:
        this.sendCallError(ws, messageId, 'NotImplemented', `Action ${action} not supported`);
    }
  }

  private ingestMeterPayload(session: ChargePointSession, payload: Record<string, unknown>): void {
    if (payload.meterValue === undefined) return;
    this.applySampledValues(session, payload.meterValue);
  }

  private ingestTransactionPayload(
    session: ChargePointSession,
    payload: Record<string, unknown>,
  ): void {
    const transactionInfo = TransactionInfoSchema.safeParse(payload.transactionInfo);
    if (transactionInfo.success && transactionInfo.data.transactionId) {
      session.transactionId = transactionInfo.data.transactionId;
    }

    if (payload.meterValue !== undefined) {
      this.applySampledValues(session, payload.meterValue);
    }
    if (payload.eventType === 'Ended') {
      session.transactionId = undefined;
      session.lastPowerW = 0;
      this.emitMetric(session, 'POWER_W', 0);
    }
  }

  supportsCommand(type: WSCommandType): boolean {
    return OCPP_EV_COMMANDS.has(type);
  }

  async sendCommand(command: ProtocolCommandRequest): Promise<ProtocolCommandResult> {
    if (!this.supportsCommand(command.type)) {
      return { handled: false, success: false };
    }

    const active = this.pickActiveSession(command.chargePointId);
    if (active.kind === 'none') {
      return {
        handled: true,
        success: false,
        adapterId: this.id,
        error: 'No charge point connected',
      };
    }
    if (active.kind === 'not_found') {
      return {
        handled: true,
        success: false,
        adapterId: this.id,
        error: `Charge point not found: ${active.chargePointId}`,
      };
    }
    if (active.kind === 'ambiguous') {
      return {
        handled: true,
        success: false,
        adapterId: this.id,
        error: 'Multiple charge points connected',
      };
    }

    const { ws, session } = active;
    let acknowledged = false;

    switch (command.type) {
      case 'SET_EV_POWER': {
        const power = EvPowerValueSchema.safeParse(command.value);
        if (!power.success) {
          return {
            handled: true,
            success: false,
            adapterId: this.id,
            error: SET_EV_POWER_ERROR,
          };
        }
        acknowledged = await this.sendSetChargingProfileW(ws, power.data);
        break;
      }
      case 'SET_EV_CURRENT': {
        const current = EvCurrentValueSchema.safeParse(command.value);
        if (!current.success) {
          return {
            handled: true,
            success: false,
            adapterId: this.id,
            error: SET_EV_CURRENT_ERROR,
          };
        }
        acknowledged = await this.sendSetChargingProfileA(ws, current.data);
        break;
      }
      case 'START_CHARGING':
        acknowledged = await this.sendRequestStartTransaction(ws);
        break;
      case 'STOP_CHARGING':
        if (!session.transactionId) {
          return {
            handled: true,
            success: false,
            adapterId: this.id,
            error: 'No active transaction to stop',
          };
        }
        acknowledged = await this.sendRequestStopTransaction(ws, session.transactionId);
        break;
      case 'SET_V2X_DISCHARGE': {
        const discharge = EvDischargeValueSchema.safeParse(command.value);
        if (!discharge.success) {
          return {
            handled: true,
            success: false,
            adapterId: this.id,
            error: 'SET_V2X_DISCHARGE requires a finite wattage between 0 and 25000',
          };
        }
        if (
          !(session.lastSocPercent !== undefined && session.lastSocPercent >= V2G_MIN_SOC_PERCENT)
        ) {
          return {
            handled: true,
            success: false,
            adapterId: this.id,
            error: `V2G blocked: EV SOC below minimum ${V2G_MIN_SOC_PERCENT}%`,
          };
        }
        if (!session.transactionId) {
          return {
            handled: true,
            success: false,
            adapterId: this.id,
            error: 'No active transaction for V2G discharge',
          };
        }
        acknowledged = await this.sendV2XDischarge(ws, session, discharge.data);
        break;
      }
      case 'SET_GRID_LIMIT': {
        const limitW = OcppGridLimitWattsSchema.safeParse(command.value);
        if (!limitW.success) {
          return { handled: false, success: false };
        }
        acknowledged = await this.sendGridCurtailment(ws, limitW.data);
        break;
      }
      default:
        return { handled: false, success: false };
    }

    return acknowledged
      ? { handled: true, success: true, adapterId: this.id }
      : {
          handled: true,
          success: false,
          adapterId: this.id,
          error: 'Charge point rejected or timed out on OCPP command',
        };
  }

  private pickActiveSession(
    chargePointId?: string,
  ):
    | { kind: 'single'; ws: WebSocket; session: ChargePointSession }
    | { kind: 'none' }
    | { kind: 'not_found'; chargePointId: string }
    | { kind: 'ambiguous' } {
    const open: Array<{ ws: WebSocket; session: ChargePointSession }> = [];
    for (const [ws, session] of this.sessions) {
      if (ws.readyState === WebSocket.OPEN) {
        open.push({ ws, session });
      }
    }
    if (open.length === 0) return { kind: 'none' };

    if (chargePointId) {
      const match = open.find((entry) => entry.session.chargePointId === chargePointId);
      return match
        ? { kind: 'single', ws: match.ws, session: match.session }
        : { kind: 'not_found', chargePointId };
    }

    if (open.length > 1) return { kind: 'ambiguous' };
    return { kind: 'single', ws: open[0]!.ws, session: open[0]!.session };
  }

  private resolveOutboundPending(messageId: string, success: boolean): void {
    const pending = this.outboundPending.get(messageId);
    if (!pending) return;
    clearTimeout(pending.timer);
    this.outboundPending.delete(messageId);
    pending.resolve(success);
  }

  private sendOutboundCall(
    ws: WebSocket,
    action: string,
    payload: Record<string, unknown>,
  ): Promise<boolean> {
    if (ws.readyState !== WebSocket.OPEN) return Promise.resolve(false);
    const messageId = `csms-${++this.outboundMessageId}`;

    return new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => {
        this.outboundPending.delete(messageId);
        resolve(false);
      }, OUTBOUND_TIMEOUT_MS);

      this.outboundPending.set(messageId, {
        resolve: (success) => {
          clearTimeout(timer);
          this.outboundPending.delete(messageId);
          resolve(success);
        },
        timer,
      });

      ws.send(JSON.stringify([OCPP_CALL, messageId, action, payload]));
    });
  }

  private sendSetChargingProfileA(ws: WebSocket, maxCurrentA: number): Promise<boolean> {
    return this.sendSetChargingProfile(ws, 1, 1, 0, 'TxDefaultProfile', {
      chargingRateUnit: 'A',
      chargingSchedulePeriod: [{ startPeriod: 0, limit: maxCurrentA }],
    });
  }

  private sendSetChargingProfileW(ws: WebSocket, powerW: number): Promise<boolean> {
    return this.sendSetChargingProfile(ws, 1, 1, 0, 'TxDefaultProfile', {
      chargingRateUnit: 'W',
      chargingSchedulePeriod: [{ startPeriod: 0, limit: powerW }],
    });
  }

  /** V2X discharge via negative TxProfile amp limit (vehicle-to-grid). */
  private sendV2XDischarge(
    ws: WebSocket,
    session: ChargePointSession,
    dischargePowerW: number,
  ): Promise<boolean> {
    const negativeA = -Math.round(dischargePowerW / session.lastVoltageV);
    return this.sendSetChargingProfile(
      ws,
      1,
      2,
      1,
      'TxProfile',
      {
        chargingRateUnit: 'A',
        chargingSchedulePeriod: [{ startPeriod: 0, limit: negativeA }],
      },
      { transactionId: session.transactionId },
    );
  }

  /** §14a EnWG grid limit via ChargingStationMaxProfile in watts (OCPP 2.1 B12). */
  private sendGridCurtailment(ws: WebSocket, maxPowerW: number): Promise<boolean> {
    return this.sendSetChargingProfile(ws, 0, 100, 10, 'ChargingStationMaxProfile', {
      chargingRateUnit: 'W',
      chargingSchedulePeriod: [{ startPeriod: 0, limit: maxPowerW }],
    });
  }

  private sendSetChargingProfile(
    ws: WebSocket,
    evseId: number,
    id: number,
    stackLevel: number,
    purpose: string,
    schedule: Record<string, unknown>,
    profileExtra?: Record<string, unknown>,
  ): Promise<boolean> {
    return this.sendOutboundCall(ws, 'SetChargingProfile', {
      evseId,
      chargingProfile: {
        id,
        stackLevel,
        chargingProfilePurpose: purpose,
        chargingProfileKind: 'Absolute',
        chargingSchedule: [{ id, ...schedule }],
        ...profileExtra,
      },
    });
  }

  private sendRequestStartTransaction(ws: WebSocket): Promise<boolean> {
    return this.sendOutboundCall(ws, 'RequestStartTransaction', {
      evseId: 1,
      remoteStartId: Date.now(),
      idToken: {
        idToken: 'nexus-hems',
        type: 'Central',
      },
    });
  }

  private sendRequestStopTransaction(ws: WebSocket, transactionId: string): Promise<boolean> {
    return this.sendOutboundCall(ws, 'RequestStopTransaction', { transactionId });
  }

  private applySampledValues(session: ChargePointSession, meterValue: unknown): void {
    const parsed = OcppMeterValueSchema.safeParse(meterValue);
    if (!parsed.success) return;

    for (const mv of parsed.data) {
      for (const sv of mv.sampledValue) {
        const value = Number(sv.value);
        if (!Number.isFinite(value)) continue;

        switch (sv.measurand) {
          case 'Power.Active.Import':
            session.lastPowerW = value;
            this.emitMetric(session, 'POWER_W', value);
            break;
          case 'Energy.Active.Import.Register': {
            const kwh = sv.unit === 'Wh' ? value / 1000 : value;
            session.lastEnergyKWh = kwh;
            this.emitMetric(session, 'ENERGY_KWH', kwh);
            break;
          }
          case 'SoC':
            if (value >= 0 && value <= MAX_SOC_PERCENT) {
              session.lastSocPercent = value;
              this.emitMetric(session, 'SOC_PERCENT', value);
            }
            break;
          case 'Voltage':
            if (value >= MIN_MAINS_VOLTAGE_V && value <= MAX_MAINS_VOLTAGE_V) {
              session.lastVoltageV = value;
            }
            break;
          default:
            break;
        }
      }
    }
  }

  private emitMetric(session: ChargePointSession, metric: MetricType, value: number): void {
    const candidate = {
      timestamp: Date.now(),
      deviceId: session.chargePointId,
      protocol: this.protocol,
      metric,
      value,
      qualityIndicator: 'GOOD' as const,
      role: 'ev' as const,
    };

    const parsed = energyDatapointSchema.safeParse(candidate);
    if (parsed.success) {
      this.emitter.emit('data', parsed.data);
      this.lastSuccessMs = Date.now();
      this.consecutiveErrors = 0;
    } else {
      this.consecutiveErrors++;
      writeToDLQ({
        ts: Date.now(),
        source: session.chargePointId,
        rawPayload: JSON.stringify(candidate),
        error: parsed.error.message,
        protocol: this.protocol,
      });
      recordAdapterDlq(this.id, this.protocol);
    }
  }

  private sendCallResult(ws: WebSocket, messageId: string, payload: Record<string, unknown>): void {
    if (ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify([OCPP_CALLRESULT, messageId, payload]));
  }

  private sendCallError(
    ws: WebSocket,
    messageId: string,
    errorCode: string,
    errorDescription: string,
  ): void {
    if (ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify([OCPP_CALLERROR, messageId, errorCode, errorDescription, {}]));
  }
}

export function createOcppCsmsAdapterFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): OcppCsmsProtocolAdapter | null {
  const portRaw = env.OCPP_CSMS_PORT?.trim();
  if (!portRaw) return null;
  const port = Number(portRaw);
  if (!Number.isFinite(port) || port < 1 || port > 65_535) return null;

  return new OcppCsmsProtocolAdapter({
    id: env.OCPP_CSMS_ADAPTER_ID?.trim() || 'ocpp-csms-01',
    host: env.OCPP_CSMS_HOST?.trim() || '0.0.0.0',
    port,
    path: env.OCPP_CSMS_PATH?.trim() || '/ocpp',
  });
}

function writeToDLQ(entry: DLQEntry): void {
  if (dlqLineCount >= MAX_DLQ_LINES) return;
  try {
    mkdirSync(API_RUNTIME_DIR, { recursive: true });
    appendFileSync(DEAD_LETTER_QUEUE_PATH, `${JSON.stringify(entry)}\n`, 'utf8');
    dlqLineCount++;
  } catch {
    /* best-effort */
  }
}
