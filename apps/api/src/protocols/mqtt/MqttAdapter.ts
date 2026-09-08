/**
 * MqttAdapter — Backend protocol adapter for MQTT brokers (P1 enhanced).
 *
 * P1 additions over v1.3.0 baseline:
 *   • TLS client certificates via env vars (MQTT_CLIENT_CERT / _KEY / _CA_CERT)
 *     or inline PEM / file path in clientOptions
 *   • Per-pattern QoS (0 / 1 / 2); default remains QoS 1
 *   • Retained-message control: processRetained: false skips stale retained state
 *   • Last Will Testament (lwt.topic / .payload / .qos / .retain in config)
 *   • Topic template substitution: {varName} placeholders expanded from templateVars
 *   • Publish helper: publishMessage() for bidirectional control
 *   • Dot-notation payload path extraction: 'payload.sensors.0.power'
 *   • Static device ID shorthand: 'static:my-device-id'
 */

import EventEmitter from 'node:events';
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import {
  type AdapterHealth,
  type EnergyRole,
  energyDatapointSchema,
  type IProtocolAdapter,
  type MetricType,
  type ProtocolType,
  type UnifiedEnergyDatapoint,
} from '@nexus-hems/shared-types';
import mqtt, { type IClientOptions, type MqttClient } from 'mqtt';
import {
  recordAdapterDlq,
  recordAdapterError,
  recordAdapterReconnect,
} from '../../middleware/adapter-metrics.js';
import { API_RUNTIME_DIR, DEAD_LETTER_QUEUE_PATH } from '../../runtime-paths.js';

const MAX_DLQ_LINES = 10_000;
let dlqLineCount = 0;

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface TopicPattern {
  /**
   * MQTT topic pattern. Supports standard MQTT wildcards (+ and #) and
   * {varName} template placeholders that are expanded from `config.templateVars`.
   * Example: 'N/{portalId}/battery/+/Soc'
   */
  pattern: string;
  /** Metric type this topic represents */
  metric: MetricType;
  /**
   * How to extract the deviceId from an incoming topic.
   * - 'topic[N]'      — Nth segment (0-indexed)
   * - 'payload.a.b'   — dot-notation path through parsed JSON payload
   * - 'static:ID'     — fixed string ID (use when all messages share one device)
   */
  deviceIdExtract: string;
  /** Value scale factor (default: 1) */
  scale?: number;
  /** Energy role — enables live UI data bridge via LiveEnergyAggregator (HIGH-17) */
  role?: EnergyRole;
  /** MQTT QoS for this subscription (default: 1) */
  qos?: 0 | 1 | 2;
  /**
   * Whether to process broker-retained messages.
   * Set `false` for event-driven sensors where a stale retained value is misleading.
   * Default: `true`.
   */
  processRetained?: boolean;
}

/** Last Will Testament — published on ungraceful disconnect */
export interface MqttLwtConfig {
  topic: string;
  payload: string;
  qos?: 0 | 1 | 2;
  retain?: boolean;
}

export interface MqttAdapterConfig {
  id: string;
  protocol: ProtocolType;
  brokerUrl: string;
  topicPatterns: TopicPattern[];
  /**
   * Template variable substitutions applied to all topic pattern strings.
   * E.g. `{ portalId: 'abc123' }` with pattern `'N/{portalId}/battery/+/Soc'`
   * becomes `'N/abc123/battery/+/Soc'` at subscription time.
   */
  templateVars?: Record<string, string>;
  /** Last Will Testament — published when the client disconnects ungracefully */
  lwt?: MqttLwtConfig;
  /**
   * MQTT client options (mqtt.js IClientOptions).
   * TLS certificates are also loaded from env vars when not provided here:
   *   MQTT_CLIENT_CERT  — path to PEM file, inline PEM, or base64 PEM
   *   MQTT_CLIENT_KEY   — path to PEM key file, inline PEM, or base64 PEM
   *   MQTT_CA_CERT      — path to CA bundle, inline PEM, or base64 PEM
   *   MQTT_USERNAME     — broker username
   *   MQTT_PASSWORD     — broker password
   */
  clientOptions?: IClientOptions;
}

// ---------------------------------------------------------------------------
// TLS helpers
// ---------------------------------------------------------------------------

function loadPEM(pathOrPem: string | undefined): Buffer | undefined {
  if (!pathOrPem) return undefined;
  if (pathOrPem.trim().startsWith('-----BEGIN')) return Buffer.from(pathOrPem, 'utf-8');
  try {
    if (existsSync(pathOrPem)) return readFileSync(pathOrPem);
  } catch {
    // not a valid path — try base64
  }
  try {
    return Buffer.from(pathOrPem, 'base64');
  } catch {
    return undefined;
  }
}

