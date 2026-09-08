/**
 * Prometheus Metrics Exporter for HEMS Dashboard
 *
 * Exposes energy system metrics in Prometheus exposition format
 * for scraping by a Prometheus server and visualization in Grafana.
 *
 * Metric Naming: follows Prometheus conventions (snake_case, unit suffixes)
 * Labels: adapter, device_type, phase, location
 *
 * Grafana Dashboard Template ID: nexus-hems-energy-overview
 *
 * Endpoints (server-side):
 *   GET /metrics            — Prometheus scrape endpoint
 *   GET /api/metrics/json   — JSON metrics for in-app dashboard
 *
 * Client-side:
 *   MetricsCollector        — Collects & buffers metrics from adapters
 *   useMetrics()            — React hook for live metric display
 */

import type { EnergyData } from '../types';

// ─── Metric Types ───────────────────────────────────────────────────

export type MetricType = 'gauge' | 'counter' | 'histogram' | 'summary';

export interface MetricDefinition {
  name: string;
  help: string;
  type: MetricType;
  unit?: string;
  labels?: string[];
}

export interface MetricSample {
  name: string;
  labels: Record<string, string>;
  value: number;
  timestamp: number;
}

export interface MetricFamily {
  definition: MetricDefinition;
  samples: MetricSample[];
}

export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  uptime: number;
  adapters: AdapterHealth[];
  metrics: {
    totalSamples: number;
    scrapeInterval: number;
    lastScrape: number;
  };
}

export interface AdapterHealth {
  id: string;
  name: string;
  status: 'connected' | 'disconnected' | 'error';
  lastDataReceived: number;
  errorCount: number;
  latencyMs: number;
}

// ─── Metric Definitions (Prometheus naming convention) ──────────────

