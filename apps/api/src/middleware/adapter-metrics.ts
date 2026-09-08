/**
 * Per-adapter Prometheus metrics (MED-18).
 *
 * Tracks backend protocol adapter health and publishes to the in-memory Prometheus
 * registry consumed by GET /metrics and GET /api/metrics/json.
 *
 * Label convention matches the frontend Monitoring page: { adapter, protocol }.
 */

import { incrementMetric, setMetric } from './metrics.js';

export type AdapterConnectionStatus = 'connected' | 'disconnected' | 'degraded' | 'failed';

export interface AdapterMetricLabels {
  adapterId: string;
  protocol: string;
}

interface AdapterMetricState {
  adapterId: string;
  protocol: string;
  connected: AdapterConnectionStatus;
  lastPollLatencyMs: number;
  lastDataAgeSec: number;
  errorCount: number;
  datapointCount: number;
  reconnectCount: number;
  dlqCount: number;
  lastUpdatedMs: number;
}

const adapterStates = new Map<string, AdapterMetricState>();

function labelsOf(state: AdapterMetricState): Record<string, string> {
  return { adapter: state.adapterId, protocol: state.protocol };
}

function getOrCreate(adapterId: string, protocol: string): AdapterMetricState {
  let state = adapterStates.get(adapterId);
  if (!state) {
    state = {
      adapterId,
      protocol,
      connected: 'disconnected',
      lastPollLatencyMs: 0,
      lastDataAgeSec: 0,
      errorCount: 0,
      datapointCount: 0,
      reconnectCount: 0,
      dlqCount: 0,
      lastUpdatedMs: Date.now(),
    };
    adapterStates.set(adapterId, state);
  }
  return state;
}

/** Map registry run-state to a connection gauge value. */
export function connectionGaugeValue(status: AdapterConnectionStatus): number {
  return status === 'connected' || status === 'degraded' ? 1 : 0;
}

export function recordAdapterRegistration(adapterId: string, protocol: string): void {
  getOrCreate(adapterId, protocol);
}

export function recordAdapterConnection(
  adapterId: string,
  protocol: string,
  status: AdapterConnectionStatus,
): void {
  const state = getOrCreate(adapterId, protocol);
  state.connected = status;
  state.lastUpdatedMs = Date.now();
  publishAdapterState(state);
}

export function recordAdapterPollLatency(
  adapterId: string,
  protocol: string,
  latencyMs: number,
): void {
  const state = getOrCreate(adapterId, protocol);
  state.lastPollLatencyMs = Math.max(0, latencyMs);
  state.lastUpdatedMs = Date.now();
  publishAdapterState(state);
}

export function recordAdapterDatapoint(adapterId: string, protocol: string): void {
  const state = getOrCreate(adapterId, protocol);
  state.datapointCount += 1;
  state.lastDataAgeSec = 0;
  state.lastUpdatedMs = Date.now();
  publishAdapterState(state);
}

export function recordAdapterError(adapterId: string, protocol: string, errorType: string): void {
  const state = getOrCreate(adapterId, protocol);
  state.errorCount += 1;
  state.lastUpdatedMs = Date.now();
  incrementMetric('hems_adapter_errors_total', 'Total backend adapter errors', 'counter', 1, {
    adapter: adapterId,
    error_type: errorType,
  });
  publishAdapterState(state);
}

export function recordAdapterDlq(adapterId: string, protocol: string): void {
  const state = getOrCreate(adapterId, protocol);
  state.dlqCount += 1;
  state.lastUpdatedMs = Date.now();
  incrementMetric(
    'hems_adapter_dlq_total',
    'Dead-letter queue entries per backend adapter',
    'counter',
    1,
    { adapter: adapterId, protocol },
  );
  publishAdapterState(state);
}

export function recordAdapterReconnect(adapterId: string, protocol: string): void {
  const state = getOrCreate(adapterId, protocol);
  state.reconnectCount += 1;
  state.lastUpdatedMs = Date.now();
  incrementMetric(
    'hems_adapter_reconnects_total',
    'Backend adapter reconnect attempts',
    'counter',
    1,
    { adapter: adapterId, protocol },
  );
  publishAdapterState(state);
}

/** Refresh data-age gauges from adapter health snapshots. */
export function recordAdapterHealthSnapshot(
  adapterId: string,
  protocol: string,
  health: {
    status: 'healthy' | 'degraded' | 'offline';
    lastSuccessMs?: number;
    consecutiveErrors?: number;
  },
): void {
  const state = getOrCreate(adapterId, protocol);
  if (health.status === 'offline') {
    state.connected = 'disconnected';
  } else if (health.status === 'degraded' || (health.consecutiveErrors ?? 0) > 0) {
    state.connected = 'degraded';
  } else {
    state.connected = 'connected';
  }

  if (health.lastSuccessMs !== undefined && health.lastSuccessMs > 0) {
    state.lastDataAgeSec = Math.max(0, (Date.now() - health.lastSuccessMs) / 1000);
  }

  state.lastUpdatedMs = Date.now();
  publishAdapterState(state);
}

function publishAdapterState(state: AdapterMetricState): void {
  const labels = labelsOf(state);

  setMetric(
    'hems_adapter_connected',
    'Backend adapter connection status (1=connected/degraded, 0=offline)',
    'gauge',
    connectionGaugeValue(state.connected),
    labels,
  );

  setMetric(
    'hems_adapter_latency_seconds',
    'Last backend adapter poll/response latency in seconds',
    'gauge',
    state.lastPollLatencyMs / 1000,
    { adapter: state.adapterId },
  );

  setMetric(
    'hems_adapter_data_freshness_seconds',
    'Seconds since the last successful datapoint from this backend adapter',
    'gauge',
    state.lastDataAgeSec,
    { adapter: state.adapterId },
  );

  setMetric(
    'hems_adapter_data_updates_total',
    'Total datapoints emitted by this backend adapter',
    'counter',
    state.datapointCount,
    { adapter: state.adapterId, protocol: state.protocol },
  );
}

/** Publish all known adapter states (e.g. on metrics scrape). */
export function publishAllAdapterMetrics(): void {
  for (const state of adapterStates.values()) {
    publishAdapterState(state);
  }
}

/** Test helper — reset in-memory adapter metric state. */
export function resetAdapterMetricsForTests(): void {
  adapterStates.clear();
}

/** Test helper — read internal state. */
export function getAdapterMetricStateForTests(adapterId: string): AdapterMetricState | undefined {
  return adapterStates.get(adapterId);
}
