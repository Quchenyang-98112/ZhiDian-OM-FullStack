/**
 * EvccAdapter — Backend protocol adapter for evcc REST + WebSocket API.
 *
 * Polls GET /api/state and optionally subscribes to /ws for push updates.
 * Maps evcc site metrics to role-tagged UnifiedEnergyDatapoint values for the EventBus.
 *
 * Reference: https://docs.evcc.io/docs/reference/api
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
  recordAdapterPollLatency,
  recordAdapterReconnect,
} from '../../middleware/adapter-metrics.js';
import { API_RUNTIME_DIR, DEAD_LETTER_QUEUE_PATH } from '../../runtime-paths.js';

const DEFAULT_POLL_INTERVAL_MS = 3000;
const MAX_RECONNECT_DELAY_MS = 60_000;
const MAX_DLQ_LINES = 10_000;
let dlqLineCount = 0;

// ---------------------------------------------------------------------------
// evcc API types (subset of /api/state)
// ---------------------------------------------------------------------------

interface EvccLoadpoint {
  chargePower?: number;
}

interface EvccStateResult {
  gridPower?: number;
  pvPower?: number;
  batteryPower?: number;
  batterySoc?: number;
  homePower?: number;
  loadpoints?: EvccLoadpoint[];
}

interface EvccStateResponse {
  result?: EvccStateResult;
}

export interface EvccAdapterConfig {
  id: string;
  /** Base URL, e.g. http://192.168.1.50:7070 */
  baseUrl: string;
  authToken?: string;
  pollIntervalMs?: number;
  /** deviceId prefix for emitted datapoints (default: evcc-site) */
  deviceId?: string;
}

interface MetricMapping {
  metric: MetricType;
  role: EnergyRole;
  getValue: (state: EvccStateResult) => number | null;
}

// ---------------------------------------------------------------------------
// EvccAdapter
// ---------------------------------------------------------------------------

export class EvccAdapter implements IProtocolAdapter {
  readonly id: string;
  readonly protocol: ProtocolType = 'evcc';

  private readonly config: EvccAdapterConfig;
  private readonly deviceId: string;
  private readonly mappings: MetricMapping[];
  private ws: WebSocket | null = null;
  private connected = false;
  private lastSuccessMs: number | undefined;
  private consecutiveErrors = 0;
  private readonly emitter = new EventEmitter();
  private destroyed = false;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectAttempt = 0;

  constructor(config: EvccAdapterConfig) {
    this.config = config;
    this.id = config.id;
    this.deviceId = config.deviceId ?? 'evcc-site';
    this.mappings = buildMetricMappings();
  }

  async connect(): Promise<void> {
    await this.verifyHealth();
    this.connected = true;
    this.consecutiveErrors = 0;
    this.startPolling();
    this.connectWebSocket();
  }