export const HEMS_METRICS: MetricDefinition[] = [
  // Power metrics (instantaneous)
  {
    name: 'hems_pv_power_watts',
    help: 'Current PV generation power in watts',
    type: 'gauge',
    unit: 'watts',
    labels: ['inverter'],
  },
  {
    name: 'hems_battery_power_watts',
    help: 'Battery power (positive=charging, negative=discharging)',
    type: 'gauge',
    unit: 'watts',
    labels: ['battery_id'],
  },
  {
    name: 'hems_grid_power_watts',
    help: 'Grid power (positive=import, negative=export)',
    type: 'gauge',
    unit: 'watts',
    labels: ['phase'],
  },
  {
    name: 'hems_house_load_watts',
    help: 'Total household consumption in watts',
    type: 'gauge',
    unit: 'watts',
  },
  {
    name: 'hems_ev_charger_power_watts',
    help: 'EV charger power in watts',
    type: 'gauge',
    unit: 'watts',
    labels: ['charger_id'],
  },
  {
    name: 'hems_heat_pump_power_watts',
    help: 'Heat pump power consumption in watts',
    type: 'gauge',
    unit: 'watts',
  },

  // State of charge
  {
    name: 'hems_battery_soc_percent',
    help: 'Battery state of charge',
    type: 'gauge',
    unit: 'percent',
    labels: ['battery_id'],
  },
  {
    name: 'hems_ev_soc_percent',
    help: 'EV state of charge',
    type: 'gauge',
    unit: 'percent',
    labels: ['charger_id'],
  },

  // Voltage / Frequency
  {
    name: 'hems_grid_voltage_volts',
    help: 'Grid voltage',
    type: 'gauge',
    unit: 'volts',
    labels: ['phase'],
  },
  {
    name: 'hems_battery_voltage_volts',
    help: 'Battery voltage',
    type: 'gauge',
    unit: 'volts',
    labels: ['battery_id'],
  },
  { name: 'hems_grid_frequency_hertz', help: 'Grid frequency', type: 'gauge', unit: 'hertz' },

  // Energy counters (cumulative)
  { name: 'hems_pv_yield_today_kwh', help: 'PV yield today in kWh', type: 'counter', unit: 'kwh' },
  {
    name: 'hems_grid_import_kwh_total',
    help: 'Total grid energy imported',
    type: 'counter',
    unit: 'kwh',
  },
  {
    name: 'hems_grid_export_kwh_total',
    help: 'Total grid energy exported',
    type: 'counter',
    unit: 'kwh',
  },
  {
    name: 'hems_self_consumption_kwh_total',
    help: 'Total self-consumed energy',
    type: 'counter',
    unit: 'kwh',
  },

  // Tariff / Price
  {
    name: 'hems_tariff_price_eur_per_kwh',
    help: 'Current electricity tariff price',
    type: 'gauge',
    unit: 'eur_per_kwh',
    labels: ['provider'],
  },
  {
    name: 'hems_tariff_co2_grams_per_kwh',
    help: 'Current grid CO2 intensity',
    type: 'gauge',
    unit: 'grams_per_kwh',
  },

  // System
  {
    name: 'hems_adapter_connected',
    help: 'Adapter connection status (1=connected, 0=disconnected)',
    type: 'gauge',
    labels: ['adapter', 'protocol'],
  },
  {
    name: 'hems_adapter_errors_total',
    help: 'Total adapter errors',
    type: 'counter',
    labels: ['adapter', 'error_type'],
  },
  {
    name: 'hems_adapter_latency_seconds',
    help: 'Adapter response latency',
    type: 'histogram',
    unit: 'seconds',
    labels: ['adapter'],
  },
  {
    name: 'hems_websocket_messages_total',
    help: 'Total WebSocket messages received',
    type: 'counter',
    labels: ['direction'],
  },
  {
    name: 'hems_uptime_seconds',
    help: 'Dashboard uptime in seconds',
    type: 'counter',
    unit: 'seconds',
  },

  // Load Control (§14a EnWG)
  {
    name: 'hems_load_control_limit_watts',
    help: 'Active load control limit (§14a EnWG)',
    type: 'gauge',
    unit: 'watts',
    labels: ['limit_type'],
  },
  { name: 'hems_load_control_active', help: 'Whether load control is active (1/0)', type: 'gauge' },

  // SG Ready
  { name: 'hems_sg_ready_state', help: 'SG Ready operating state (1-4)', type: 'gauge' },

  // Optimizer
  {
    name: 'hems_optimizer_savings_eur',
    help: 'Estimated optimizer savings in EUR',
    type: 'gauge',
    unit: 'eur',
  },
  {
    name: 'hems_optimizer_recommendations_total',
    help: 'Total optimizer recommendations generated',
    type: 'counter',
  },

  // Command Safety & Audit
  {
    name: 'hems_commands_total',
    help: 'Total hardware commands sent',
    type: 'counter',
    labels: ['command_type', 'status'],
  },
  {
    name: 'hems_commands_rejected_total',
    help: 'Total commands rejected by validation or rate limiting',
    type: 'counter',
    labels: ['command_type', 'reason'],
  },
  {
    name: 'hems_emergency_stops_total',
    help: 'Total emergency stop activations',
    type: 'counter',
  },
  {
    name: 'hems_circuit_breaker_state',
    help: 'Circuit breaker state per adapter (0=closed, 1=open, 2=half-open)',
    type: 'gauge',
    labels: ['adapter'],
  },

  // ── Per-Adapter Performance (Prometheus-Exporter) ─────────────
  {
    name: 'hems_adapter_commands_per_second',
    help: 'Commands per second rate per adapter',
    type: 'gauge',
    labels: ['adapter', 'protocol'],
  },
  {
    name: 'hems_adapter_commands_total',
    help: 'Total commands sent per adapter',
    type: 'counter',
    labels: ['adapter', 'protocol', 'status'],
  },
  {
    name: 'hems_adapter_latency_histogram_bucket',
    help: 'Adapter response latency histogram (seconds)',
    type: 'histogram',
    unit: 'seconds',
    labels: ['adapter', 'le'],
  },
  {
    name: 'hems_adapter_data_updates_total',
    help: 'Total data updates received per adapter',
    type: 'counter',
    labels: ['adapter', 'protocol'],
  },
  {
    name: 'hems_adapter_reconnects_total',
    help: 'Total reconnect attempts per adapter',
    type: 'counter',
    labels: ['adapter'],
  },
  {
    name: 'hems_adapter_data_freshness_seconds',
    help: 'Seconds since last data update per adapter',
    type: 'gauge',
    unit: 'seconds',
    labels: ['adapter'],
  },
  {
    name: 'hems_adapter_error_rate',
    help: 'Error rate per adapter (0.0–1.0)',
    type: 'gauge',
    labels: ['adapter'],
  },

  // ── Frontend Error Tracking ──────────────────────────────────────
  {
    name: 'hems_frontend_errors_total',
    help: 'Total frontend JavaScript errors',
    type: 'counter',
    labels: ['source', 'severity'],
  },
  {
    name: 'hems_error_boundary_catches_total',
    help: 'Total React ErrorBoundary catches',
    type: 'counter',
    labels: ['component'],
  },
  {
    name: 'hems_sentry_events_total',
    help: 'Total events sent to Sentry',
    type: 'counter',
    labels: ['level'],
  },
];

