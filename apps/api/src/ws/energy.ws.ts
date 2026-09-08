import {
  type EnergyData,
  EnergyDataSchema,
  sanitizeObjectStrings,
  WSCommandSchema,
  type WSCommandType,
} from '@nexus-hems/shared-types';
import type { IncomingMessage } from 'http';
import type { WebSocket, WebSocketServer } from 'ws';
import { getEffectiveAdapterMode } from '../config/adapter-mode.js';
import { isReadOnlyMode } from '../config/read-only-mode.js';
import { isProductionRuntime } from '../config/runtime-env.js';
import { logger } from '../core/logger.js';
import { type CommandOutcome, writeCommandAuditEntry } from '../data/command-audit.js';
import { isWsIdempotencyReplay, markWsIdempotencyAccepted } from '../data/idempotency-cache.js';
import { applyMockCommandMutation } from '../data/mock-command-mutation.js';
import { mockData, updateMockData } from '../data/mock-data.js';
import { type AuthenticatedClient, authenticateWS, type JWTScope } from '../middleware/auth.js';
import { setMetric, updateServerMetrics, wsMessageCount } from '../middleware/metrics.js';
import { dispatchProtocolCommand } from '../protocols/ProtocolCommandRouter.js';
import type { LiveEnergyAggregator } from '../services/LiveEnergyAggregator.js';
import { wsTicketStore } from '../services/ws-ticket-store.js';
import { handleEebusProxyConnection, isEebusProxyPath } from './eebus-proxy.ws.js';
import { handleOcppProxyConnection, isOcppProxyPath } from './ocpp-proxy.ws.js';
import {
  getMaxConnectionsPerIP,
  getWSClientIP,
  releaseConnection,
  tryAcquireConnection,
} from './ws-conn-limit.js';
import { getRequiredScopeForCommand, isScopeAuthorized } from './ws-scope.js';

// Zombie connection detection: ping every 30 s, terminate if no pong received
const HEARTBEAT_INTERVAL_MS = 30_000;

// HIGH-06: Configurable WS command rate limit (default 30 cmd/min)
function getWsCmdRateLimit(): number {
  const parsed = Number(process.env.WS_RATE_LIMIT);
  return parsed > 0 ? parsed : 30;
}

// HIGH-11: Scope requirements for every WS command type — see ws-scope.ts

/** @internal Exported for unit tests (energy-ws.test.ts). */
export function validateWSCommand(parsed: unknown): { valid: boolean; error?: string } {
  const result = WSCommandSchema.safeParse(parsed);
  if (!result.success) {
    const firstIssue = result.error.issues[0];
    return { valid: false, error: firstIssue?.message ?? 'Invalid command' };
  }
  return { valid: true };
}

// HIGH-06/HIGH-07: Per-IP connection limiting now lives in ./ws-conn-limit.ts so
// the OCPP/EEBUS proxy paths share the same cap. See that module for rationale.

/** Audit a command outcome to the append-only NDJSON log. Never throws. */
function auditCommand(
  wsAuthMap: WeakMap<WebSocket, AuthenticatedClient>,
  ws: WebSocket,
  commandType: string,
  value: number | string | boolean | null,
  outcome: CommandOutcome,
  reason?: string,
): void {
  const client = wsAuthMap.get(ws);
  writeCommandAuditEntry({
    ts: Date.now(),
    clientId: client?.clientId ?? 'anonymous',
    scope: client?.scope ?? 'read',
    commandType,
    value,
    outcome,
    reason,
    mode: getEffectiveAdapterMode(),
  });
}

/**
 * Choose the broadcast source (HIGH-17): the live aggregator snapshot when the
 * effective adapter mode is `live` AND fresh live data exists, otherwise the mock
 * stream. This keeps mock/demo deployments byte-for-byte unchanged and only
 * surfaces real backend-adapter data once it is actually flowing. See ADR-018.
 */
export function resolveBroadcastData(liveAggregator?: LiveEnergyAggregator): EnergyData {
  if (liveAggregator && getEffectiveAdapterMode() === 'live' && liveAggregator.hasLiveData()) {
    // R2: the live snapshot is folded from external adapter datapoints, so
    // validate it against the wire contract before it can reach any client.
    // A malformed snapshot falls back to the mock stream rather than shipping
    // invalid data (fail-safe; mockData is internally generated and trusted).
    const parsed = EnergyDataSchema.safeParse(liveAggregator.getSnapshot());
    if (parsed.success) return parsed.data;
    logger.warn('Live snapshot failed EnergyData validation — falling back to mock', {
      issues: parsed.error.issues.length,
    });
    return mockData;
  }
  return mockData;
}

