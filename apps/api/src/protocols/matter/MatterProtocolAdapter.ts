/**
 * MatterProtocolAdapter — Backend IProtocolAdapter for Matter/Thread controllers.
 *
 * Phase 1 (MVP): WebSocket API to HA Matter Server / python-matter-server,
 * `get_nodes` discovery, attribute update events, static node map.
 * Read-only telemetry (no write_attribute / invoke_command).
 *
 * Env vars (live mode only):
 *   MATTER_BRIDGE_HOST     — controller hostname (required to enable)
 *   MATTER_BRIDGE_PORT     — WebSocket port (default: 5580)
 *   MATTER_BRIDGE_TLS      — "true" for wss://
 *   MATTER_ADAPTER_ID      — adapter instance id (default: matter-01)
 *   MATTER_DEVICE_ID       — deviceId prefix (default: matter-site)
 *   MATTER_NODE_MAP_PATH   — override path to node map JSON
 *   MATTER_NODE_IDS        — comma-separated node ids (optional)
 */

import EventEmitter from 'node:events';
import { appendFileSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  type AdapterHealth,
  energyDatapointSchema,
  type IProtocolAdapter,
  type ProtocolType,
  type UnifiedEnergyDatapoint,
  type WSCommandType,
} from '@nexus-hems/shared-types';
import { WebSocket } from 'ws';
import {
  recordAdapterDlq,
  recordAdapterError,
  recordAdapterReconnect,
} from '../../middleware/adapter-metrics.js';
import { API_RUNTIME_DIR, DEAD_LETTER_QUEUE_PATH } from '../../runtime-paths.js';
import type {
  IProtocolCommandHandler,
  ProtocolCommandRequest,
  ProtocolCommandResult,
} from '../protocol-command.js';
import { HeatPumpModeValueSchema } from '../protocol-command.js';
import {
  MATTER_CLUSTER,
  type MatterNodeMapping,
  parseMatterNumericValue,
  resolveMatterAttribute,
} from './matter-cluster-map.js';

const CONNECT_TIMEOUT_MS = 15_000;
const MAX_DLQ_LINES = 10_000;
let dlqLineCount = 0;

interface MatterWSMessage {
  type?: string;
  event?: string;
  messageId?: string;
  result?: Array<{
    nodeId: number;
    endpoints: Array<{
      endpointId: number;
      clusters: Record<number, Record<string, unknown>>;
    }>;
  }>;
  data?: {
    nodeId?: number;
    endpoint?: number;
    cluster?: number;
    attribute?: string;
    value?: number;
  };
}

export interface MatterProtocolAdapterConfig {
  id: string;
  host: string;
  port?: number;
  tls?: boolean;
  deviceId?: string;
  nodeMappings?: MatterNodeMapping[];
  nodeIds?: number[];
  heatPumpNodeId?: number;
}

interface DLQEntry {
  ts: number;
  source: string;
  rawPayload: string;
  error: string;
  protocol: ProtocolType;
}

export class MatterProtocolAdapter implements IProtocolAdapter, IProtocolCommandHandler {
  readonly id: string;
  readonly protocol: ProtocolType = 'matter-thread';

  private readonly config: Required<Pick<MatterProtocolAdapterConfig, 'host' | 'port' | 'tls'>> &
    MatterProtocolAdapterConfig;
  private readonly deviceIdPrefix: string;
  private readonly staticMap: Map<number, MatterNodeMapping>;
  private readonly nodeIds: Set<number>;
  private readonly heatPumpNodeId: number | undefined;
  private ws: WebSocket | null = null;
  private wsMsgId = 1;
  private connected = false;
  private destroyed = false;
  private lastSuccessMs: number | undefined;
  private consecutiveErrors = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempt = 0;
  private readonly emitter = new EventEmitter();

  constructor(config: MatterProtocolAdapterConfig) {
    this.config = {
      ...config,
      port: config.port ?? 5580,
      tls: config.tls ?? false,
    };
    this.id = config.id;
    this.deviceIdPrefix = config.deviceId ?? 'matter-site';
    this.staticMap = new Map((config.nodeMappings ?? []).map((entry) => [entry.nodeId, entry]));
    this.nodeIds = new Set(config.nodeIds ?? []);
    this.heatPumpNodeId = config.heatPumpNodeId;
  }

  async connect(): Promise<void> {
    if (this.destroyed) return;
    await this.openWebSocket();
  }