// ─── Metrics Collector (Client-side) ────────────────────────────────

export class MetricsCollector {
  private readonly samples: Map<string, MetricSample[]> = new Map();
  private readonly startTime = Date.now();
  private readonly messageCount = { inbound: 0, outbound: 0 };
  private readonly adapterHealth: Map<string, AdapterHealth> = new Map();
  private readonly listeners: Array<(metrics: MetricFamily[]) => void> = [];
  private collectInterval: ReturnType<typeof setInterval> | null = null;

  /**
   * Start periodic metric collection
   */
  start(intervalMs: number = 5000): void {
    if (this.collectInterval) return;
    this.collectInterval = setInterval(() => {
      this.notifyListeners();
    }, intervalMs);
  }

  /**
   * Stop metric collection
   */
  stop(): void {
    if (this.collectInterval) {
      clearInterval(this.collectInterval);
      this.collectInterval = null;
    }
  }

  /**
   * Subscribe to metric updates
   */
  onMetrics(callback: (metrics: MetricFamily[]) => void): () => void {
    this.listeners.push(callback);
    return () => {
      const idx = this.listeners.indexOf(callback);
      if (idx !== -1) this.listeners.splice(idx, 1);
    };
  }

  /**
   * Record energy data snapshot as Prometheus metrics
   */
  recordEnergyData(data: EnergyData, tariffProvider: string = 'tibber'): void {
    const ts = Date.now();

    this.setSample('hems_pv_power_watts', data.pvPower, ts, { inverter: 'primary' });
    this.setSample('hems_battery_power_watts', data.batteryPower, ts, { battery_id: 'main' });
    this.setSample('hems_grid_power_watts', data.gridPower, ts, { phase: 'total' });
    this.setSample('hems_house_load_watts', data.houseLoad, ts);
    this.setSample('hems_ev_charger_power_watts', data.evPower, ts, { charger_id: 'wallbox-1' });
    this.setSample('hems_heat_pump_power_watts', data.heatPumpPower, ts);

    this.setSample('hems_battery_soc_percent', data.batterySoC, ts, { battery_id: 'main' });
    this.setSample('hems_grid_voltage_volts', data.gridVoltage, ts, { phase: 'L1' });
    this.setSample('hems_battery_voltage_volts', data.batteryVoltage, ts, { battery_id: 'main' });
    this.setSample('hems_pv_yield_today_kwh', data.pvYieldToday, ts);
    this.setSample('hems_tariff_price_eur_per_kwh', data.priceCurrent, ts, {
      provider: tariffProvider,
    });

    this.setSample('hems_uptime_seconds', (ts - this.startTime) / 1000, ts);
  }

  /**
   * Record adapter health status
   */
  recordAdapterStatus(
    adapterId: string,
    name: string,
    connected: boolean,
    latencyMs: number = 0,
  ): void {
    const ts = Date.now();
    const existing = this.adapterHealth.get(adapterId);

    this.adapterHealth.set(adapterId, {
      id: adapterId,
      name,
      status: connected ? 'connected' : 'disconnected',
      lastDataReceived: connected ? ts : (existing?.lastDataReceived ?? 0),
      errorCount: existing?.errorCount ?? 0,
      latencyMs,
    });

    this.setSample('hems_adapter_connected', connected ? 1 : 0, ts, {
      adapter: adapterId,
      protocol: this.getProtocol(adapterId),
    });
    this.setSample('hems_adapter_latency_seconds', latencyMs / 1000, ts, { adapter: adapterId });
  }

  /**
   * Record adapter error
   */
  recordAdapterError(adapterId: string, errorType: string): void {
    const health = this.adapterHealth.get(adapterId);
    if (health) {
      health.errorCount++;
      health.status = 'error';
    }

    this.incrementCounter('hems_adapter_errors_total', {
      adapter: adapterId,
      error_type: errorType,
    });
  }