export function setupWebSocket(wss: WebSocketServer, liveAggregator?: LiveEnergyAggregator): void {
  const requireWSAuth = isProductionRuntime();
  const wsAuthMap = new WeakMap<WebSocket, AuthenticatedClient>();
  const wsRateLimits = new WeakMap<WebSocket, { count: number; resetAt: number }>();
  /** Per-client subscribed metric keys. Empty set = send all metrics (backward-compatible). */
  const wsSubscriptions = new WeakMap<WebSocket, Set<string>>();
  // If the next ping cycle finds alive=false the connection is terminated.
  const wsAlive = new WeakMap<WebSocket, boolean>();

  const heartbeat = setInterval(() => {
    wss.clients.forEach((client) => {
      if (wsAlive.get(client) === false) {
        // No pong received since the last ping → zombie, hard-close
        console.warn('[WS] Terminating zombie connection (no pong)');
        client.terminate();
        return;
      }
      wsAlive.set(client, false);
      try {
        client.ping();
      } catch {
        // Client already gone from the OS layer — terminate cleanly
        client.terminate();
      }
    });
  }, HEARTBEAT_INTERVAL_MS);

  // Release the interval so Node can exit cleanly
  wss.on('close', () => clearInterval(heartbeat));

  // Update mock data and broadcast every 2 seconds
  setInterval(() => {
    updateMockData();

    // HIGH-17: broadcast live adapter data in live mode, mock otherwise.
    const broadcastData = resolveBroadcastData(liveAggregator);

    updateServerMetrics(broadcastData, wss.clients.size);
    setMetric(
      'hems_websocket_messages_total',
      'Total WebSocket messages received',
      'counter',
      wsMessageCount.inbound,
      { direction: 'inbound' },
    );
    setMetric(
      'hems_websocket_messages_total',
      'Total WebSocket messages received',
      'counter',
      wsMessageCount.outbound,
      { direction: 'outbound' },
    );

    wss.clients.forEach((client) => {
      if (client.readyState !== 1) return;

      const subscribed = wsSubscriptions.get(client);
      // If subscribed is empty (no SUBSCRIBE sent), send full payload (backward-compatible)
      const payload =
        subscribed && subscribed.size > 0
          ? filterMockData(broadcastData as unknown as Record<string, unknown>, subscribed)
          : broadcastData;

      safeSend(client, { type: 'ENERGY_UPDATE', data: payload });
      wsMessageCount.outbound++;
    });
  }, 2000);

  wss.on('connection', async (ws: WebSocket, req: IncomingMessage) => {
    if (isEebusProxyPath(req)) {
      await handleEebusProxyConnection(ws, req, requireWSAuth);
      return;
    }

    if (isOcppProxyPath(req)) {
      await handleOcppProxyConnection(ws, req, requireWSAuth);
      return;
    }

    // HIGH-07: Per-IP connection limit (shared cap across all ws paths)
    const clientIP = getWSClientIP(req);
    if (!tryAcquireConnection(clientIP)) {
      ws.close(4429, 'Too many connections from this IP');
      console.warn(
        `[WS] Rejected connection from ${clientIP} (limit: ${getMaxConnectionsPerIP()})`,
      );
      return;
    }

    // CRIT-02 + HIGH-04: Authenticate and extract scope via ticket or JWT
    const authResult = await authenticateWS(req, wsTicketStore);

    if (requireWSAuth && !authResult) {
      ws.close(4001, 'Authentication required');
      // Clean up per-IP counter on failed auth
      releaseConnection(clientIP);
      console.warn('[WS] Rejected unauthenticated connection');
      return;
    }

    wsAuthMap.set(
      ws,
      authResult || {
        clientId: 'anonymous',
        scope: 'read' as JWTScope, // anonymous gets read-only
        authenticated: false,
        connectedAt: Date.now(),
      },
    );

    // Mark connection alive; update on every pong
    wsAlive.set(ws, true);
    ws.on('pong', () => wsAlive.set(ws, true));

    // Initialize empty subscription set (= receive all metrics)
    wsSubscriptions.set(ws, new Set<string>());

    const clientInfo = authResult
      ? `authenticated:${authResult.clientId}(scope:${authResult.scope})`
      : 'anonymous(read)';
    console.log(`[WS] Client connected (${clientInfo}) from ${clientIP}`);

    // Send initial data (live snapshot in live mode, mock otherwise — HIGH-17)
    safeSend(ws, { type: 'ENERGY_UPDATE', data: resolveBroadcastData(liveAggregator) });

    ws.on('message', (message) => {
      wsMessageCount.inbound++;
      if (!checkWsRateLimit(ws, wsRateLimits)) {
        auditCommand(wsAuthMap, ws, 'unknown', null, 'rejected_ratelimit', 'rate limit exceeded');
        ws.send(
          JSON.stringify(
            sanitizeOutgoingWsPayload({
              type: 'ERROR',
              error: `Rate limit exceeded (${getWsCmdRateLimit()} cmd/min)`,
            }),
          ),
        );
        ws.close(4429, 'Rate limit exceeded');
        return;
      }
      try {
        const parsed = JSON.parse(message.toString());
        void handleWsCommand(ws, parsed, wsSubscriptions, wsAuthMap, wss, liveAggregator);
      } catch (e) {
        console.error('Failed to parse message', e);
      }
    });

    ws.on('close', () => {
      const info = wsAuthMap.get(ws);
      console.log(`[WS] Client disconnected (${info?.clientId || 'unknown'})`);
      // HIGH-07: Clean up per-IP connection count
      releaseConnection(clientIP);
    });
  });
}