function buildEnvTlsOptions(): Partial<IClientOptions> {
  const cert = loadPEM(process.env.MQTT_CLIENT_CERT);
  const key = loadPEM(process.env.MQTT_CLIENT_KEY);
  const ca = loadPEM(process.env.MQTT_CA_CERT);
  return {
    ...(cert ? { cert } : {}),
    ...(key ? { key } : {}),
    ...(ca ? { ca } : {}),
    ...(cert && key ? { rejectUnauthorized: true } : {}),
  };
}

// ---------------------------------------------------------------------------
// Topic template expansion
// ---------------------------------------------------------------------------

export function expandTopicTemplate(pattern: string, vars: Record<string, string>): string {
  return pattern.replace(/\{([^}]+)\}/g, (_m, name: string) => vars[name] ?? `{${name}}`);
}

// ---------------------------------------------------------------------------
// MqttAdapter
// ---------------------------------------------------------------------------

export class MqttAdapter implements IProtocolAdapter {
  readonly id: string;
  readonly protocol: ProtocolType;

  private readonly config: MqttAdapterConfig;
  /** Topic patterns with template placeholders already expanded */
  private readonly expandedPatterns: TopicPattern[];
  private client: MqttClient | null = null;
  private connected = false;
  private lastSuccessMs: number | undefined;
  private consecutiveErrors = 0;
  private readonly emitter = new EventEmitter();
  private _destroyed = false;