  /**
   * Record WebSocket message
   */
  recordMessage(direction: 'inbound' | 'outbound'): void {
    if (direction === 'inbound') this.messageCount.inbound++;
    else this.messageCount.outbound++;

    this.incrementCounter('hems_websocket_messages_total', { direction });
  }

  /**
   * Record load control state
   */
  recordLoadControl(limitWatts: number, active: boolean): void {
    const ts = Date.now();
    this.setSample('hems_load_control_limit_watts', limitWatts, ts, { limit_type: '14a_enwg' });
    this.setSample('hems_load_control_active', active ? 1 : 0, ts);
  }

  /**
   * Record SG Ready state
   */
  recordSGReadyState(state: 1 | 2 | 3 | 4): void {
    this.setSample('hems_sg_ready_state', state, Date.now());
  }

  /**
   * Record a hardware command execution (IndexedDB audit + Prometheus counter)
   */
  recordCommand(
    commandType: string,
    status: 'executed' | 'failed' | 'rejected' | 'emergency_stop',
  ): void {
    this.incrementCounter('hems_commands_total', { command_type: commandType, status });
  }

  /**
   * Record a rejected command with reason
   */
  recordCommandRejected(commandType: string, reason: string): void {
    this.incrementCounter('hems_commands_rejected_total', { command_type: commandType, reason });
  }

  /**
   * Record an emergency stop activation
   */
  recordEmergencyStop(): void {
    this.incrementCounter('hems_emergency_stops_total');
  }

  /**
   * Record circuit breaker state change
   */
  recordCircuitBreakerState(adapterId: string, state: 'closed' | 'open' | 'half-open'): void {
    const stateMap = { closed: 0, open: 1, 'half-open': 2 };
    this.setSample('hems_circuit_breaker_state', stateMap[state], Date.now(), {
      adapter: adapterId,
    });
  }

  /**
   * Record a frontend error (ErrorBoundary, unhandled rejection, etc.)
   */
  recordFrontendError(source: string, severity: 'error' | 'fatal' = 'error'): void {
    this.incrementCounter('hems_frontend_errors_total', { source, severity });
  }

  /**
   * Record an ErrorBoundary catch
   */
  recordErrorBoundaryCatch(component: string = 'unknown'): void {
    this.incrementCounter('hems_error_boundary_catches_total', { component });
  }

  /**
   * Record a Sentry event dispatch
   */
  recordSentryEvent(level: string): void {
    this.incrementCounter('hems_sentry_events_total', { level });
  }

  /**
   * Record per-adapter command execution
   */
  recordAdapterCommand(adapterId: string, protocol: string, status: 'success' | 'error'): void {
    const labels = { adapter_id: adapterId, protocol, status };
    this.incrementCounter('hems_adapter_commands_total', labels);
  }

  /**
   * Record per-adapter latency (histogram bucket style)
   */
  recordAdapterLatency(adapterId: string, protocol: string, latencyMs: number): void {
    const ts = Date.now();
    this.setSample('hems_adapter_latency_histogram_bucket', latencyMs, ts, {
      adapter_id: adapterId,
      protocol,
      le: String(latencyMs),
    });
  }

  /**
   * Record per-adapter data update
   */
  recordAdapterDataUpdate(adapterId: string, protocol: string): void {
    this.incrementCounter('hems_adapter_data_updates_total', {
      adapter_id: adapterId,
      protocol,
    });
  }

  /**
   * Record per-adapter reconnect
   */
  recordAdapterReconnect(adapterId: string, protocol: string): void {
    this.incrementCounter('hems_adapter_reconnects_total', {
      adapter_id: adapterId,
      protocol,
    });
  }

  /**
   * Record per-adapter data freshness (seconds since last update)
   */
  recordAdapterDataFreshness(adapterId: string, protocol: string, ageSec: number): void {
    this.setSample('hems_adapter_data_freshness_seconds', ageSec, Date.now(), {
      adapter_id: adapterId,
      protocol,
    });
  }

  /**
   * Record per-adapter error rate (0..1)
   */
  recordAdapterErrorRate(adapterId: string, protocol: string, rate: number): void {
    this.setSample('hems_adapter_error_rate', rate, Date.now(), {
      adapter_id: adapterId,
      protocol,
    });
  }

  /**
   * Record per-adapter commands per second (gauge)
   */
  recordAdapterCommandRate(adapterId: string, protocol: string, rate: number): void {
    this.setSample('hems_adapter_commands_per_second', rate, Date.now(), {
      adapter_id: adapterId,
      protocol,
    });
  }