// ---------------------------------------------------------------------------
// Message handler helpers (extracted to keep cognitive complexity ≤ 25)
// ---------------------------------------------------------------------------

export function checkWsRateLimit(
  ws: WebSocket,
  wsRateLimits: WeakMap<WebSocket, { count: number; resetAt: number }>,
): boolean {
  const now = Date.now();
  let rl = wsRateLimits.get(ws);
  if (!rl || now > rl.resetAt) {
    rl = { count: 0, resetAt: now + 60_000 };
    wsRateLimits.set(ws, rl);
  }
  rl.count++;
  return rl.count <= getWsCmdRateLimit();
}

/** @internal Exported for unit tests (energy-ws.test.ts). */
export function handleSubscribeCommand(
  ws: WebSocket,
  parsed: Record<string, unknown>,
  wsSubscriptions: WeakMap<WebSocket, Set<string>>,
): boolean {
  if (parsed.type !== 'SUBSCRIBE') return false;
  const metrics = parsed.metrics;
  if (!Array.isArray(metrics) || !metrics.every((m) => typeof m === 'string')) return false;
  const sub = wsSubscriptions.get(ws) ?? new Set<string>();
  sub.clear();
  for (const m of metrics as string[]) sub.add(m);
  wsSubscriptions.set(ws, sub);
  safeSend(ws, { type: 'SUBSCRIBE_ACK', metrics: [...sub] });
  return true;
}

/** @internal Exported for unit tests (energy-ws.test.ts). */
export function checkScopeAuthorization(
  ws: WebSocket,
  parsedType: string,
  wsAuthMap: WeakMap<WebSocket, AuthenticatedClient>,
): boolean {
  const client = wsAuthMap.get(ws);
  const clientScope: JWTScope = client?.scope ?? 'read';

  if (isScopeAuthorized(clientScope, parsedType)) return true;

  const required = getRequiredScopeForCommand(parsedType) ?? 'readwrite';
  ws.send(
    JSON.stringify(
      sanitizeOutgoingWsPayload({
        type: 'ERROR',
        error:
          required === 'admin'
            ? 'Insufficient scope: admin required for grid limit commands'
            : 'Insufficient scope: readwrite required for hardware commands',
      }),
    ),
  );
  return false;
}