  async disconnect(): Promise<void> {
    this.destroyed = true;
    if (this.pollTimer !== null) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
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
          ? `${this.consecutiveErrors} consecutive poll errors`
          : undefined
        : `Disconnected from ${this.config.baseUrl}`,
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

  private async verifyHealth(): Promise<void> {
    const response = await this.fetchApi('/api/health');
    if (!response.ok) {
      throw new Error(`evcc health check failed: HTTP ${response.status}`);
    }
  }

  private startPolling(): void {
    const interval = this.config.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
    void this.pollState();
    this.pollTimer = setInterval(() => {
      if (!this.destroyed) {
        void this.pollState();
      }
    }, interval);
  }

  private connectWebSocket(): void {
    if (this.destroyed) return;

    try {
      const wsUrl = this.buildWsUrl();
      const ws = new WebSocket(wsUrl, {
        headers: this.buildHeaders(),
      });
      this.ws = ws;

      ws.on('open', () => {
        this.reconnectAttempt = 0;
      });

      ws.on('message', (data) => {
        try {
          const text =
            typeof data === 'string' ? data : Buffer.from(data as Buffer).toString('utf8');
          const parsed = JSON.parse(text) as EvccStateResponse;
          if (parsed.result) {
            this.emitStateDatapoints(parsed.result);
          }
        } catch (err) {
          recordAdapterError(this.id, this.protocol, 'parse');
          writeToDLQ({
            ts: Date.now(),
            source: 'evcc-ws',
            rawPayload: String(data),
            error: err instanceof Error ? err.message : String(err),
            protocol: this.protocol,
          });
          recordAdapterDlq(this.id, this.protocol);
        }
      });

      ws.on('close', () => {
        if (!this.destroyed) {
          recordAdapterReconnect(this.id, this.protocol);
          this.scheduleWsReconnect();
        }
      });

      ws.on('error', () => {
        ws.close();
      });
    } catch {
      // WebSocket optional — REST polling remains primary
    }
  }

  private scheduleWsReconnect(): void {
    if (this.destroyed) return;
    this.reconnectAttempt++;
    const delayMs = Math.min(1000 * 2 ** (this.reconnectAttempt - 1), MAX_RECONNECT_DELAY_MS);
    setTimeout(() => {
      if (!this.destroyed) this.connectWebSocket();
    }, delayMs);
  }

  private async pollState(): Promise<void> {
    const pollStarted = Date.now();
    try {
      const response = await this.fetchApi('/api/state');
      if (!response.ok) {
        throw new Error(`evcc state poll failed: HTTP ${response.status}`);
      }
      const state = (await response.json()) as EvccStateResponse;
      if (state.result) {
        this.emitStateDatapoints(state.result);
        this.lastSuccessMs = Date.now();
        this.consecutiveErrors = 0;
      }
    } catch (err) {
      this.consecutiveErrors++;
      recordAdapterError(this.id, this.protocol, 'poll');
      writeToDLQ({
        ts: Date.now(),
        source: `${this.config.baseUrl}/api/state`,
        rawPayload: '',
        error: err instanceof Error ? err.message : String(err),
        protocol: this.protocol,
      });
    } finally {
      recordAdapterPollLatency(this.id, this.protocol, Date.now() - pollStarted);
    }
  }

  private emitStateDatapoints(result: EvccStateResult): void {
    const timestamp = Date.now();
    for (const mapping of this.mappings) {
      const value = mapping.getValue(result);
      if (value === null || !Number.isFinite(value)) continue;

      const candidate = {
        timestamp,
        deviceId: this.deviceId,
        protocol: this.protocol,
        metric: mapping.metric,
        value,
        qualityIndicator: 'GOOD' as const,
        role: mapping.role,
      };

      const parsed = energyDatapointSchema.safeParse(candidate);
      if (parsed.success) {
        this.emitter.emit('data', parsed.data);
      } else {
        writeToDLQ({
          ts: Date.now(),
          source: mapping.role,
          rawPayload: JSON.stringify(candidate),
          error: parsed.error.message,
          protocol: this.protocol,
        });
        recordAdapterDlq(this.id, this.protocol);
      }
    }
  }

  private buildWsUrl(): string {
    const base = new URL(this.config.baseUrl);
    base.protocol = base.protocol === 'https:' ? 'wss:' : 'ws:';
    base.pathname = '/ws';
    base.search = '';
    base.hash = '';
    return base.toString();
  }

  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (this.config.authToken) {
      headers.Authorization = `Bearer ${this.config.authToken}`;
    }
    return headers;
  }

  private async fetchApi(path: string): Promise<Response> {
    const url = new URL(path, this.config.baseUrl).toString();
    return fetch(url, {
      headers: this.buildHeaders(),
      signal: AbortSignal.timeout(10_000),
    });
  }
}

function buildMetricMappings(): MetricMapping[] {
  return [
    {
      metric: 'POWER_W',
      role: 'pv',
      getValue: (s) => (typeof s.pvPower === 'number' ? s.pvPower : null),
    },
    {
      metric: 'POWER_W',
      role: 'battery',
      getValue: (s) => (typeof s.batteryPower === 'number' ? s.batteryPower : null),
    },
    {
      metric: 'SOC_PERCENT',
      role: 'battery',
      getValue: (s) => (typeof s.batterySoc === 'number' ? s.batterySoc : null),
    },
    {
      metric: 'POWER_W',
      role: 'grid',
      getValue: (s) => (typeof s.gridPower === 'number' ? s.gridPower : null),
    },
    {
      metric: 'POWER_W',
      role: 'load',
      getValue: (s) => (typeof s.homePower === 'number' ? s.homePower : null),
    },
    {
      metric: 'POWER_W',
      role: 'ev',
      getValue: (s) => {
        const lps = s.loadpoints ?? [];
        if (lps.length === 0) return null;
        return lps.reduce((sum, lp) => sum + (lp.chargePower ?? 0), 0);
      },
    },
  ];
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