  async disconnect(): Promise<void> {
    this.destroyed = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.removeAllListeners();
      this.ws.close();
      this.ws = null;
    }
    this.connected = false;
    this.emitter.emit('destroy');
  }

  async healthCheck(): Promise<AdapterHealth> {
    if (this.destroyed) {
      return { status: 'offline', consecutiveErrors: this.consecutiveErrors };
    }
    if (this.connected) {
      return {
        status: 'healthy',
        ...(this.lastSuccessMs !== undefined ? { lastSuccessMs: this.lastSuccessMs } : {}),
        consecutiveErrors: this.consecutiveErrors,
      };
    }
    return {
      status: 'offline',
      errorMessage: 'Matter controller WebSocket not connected',
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
          await new Promise<void>((resolve) => {
            notify = resolve;
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

  private openWebSocket(): Promise<void> {
    if (this.ws) {
      this.ws.removeAllListeners();
      this.ws.close();
      this.ws = null;
    }

    const protocol = this.config.tls ? 'wss' : 'ws';
    const url = `${protocol}://${this.config.host}:${this.config.port}/ws`;

    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url);
      this.ws = ws;
      let settled = false;

      const timeout = setTimeout(() => {
        if (!settled) {
          settled = true;
          reject(new Error('Matter WebSocket connection timeout'));
        }
      }, CONNECT_TIMEOUT_MS);

      const finish = (err?: Error): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        if (err) reject(err);
        else resolve();
      };

      ws.on('open', () => {
        this.connected = true;
        this.reconnectAttempt = 0;
        this.sendWs({ type: 'get_nodes', messageId: String(this.wsMsgId++) });
        finish();
      });

      ws.on('message', (raw) => {
        try {
          const msg = JSON.parse(String(raw)) as MatterWSMessage;
          this.handleWsMessage(msg);
        } catch (err) {
          recordAdapterError(this.id, this.protocol, 'parse_error');
          this.consecutiveErrors++;
          writeToDLQ({
            ts: Date.now(),
            source: url,
            rawPayload: String(raw).slice(0, 4096),
            error: err instanceof Error ? err.message : String(err),
            protocol: this.protocol,
          });
        }
      });

      ws.on('error', () => {
        recordAdapterError(this.id, this.protocol, 'ws_error');
        this.consecutiveErrors++;
        finish(new Error('Matter WebSocket connection error'));
      });

      ws.on('close', () => {
        this.connected = false;
        if (!this.destroyed) {
          this.scheduleReconnect();
        }
      });
    });
  }

  private handleWsMessage(msg: MatterWSMessage): void {
    if (msg.type === 'result' && msg.result) {
      for (const node of msg.result) {
        if (this.nodeIds.size > 0 && !this.nodeIds.has(node.nodeId)) continue;
        this.nodeIds.add(node.nodeId);
        this.parseNodeState(node);
      }
      return;
    }

    if (msg.event === 'attribute_updated' && msg.data) {
      const { nodeId, cluster, attribute, value } = msg.data;
      if (nodeId == null || cluster == null || !attribute || typeof value !== 'number') return;
      if (this.nodeIds.size > 0 && !this.nodeIds.has(nodeId)) return;
      this.emitAttributeDatapoint({ nodeId, cluster, attribute, value });
    }
  }

  private parseNodeState(node: NonNullable<MatterWSMessage['result']>[number]): void {
    for (const endpoint of node.endpoints) {
      const elec = endpoint.clusters[MATTER_CLUSTER.ELECTRICAL_MEASUREMENT];
      if (elec && typeof elec.activePower === 'number') {
        this.emitAttributeDatapoint({
          nodeId: node.nodeId,
          cluster: MATTER_CLUSTER.ELECTRICAL_MEASUREMENT,
          attribute: 'activePower',
          value: elec.activePower,
        });
      }

      const epm = endpoint.clusters[MATTER_CLUSTER.EPM];
      if (epm && typeof epm.activePower === 'number') {
        this.emitAttributeDatapoint({
          nodeId: node.nodeId,
          cluster: MATTER_CLUSTER.EPM,
          attribute: 'activePower',
          value: epm.activePower,
        });
      }

      const eem = endpoint.clusters[MATTER_CLUSTER.EEM];
      if (eem && typeof eem.cumulativeEnergyImported === 'number') {
        this.emitAttributeDatapoint({
          nodeId: node.nodeId,
          cluster: MATTER_CLUSTER.EEM,
          attribute: 'cumulativeEnergyImported',
          value: eem.cumulativeEnergyImported,
        });
      }
    }
  }

  private emitAttributeDatapoint(input: {
    nodeId: number;
    cluster: number;
    attribute: string;
    value: number;
  }): void {
    const resolution = resolveMatterAttribute(input, this.staticMap);
    if (!resolution) return;

    const value = parseMatterNumericValue(input.value, resolution);
    const datapoint = energyDatapointSchema.safeParse({
      timestamp: Date.now(),
      deviceId: `${this.deviceIdPrefix}:node-${input.nodeId}`,
      protocol: this.protocol,
      metric: resolution.metric,
      value,
      qualityIndicator: 'GOOD',
      role: resolution.role,
    });

    if (!datapoint.success) {
      writeToDLQ({
        ts: Date.now(),
        source: `node-${input.nodeId}`,
        rawPayload: String(input.value),
        error: datapoint.error.message,
        protocol: this.protocol,
      });
      recordAdapterDlq(this.id, this.protocol);
      return;
    }

    this.lastSuccessMs = Date.now();
    this.consecutiveErrors = 0;
    this.emitter.emit('data', datapoint.data);
  }

  private sendWs(payload: Record<string, unknown>): void {
    this.ws?.send(JSON.stringify(payload));
  }

  supportsCommand(type: WSCommandType): boolean {
    return type === 'SET_HEAT_PUMP_MODE';
  }

  async sendCommand(command: ProtocolCommandRequest): Promise<ProtocolCommandResult> {
    if (!this.supportsCommand(command.type)) {
      return { handled: false, success: false };
    }

    if (!this.connected || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return {
        handled: true,
        success: false,
        adapterId: this.id,
        error: 'Matter bridge WebSocket not connected',
      };
    }

    const mode = HeatPumpModeValueSchema.safeParse(command.value);
    if (!mode.success) {
      return {
        handled: true,
        success: false,
        adapterId: this.id,
        error: 'SET_HEAT_PUMP_MODE requires an integer SG Ready mode between 1 and 4',
      };
    }

    const nodeId = this.heatPumpNodeId;
    if (nodeId === undefined) {
      return {
        handled: true,
        success: false,
        adapterId: this.id,
        error: 'MATTER_HEAT_PUMP_NODE_ID not configured',
      };
    }

    this.sendWs({
      type: 'write_attribute',
      messageId: String(this.wsMsgId++),
      data: {
        nodeId,
        endpoint: 1,
        cluster: 0x0201,
        attribute: 'systemMode',
        value: mode.data,
      },
    });

    return { handled: true, success: true, adapterId: this.id };
  }

  private scheduleReconnect(): void {
    if (this.destroyed || this.reconnectTimer) return;
    const delay = Math.min(60_000, 1000 * 2 ** this.reconnectAttempt);
    this.reconnectAttempt++;
    recordAdapterReconnect(this.id, this.protocol);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.openWebSocket().catch(() => {
        this.scheduleReconnect();
      });
    }, delay);
  }
}