/** @internal Exported for unit tests (energy-ws.test.ts). */
export async function handleWsCommand(
  ws: WebSocket,
  parsed: unknown,
  wsSubscriptions: WeakMap<WebSocket, Set<string>>,
  wsAuthMap: WeakMap<WebSocket, AuthenticatedClient>,
  wss: WebSocketServer,
  liveAggregator?: LiveEnergyAggregator,
): Promise<void> {
  const validation = validateWSCommand(parsed);
  if (!validation.valid) {
    // Handle SUBSCRIBE separately — it's not in WSCommandSchema (not audited as a command)
    if (parsed !== null && typeof parsed === 'object' && 'type' in parsed) {
      if (handleSubscribeCommand(ws, parsed as Record<string, unknown>, wsSubscriptions)) return;
    }
    const attemptedType =
      parsed !== null && typeof parsed === 'object' && 'type' in parsed
        ? String((parsed as Record<string, unknown>).type)
        : 'unknown';
    auditCommand(wsAuthMap, ws, attemptedType, null, 'rejected_validation', validation.error);
    safeSend(ws, { type: 'ERROR', error: validation.error });
    return;
  }

  // CRIT-02: Enforce scope-based command authorization
  const cmd = parsed as { type: string; value?: number; idempotencyKey?: string };
  if (!checkScopeAuthorization(ws, cmd.type, wsAuthMap)) {
    auditCommand(
      wsAuthMap,
      ws,
      cmd.type,
      cmd.value ?? null,
      'rejected_scope',
      'insufficient scope',
    );
    return;
  }

  // SAF-01: Read-Only Mode blocks all hardware control commands
  if (isReadOnlyMode()) {
    auditCommand(
      wsAuthMap,
      ws,
      cmd.type,
      cmd.value ?? null,
      'rejected_readonly',
      'READ_ONLY_MODE=true blocks all control commands',
    );
    safeSend(ws, {
      type: 'ERROR',
      error: 'System is in read-only mode — control commands are disabled',
    });
    return;
  }

  const commandValue = cmd.value ?? 0;
  const mode = getEffectiveAdapterMode();
  const idempotencyKey = cmd.idempotencyKey?.trim();

  if (idempotencyKey && (await isWsIdempotencyReplay(idempotencyKey))) {
    const broadcastData = resolveBroadcastData(liveAggregator);
    safeSend(ws, { type: 'ENERGY_UPDATE', data: broadcastData });
    return;
  }

  if (mode === 'live') {
    await dispatchLiveCommand(
      ws,
      { type: cmd.type as WSCommandType, value: commandValue },
      wsAuthMap,
      wss,
      liveAggregator,
      idempotencyKey,
    );
    return;
  }

  applyMockCommandMutation(cmd);
  auditCommand(wsAuthMap, ws, cmd.type, commandValue, 'accepted');
  if (idempotencyKey) await markWsIdempotencyAccepted(idempotencyKey);

  mockData.gridPower =
    mockData.houseLoad +
    mockData.batteryPower +
    mockData.evPower +
    mockData.heatPumpPower -
    mockData.pvPower;
  const broadcastData = resolveBroadcastData(liveAggregator);
  wss.clients.forEach((c) => {
    if (c.readyState === 1) safeSend(c, { type: 'ENERGY_UPDATE', data: broadcastData });
  });
}

async function dispatchLiveCommand(
  ws: WebSocket,
  command: { type: WSCommandType; value: number | string | boolean },
  wsAuthMap: WeakMap<WebSocket, AuthenticatedClient>,
  wss: WebSocketServer,
  liveAggregator?: LiveEnergyAggregator,
  idempotencyKey?: string,
): Promise<void> {
  const result = await dispatchProtocolCommand(command);

  if (!result.handled) {
    auditCommand(
      wsAuthMap,
      ws,
      command.type,
      command.value,
      'rejected_validation',
      result.error ?? 'No live adapter handles this command',
    );
    safeSend(ws, {
      type: 'ERROR',
      error: result.error ?? 'No live adapter handles this command',
    });
    return;
  }

  if (!result.success) {
    auditCommand(
      wsAuthMap,
      ws,
      command.type,
      command.value,
      'rejected_dispatch',
      result.error ?? 'Command failed',
    );
    safeSend(ws, { type: 'ERROR', error: result.error ?? 'Command failed' });
    return;
  }

  auditCommand(wsAuthMap, ws, command.type, command.value, 'accepted');
  if (idempotencyKey) await markWsIdempotencyAccepted(idempotencyKey);

  const broadcastData = resolveBroadcastData(liveAggregator);
  wss.clients.forEach((c) => {
    if (c.readyState === 1) safeSend(c, { type: 'ENERGY_UPDATE', data: broadcastData });
  });
}

export function sanitizeOutgoingWsPayload(payload: unknown): unknown {
  return sanitizeObjectStrings(payload, 160);
}

function safeSend(ws: WebSocket, payload: unknown): void {
  ws.send(JSON.stringify(sanitizeOutgoingWsPayload(payload)));
}

// ---------------------------------------------------------------------------
// Subscription filter helper
// ---------------------------------------------------------------------------

/**
 * Return only the fields of mockData that the client subscribed to.
 * If the client subscribed to e.g. ['pvPower', 'batteryPower'], only those
 * keys are included in the broadcast payload.
 */
/** @internal Exported for unit tests (energy-ws.test.ts). */
export function filterMockData(
  data: Record<string, unknown>,
  subscribed: Set<string>,
): Record<string, unknown> {
  const filtered: Record<string, unknown> = {};
  for (const key of subscribed) {
    if (Object.hasOwn(data, key)) {
      filtered[key] = data[key];
    }
  }
  return filtered;
}
