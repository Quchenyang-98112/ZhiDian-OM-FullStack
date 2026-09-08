/**
 * KnxAdapter — Backend protocol adapter for KNX/IP via WebSocket bridge.
 *
 * Connects to a knxd or custom JSON bridge that exposes KNX telegrams:
 *   { "ga": "3/1/0", "dpt": "DPT9.001", "value": 21.5 }
 *
 * Group-address → metric mappings are loaded from knx-ga-map.json (or passed in config).
 * Invalid telegrams are routed to the Dead-Letter Queue.
 */

import EventEmitter from 'node:events';
import { appendFileSync, mkdirSync } from 'node:fs';
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

const MAX_RECONNECT_DELAY_MS = 60_000;
const MAX_DLQ_LINES = 10_000;
let dlqLineCount = 0;

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface KnxGaMapping {
  deviceId: string;
  /** KNX group address, e.g. "3/1/0" */
  ga: string;
  metric: MetricType;
  scale?: number;
  role?: EnergyRole;
  label?: string;
}

export interface KnxAdapterConfig {
  id: string;
  /** WebSocket URL of the KNX JSON bridge (knxd / custom gateway) */
  wsUrl: string;
  mappings: KnxGaMapping[];
}

interface KNXTelegram {
  ga: string;
  dpt?: string;
  value: boolean | number | string;
  ts?: number;
}

// ---------------------------------------------------------------------------
// KnxAdapter
// ---------------------------------------------------------------------------

export class KnxAdapter implements IProtocolAdapter {
  readonly id: string;
  readonly protocol: ProtocolType = 'knx';

  private readonly config: KnxAdapterConfig;
  private readonly gaIndex: Map<string, KnxGaMapping>;
  private ws: WebSocket | null = null;
  private connected = false;
  private lastSuccessMs: number | undefined;
  private consecutiveErrors = 0;
  private readonly emitter = new EventEmitter();
  private destroyed = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempt = 0;

  constructor(config: KnxAdapterConfig) {
    this.config = config;
    this.id = config.id;
    this.gaIndex = new Map(config.mappings.map((m) => [m.ga, m]));
  }

  async connect(): Promise<void> {
    await this.openWebSocket();
  }

  async disconnect(): Promise<void> {
    this.destroyed = true;
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.emitter.emit('destroy');
    this.emitter.removeAllListeners();
    if (this.ws) {
      this.ws.removeAllListeners();
      if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
        this.ws.close();
      }
      this.ws = null;
    }
    this.connected = false;
  }

  async healthCheck(): Promise<AdapterHealth> {
    return {
      status: this.connected ? (this.consecutiveErrors > 0 ? 'degraded' : 'healthy') : 'offline',
      lastSuccessMs: this.lastSuccessMs,
      errorMessage: this.connected
        ? this.consecutiveErrors > 0
          ? `${this.consecutiveErrors} consecutive parse errors`
          : undefined
        : `Disconnected from ${this.config.wsUrl}`,
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

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  private openWebSocket(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.destroyed) {
        reject(new Error('Adapter destroyed'));
        return;
      }

      const ws = new WebSocket(this.config.wsUrl);
      this.ws = ws;

      ws.once('open', () => {
        this.connected = true;
        this.consecutiveErrors = 0;
        this.reconnectAttempt = 0;
        console.log(`[KnxAdapter:${this.id}] Connected to ${this.config.wsUrl}`);
        this.requestInitialState();
        resolve();
      });

      ws.once('error', (err) => {
        if (!this.connected) reject(err);
      });

      ws.on('message', (data) => {
        this.handleRawMessage(data);
      });

      ws.on('close', () => {
        const wasConnected = this.connected;
        this.connected = false;
        if (!this.destroyed) {
          if (wasConnected) {
            recordAdapterReconnect(this.id, this.protocol);
          }
          this.scheduleReconnect();
        }
      });
    });
  }

  private scheduleReconnect(): void {
    if (this.destroyed || this.reconnectTimer !== null) return;

    this.reconnectAttempt++;
    const delayMs = Math.min(1000 * 2 ** (this.reconnectAttempt - 1), MAX_RECONNECT_DELAY_MS);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.openWebSocket().catch(() => {
        if (!this.destroyed) this.scheduleReconnect();
      });
    }, delayMs);
  }

  private requestInitialState(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    for (const ga of this.gaIndex.keys()) {
      this.ws.send(JSON.stringify({ type: 'READ', ga }));
    }
  }

  private handleRawMessage(data: unknown): void {
    try {
      const text = typeof data === 'string' ? data : Buffer.from(data as Buffer).toString('utf8');
      const parsed = JSON.parse(text) as KNXTelegram | { type?: string };
      if ('type' in parsed && parsed.type !== undefined && !('ga' in parsed)) return;
      if (!('ga' in parsed) || typeof parsed.ga !== 'string') return;
      this.handleTelegram(parsed as KNXTelegram);
    } catch (err) {
      this.consecutiveErrors++;
      recordAdapterError(this.id, this.protocol, 'parse');
      writeToDLQ({
        ts: Date.now(),
        source: this.config.wsUrl,
        rawPayload: String(data),
        error: err instanceof Error ? err.message : String(err),
        protocol: this.protocol,
      });
      recordAdapterDlq(this.id, this.protocol);
    }
  }

  private handleTelegram(telegram: KNXTelegram): void {
    const mapping = this.gaIndex.get(telegram.ga);
    if (!mapping) return;

    const numeric = toNumericValue(telegram.value);
    if (numeric === null) {
      writeToDLQ({
        ts: Date.now(),
        source: telegram.ga,
        rawPayload: JSON.stringify(telegram),
        error: 'Non-numeric value for mapped GA',
        protocol: this.protocol,
      });
      recordAdapterDlq(this.id, this.protocol);
      return;
    }

    const scale = mapping.scale ?? 1;
    const candidate = {
      timestamp: telegram.ts ?? Date.now(),
      deviceId: mapping.deviceId,
      protocol: this.protocol,
      metric: mapping.metric,
      value: numeric * scale,
      qualityIndicator: 'GOOD' as const,
      ...(mapping.role ? { role: mapping.role } : {}),
    };

    const result = energyDatapointSchema.safeParse(candidate);
    if (result.success) {
      this.emitter.emit('data', result.data);
      this.lastSuccessMs = Date.now();
      this.consecutiveErrors = 0;
    } else {
      writeToDLQ({
        ts: Date.now(),
        source: telegram.ga,
        rawPayload: JSON.stringify(candidate),
        error: result.error.message,
        protocol: this.protocol,
      });
      recordAdapterDlq(this.id, this.protocol);
    }
  }
}

function toNumericValue(value: boolean | number | string): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value === 'string') {
    const n = Number.parseFloat(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
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
  if (dlqLineCount >= MAX_DLQ_LINES) {
    dlqLineCount = 0;
  }
  try {
    mkdirSync(API_RUNTIME_DIR, { recursive: true });
    appendFileSync(DEAD_LETTER_QUEUE_PATH, `${JSON.stringify(entry)}\n`, 'utf8');
    dlqLineCount++;
  } catch {
    // Never let DLQ errors bubble up
  }
}