  /**
   * Get current health status
   */
  getHealthStatus(): HealthStatus {
    const adapters = Array.from(this.adapterHealth.values());
    const hasError = adapters.some((a) => a.status === 'error');
    const allConnected = adapters.every((a) => a.status === 'connected');

    return {
      status: hasError ? 'unhealthy' : allConnected ? 'healthy' : 'degraded',
      uptime: (Date.now() - this.startTime) / 1000,
      adapters,
      metrics: {
        totalSamples: this.getTotalSampleCount(),
        scrapeInterval: 5000,
        lastScrape: Date.now(),
      },
    };
  }

  /**
   * Export all metrics in Prometheus exposition format
   */
  toPrometheusText(): string {
    const lines: string[] = [];

    for (const def of HEMS_METRICS) {
      const samples = this.samples.get(def.name);
      if (!samples || samples.length === 0) continue;

      lines.push(`# HELP ${def.name} ${def.help}`);
      lines.push(`# TYPE ${def.name} ${def.type}`);

      for (const sample of samples) {
        const labelStr = this.formatLabels(sample.labels);
        lines.push(`${sample.name}${labelStr} ${sample.value} ${sample.timestamp}`);
      }
      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * Export all metrics as JSON (for in-app visualization)
   */
  toJSON(): MetricFamily[] {
    const families: MetricFamily[] = [];

    for (const def of HEMS_METRICS) {
      const samples = this.samples.get(def.name);
      if (!samples || samples.length === 0) continue;
      families.push({ definition: def, samples: [...samples] });
    }

    return families;
  }

  /**
   * Get a specific metric's latest value
   */
  getMetricValue(name: string, labels?: Record<string, string>): number | null {
    const samples = this.samples.get(name);
    if (!samples) return null;

    if (!labels) return samples[samples.length - 1]?.value ?? null;

    const match = samples.find((s) => Object.entries(labels).every(([k, v]) => s.labels[k] === v));
    return match?.value ?? null;
  }

  /**
   * Get time-series history for a metric (last N samples)
   */
  getMetricHistory(name: string, maxSamples: number = 60): MetricSample[] {
    const samples = this.samples.get(name);
    if (!samples) return [];
    return samples.slice(-maxSamples);
  }

  // ─── Internal helpers ─────────────────────────────────────────────

  private setSample(
    name: string,
    value: number,
    timestamp: number,
    labels: Record<string, string> = {},
  ): void {
    if (!this.samples.has(name)) {
      this.samples.set(name, []);
    }

    const arr = this.samples.get(name)!;

    // Find existing sample with same labels
    const existingIdx = arr.findIndex(
      (s) =>
        Object.keys(labels).length === Object.keys(s.labels).length &&
        Object.entries(labels).every(([k, v]) => s.labels[k] === v),
    );

    const sample: MetricSample = { name, labels, value, timestamp };

    if (existingIdx >= 0) {
      arr[existingIdx] = sample;
    } else {
      arr.push(sample);
    }

    // Keep max 1000 samples per metric for history
    if (arr.length > 1000) {
      arr.splice(0, arr.length - 1000);
    }
  }

  private incrementCounter(name: string, labels: Record<string, string> = {}): void {
    const current = this.getMetricValue(name, labels) ?? 0;
    this.setSample(name, current + 1, Date.now(), labels);
  }

  private formatLabels(labels: Record<string, string>): string {
    const entries = Object.entries(labels);
    if (entries.length === 0) return '';
    return `{${entries.map(([k, v]) => `${k}="${v}"`).join(',')}}`;
  }

  private getProtocol(adapterId: string): string {
    const protocols: Record<string, string> = {
      'victron-mqtt': 'MQTT',
      'modbus-sunspec': 'Modbus TCP',
      knx: 'KNXnet/IP',
      ocpp: 'OCPP 2.1',
      eebus: 'EEBUS SPINE/SHIP',
    };
    return protocols[adapterId] ?? 'unknown';
  }

  private getTotalSampleCount(): number {
    let count = 0;
    for (const samples of this.samples.values()) {
      count += samples.length;
    }
    return count;
  }

  private notifyListeners(): void {
    const families = this.toJSON();
    for (const listener of this.listeners) {
      listener(families);
    }
  }
}

// ─── Singleton Instance ─────────────────────────────────────────────

export const metricsCollector = new MetricsCollector();
