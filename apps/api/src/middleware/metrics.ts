// ─── Prometheus Metrics (server-side) ─────────────────────────────
export interface ServerMetricSample {
  name: string;
  help: string;
  type: string;
  labels: Record<string, string>;
  value: number;
  timestamp: number;
}

const serverMetrics: Map<string, ServerMetricSample[]> = new Map();

export function getServerMetrics(): Map<string, ServerMetricSample[]> {
  return serverMetrics;
}

export function setMetric(
  name: string,
  help: string,
  type: string,
  value: number,
  labels: Record<string, string> = {},
): void {
  if (!serverMetrics.has(name)) {
    serverMetrics.set(name, []);
  }
  const arr = serverMetrics.get(name)!;
  const existingIdx = arr.findIndex(
    (s) =>
      Object.keys(labels).length === Object.keys(s.labels).length &&
      Object.entries(labels).every(([k, v]) => s.labels[k] === v),
  );
  const sample: ServerMetricSample = { name, help, type, labels, value, timestamp: Date.now() };
  if (existingIdx >= 0) arr[existingIdx] = sample;
  else arr.push(sample);
}

/** Monotonic counter — adds delta to the existing sample for the same name+labels. */
export function incrementMetric(
  name: string,
  help: string,
  type: string,
  delta: number,
  labels: Record<string, string> = {},
): void {
  if (!serverMetrics.has(name)) {
    serverMetrics.set(name, []);
  }
  const arr = serverMetrics.get(name)!;
  const existingIdx = arr.findIndex(
    (s) =>
      Object.keys(labels).length === Object.keys(s.labels).length &&
      Object.entries(labels).every(([k, v]) => s.labels[k] === v),
  );
  const prev = existingIdx >= 0 ? arr[existingIdx].value : 0;
  const sample: ServerMetricSample = {
    name,
    help,
    type,
    labels,
    value: prev + delta,
    timestamp: Date.now(),
  };
  if (existingIdx >= 0) arr[existingIdx] = sample;
  else arr.push(sample);
}

function formatMetricLabels(labels: Record<string, string>): string {
  const entries = Object.entries(labels);
  if (entries.length === 0) return '';
  return `{${entries.map(([k, v]) => `${k}="${v}"`).join(',')}}`;
}

export function renderPrometheusText(): string {
  const lines: string[] = [];
  for (const [, samples] of serverMetrics) {
    if (samples.length === 0) continue;
    const first = samples[0];
    lines.push(`# HELP ${first.name} ${first.help}`);
    lines.push(`# TYPE ${first.name} ${first.type}`);
    for (const s of samples) {
      lines.push(`${s.name}${formatMetricLabels(s.labels)} ${s.value} ${s.timestamp}`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

export function updateServerMetrics(data: Record<string, number>, wsConnectionCount: number): void {
  setMetric('hems_pv_power_watts', 'Current PV generation power in watts', 'gauge', data.pvPower, {
    inverter: 'primary',
  });
  setMetric(
    'hems_battery_power_watts',
    'Battery power (positive=charging, negative=discharging)',
    'gauge',
    data.batteryPower,
    { battery_id: 'main' },
  );
  setMetric(
    'hems_grid_power_watts',
    'Grid power (positive=import, negative=export)',
    'gauge',
    data.gridPower,
    { phase: 'total' },
  );
  setMetric(
    'hems_house_load_watts',
    'Total household consumption in watts',
    'gauge',
    data.houseLoad,
  );
  setMetric('hems_ev_charger_power_watts', 'EV charger power in watts', 'gauge', data.evPower, {
    charger_id: 'wallbox-1',
  });
  setMetric('hems_heat_pump_power_watts', 'Heat pump power in watts', 'gauge', data.heatPumpPower);
  setMetric('hems_battery_soc_percent', 'Battery state of charge', 'gauge', data.batterySoC, {
    battery_id: 'main',
  });
  setMetric('hems_grid_voltage_volts', 'Grid voltage', 'gauge', data.gridVoltage, {
    phase: 'L1',
  });
  setMetric('hems_battery_voltage_volts', 'Battery pack voltage', 'gauge', data.batteryVoltage, {
    battery_id: 'main',
  });
  setMetric('hems_pv_yield_today_kwh', 'PV yield today in kWh', 'counter', data.pvYieldToday, {
    inverter: 'primary',
  });
  setMetric(
    'hems_tariff_price_eur_per_kwh',
    'Current electricity tariff price',
    'gauge',
    data.priceCurrent,
    { provider: 'dynamic' },
  );
  setMetric(
    'hems_uptime_seconds',
    'Server uptime in seconds',
    'counter',
    (Date.now() - serverStartTime) / 1000,
  );
  setMetric(
    'hems_websocket_connections_active',
    'Number of active WebSocket connections',
    'gauge',
    wsConnectionCount,
  );
}

const serverStartTime = Date.now();

export { serverStartTime };

export const wsMessageCount = { inbound: 0, outbound: 0 };