  constructor(config: MqttAdapterConfig) {
    this.config = config;
    this.id = config.id;
    this.protocol = config.protocol;

    const vars = config.templateVars ?? {};
    this.expandedPatterns = config.topicPatterns.map((tp) => ({
      ...tp,
      pattern: expandTopicTemplate(tp.pattern, vars),
    }));
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const opts: IClientOptions = {
        reconnectPeriod: 5_000,
        connectTimeout: 10_000,
        // Env-level credentials (lowest priority)
        ...(process.env.MQTT_USERNAME ? { username: process.env.MQTT_USERNAME } : {}),
        ...(process.env.MQTT_PASSWORD ? { password: process.env.MQTT_PASSWORD } : {}),
        ...buildEnvTlsOptions(),
        // Config options win over env
        ...this.config.clientOptions,
        // LWT
        ...(this.config.lwt
          ? {
              will: {
                topic: this.config.lwt.topic,
                payload: Buffer.from(this.config.lwt.payload, 'utf-8'),
                qos: this.config.lwt.qos ?? 1,
                retain: this.config.lwt.retain ?? false,
              },
            }
          : {}),
      };

      this.client = mqtt.connect(this.config.brokerUrl, opts);

      this.client.once('connect', () => {
        this.connected = true;
        this.consecutiveErrors = 0;
        console.log(`[MqttAdapter:${this.id}] Connected to ${this.config.brokerUrl}`);

        for (const tp of this.expandedPatterns) {
          this.client?.subscribe(tp.pattern, { qos: tp.qos ?? 1 }, (err) => {
            if (err) console.error('[MqttAdapter] Subscribe error:', this.id, tp.pattern, err);
          });
        }
        resolve();
      });

      this.client.once('error', (err) => {
        if (!this.connected) reject(err);
      });

      this.client.on('reconnect', () => {
        console.log(`[MqttAdapter:${this.id}] Reconnecting…`);
        this.connected = false;
        recordAdapterReconnect(this.id, this.protocol);
      });

      this.client.on('offline', () => {
        this.connected = false;
      });

      this.client.on('message', (topic, payload, packet?: { retain?: boolean }) => {
        this.handleMessage(topic, payload, packet?.retain ?? false);
      });
    });
  }

  async disconnect(): Promise<void> {
    this._destroyed = true;
    this.emitter.emit('destroy');
    this.emitter.removeAllListeners();
    await new Promise<void>((resolve) => {
      this.client?.end(true, {}, () => resolve());
    });
    this.connected = false;
  }

  async healthCheck(): Promise<AdapterHealth> {
    return {
      status: this.connected ? (this.consecutiveErrors > 0 ? 'degraded' : 'healthy') : 'offline',
      lastSuccessMs: this.lastSuccessMs,
      consecutiveErrors: this.consecutiveErrors,
    };
  }

  /**
   * Publish a message to the broker (bidirectional control).
   * Requires an active connection.
   */
  publishMessage(
    topic: string,
    payload: string,
    qos: 0 | 1 | 2 = 1,
    retain = false,
  ): Promise<void> {
    if (!this.client || !this.connected) return Promise.reject(new Error('Not connected'));
    return new Promise<void>((resolve, reject) => {
      this.client!.publish(topic, payload, { qos, retain }, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
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
      while (!this._destroyed) {
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
  // Private
  // ---------------------------------------------------------------------------

  private handleMessage(topic: string, payload: Buffer, isRetained: boolean): void {
    const pattern = this.findMatchingPattern(topic);
    if (!pattern) {
      writeToDLQ({
        ts: Date.now(),
        source: topic,
        rawPayload: payload.toString('utf8').slice(0, 4096),
        error: 'No matching topic pattern',
        protocol: this.protocol,
      });
      recordAdapterDlq(this.id, this.protocol);
      return;
    }

    // Skip retained messages when the pattern opts out
    if (isRetained && pattern.processRetained === false) return;

    let rawValue: number;
    let deviceId: string;
    try {
      const payloadStr = payload.toString('utf8');
      const parsed: unknown = (() => {
        try {
          return JSON.parse(payloadStr);
        } catch {
          return payloadStr;
        }
      })();
      rawValue = this.extractValue(parsed, payloadStr);
      deviceId = this.extractDeviceId(topic, parsed, pattern.deviceIdExtract);
    } catch (err) {
      this.consecutiveErrors++;
      recordAdapterError(this.id, this.protocol, 'parse');
      writeToDLQ({
        ts: Date.now(),
        source: topic,
        rawPayload: payload.toString('utf8').slice(0, 4096),
        error: err instanceof Error ? err.message : 'Parse error',
        protocol: this.protocol,
      });
      return;
    }

    const candidate = {
      timestamp: Date.now(),
      deviceId,
      protocol: this.protocol,
      metric: pattern.metric,
      value: rawValue * (pattern.scale ?? 1),
      qualityIndicator: 'GOOD' as const,
      ...(pattern.role ? { role: pattern.role } : {}),
    };

    const result = energyDatapointSchema.safeParse(candidate);
    if (result.success) {
      this.emitter.emit('data', result.data);
      this.lastSuccessMs = Date.now();
      this.consecutiveErrors = 0;
    } else {
      writeToDLQ({
        ts: Date.now(),
        source: topic,
        rawPayload: JSON.stringify(candidate),
        error: result.error.message,
        protocol: this.protocol,
      });
      recordAdapterDlq(this.id, this.protocol);
    }
  }

  private findMatchingPattern(topic: string): TopicPattern | null {
    for (const tp of this.expandedPatterns) {
      if (topicMatchesPattern(topic, tp.pattern)) return tp;
    }
    return null;
  }

  private extractValue(parsed: unknown, rawStr: string): number {
    if (typeof parsed === 'number') return parsed;
    if (typeof parsed === 'object' && parsed !== null) {
      // Venus OS / dbus-mqtt: { "value": N }
      const obj = parsed as Record<string, unknown>;
      if ('value' in obj) {
        const v = obj.value;
        if (typeof v === 'number') return v;
        if (v === null) throw new Error('Null value (device offline / no reading)');
      }
      // Common field names fallback
      for (const field of ['power', 'energy', 'Power', 'Energy', 'val']) {
        const v = obj[field];
        if (typeof v === 'number' && Number.isFinite(v)) return v;
      }
    }
    const n = Number(typeof parsed === 'string' ? parsed.trim() : rawStr.trim());
    if (!Number.isNaN(n)) return n;
    throw new Error(`Cannot extract numeric value: ${rawStr.slice(0, 100)}`);
  }

  private extractDeviceId(topic: string, parsed: unknown, extract: string): string {
    if (extract.startsWith('static:')) return extract.slice(7);
    if (extract.startsWith('topic[')) {
      const idx = parseInt(extract.slice(6, -1), 10);
      const seg = topic.split('/')[idx];
      if (seg === undefined) throw new Error(`Topic segment ${idx} out of range: ${topic}`);
      return seg;
    }
    if (extract.startsWith('payload.') && typeof parsed === 'object' && parsed !== null) {
      const path = extract.slice(8).split('.');
      let obj: unknown = parsed;
      for (const key of path) {
        if (typeof obj !== 'object' || obj === null) break;
        obj = (obj as Record<string, unknown>)[key];
      }
      if (typeof obj === 'string') return obj;
      if (typeof obj === 'number') return String(obj);
    }
    return this.id;
  }
}

// ---------------------------------------------------------------------------
// MQTT wildcard topic matching
// ---------------------------------------------------------------------------

export function topicMatchesPattern(topic: string, pattern: string): boolean {
  if (pattern === '#') return true;
  const tParts = topic.split('/');
  const pParts = pattern.split('/');
  for (let i = 0; i < pParts.length; i++) {
    if (pParts[i] === '#') return true;
    if (pParts[i] !== '+' && pParts[i] !== tParts[i]) return false;
  }
  return tParts.length === pParts.length;
}

// ---------------------------------------------------------------------------
// Dead-Letter Queue
// ---------------------------------------------------------------------------

interface DLQEntry {
  ts: number;
  source: string;
  rawPayload: string;
  error: string;
  protocol?: ProtocolType;
}

function writeToDLQ(entry: DLQEntry): void {
  if (dlqLineCount >= MAX_DLQ_LINES) dlqLineCount = 0;
  try {
    mkdirSync(API_RUNTIME_DIR, { recursive: true });
    appendFileSync(DEAD_LETTER_QUEUE_PATH, `${JSON.stringify(entry)}\n`, 'utf8');
    dlqLineCount++;
  } catch {
    /* never propagate DLQ errors */
  }
}