export function loadMatterNodeMappings(path: string): MatterNodeMapping[] {
  try {
    const raw = readFileSync(path, 'utf8');
    return JSON.parse(raw) as MatterNodeMapping[];
  } catch (err) {
    console.warn('[MatterProtocolAdapter] matter-node-map.json not found or invalid:', err);
    return [];
  }
}

export function createMatterAdapterFromEnv(
  env: NodeJS.ProcessEnv = process.env,
  nodeMappings?: MatterNodeMapping[],
): MatterProtocolAdapter | null {
  const host = env.MATTER_BRIDGE_HOST?.trim();
  if (!host) return null;

  const mapPath =
    env.MATTER_NODE_MAP_PATH?.trim() ||
    join(dirname(fileURLToPath(import.meta.url)), '../../data/matter-node-map.json');

  const mappings = nodeMappings ?? loadMatterNodeMappings(mapPath);
  if (mappings.length === 0) {
    console.warn(
      '[Adapters] MATTER_BRIDGE_HOST set but matter-node-map.json is empty — copy matter-node-map.example.json or rely on controller discovery',
    );
  }

  const nodeIds = env.MATTER_NODE_IDS?.split(',')
    .map((entry) => Number.parseInt(entry.trim(), 10))
    .filter((entry) => Number.isFinite(entry));

  const adapterConfig: MatterProtocolAdapterConfig = {
    id: env.MATTER_ADAPTER_ID?.trim() || 'matter-01',
    host,
    port: env.MATTER_BRIDGE_PORT ? Number(env.MATTER_BRIDGE_PORT) : 5580,
    tls: env.MATTER_BRIDGE_TLS === 'true',
    deviceId: env.MATTER_DEVICE_ID?.trim() || 'matter-site',
    nodeMappings: mappings,
  };
  if (nodeIds && nodeIds.length > 0) adapterConfig.nodeIds = nodeIds;
  const heatPumpNodeId = env.MATTER_HEAT_PUMP_NODE_ID
    ? Number.parseInt(env.MATTER_HEAT_PUMP_NODE_ID, 10)
    : undefined;
  if (heatPumpNodeId !== undefined && Number.isFinite(heatPumpNodeId)) {
    adapterConfig.heatPumpNodeId = heatPumpNodeId;
  }

  return new MatterProtocolAdapter(adapterConfig);
}

function writeToDLQ(entry: DLQEntry): void {
  if (dlqLineCount >= MAX_DLQ_LINES) return;
  setImmediate(() => {
    try {
      mkdirSync(API_RUNTIME_DIR, { recursive: true });
      appendFileSync(DEAD_LETTER_QUEUE_PATH, `${JSON.stringify(entry)}\n`, 'utf8');
      dlqLineCount++;
    } catch {
      /* best-effort */
    }
  });
}
