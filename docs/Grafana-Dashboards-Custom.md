# Custom Grafana Dashboards

This guide explains how to use and extend the pre-provisioned Grafana dashboards bundled with Nexus-HEMS.

> **Grafana config:** `grafana/` · **Prometheus rules:** `rules/hems-alerts.yml` · **Metrics:** `apps/api/src/middleware/metrics.ts`

---

## Quick Start

```bash
# Start the full observability stack
docker compose -f docker-compose.yml up grafana prometheus
# or full stack:
pnpm docker:up
```

Grafana UI: **http://localhost:3001** (admin / admin for dev — change in prod!)

---

## Pre-Provisioned Dashboards

Grafana auto-imports dashboards from `grafana/provisioning/dashboards/`. Three dashboard JSON files ship today — `json/nexus-energy-overview.json`, `json/nexus-error-tracking.json` (UID `nexus-hems-error-tracking`, adapter-error/latency/circuit-breaker panels), and `json/nexus-adapter-health.json` (UID `nexus-hems-adapters`, reconnect/freshness/DLQ panels per MED-18). The **API & Security** dashboard below is the remaining target expansion (no separate JSON yet).

### 1. Nexus-HEMS Overview

**UID:** `nexus-hems-overview`

| Panel | Metric | Type |
|-------|--------|------|
| Total PV Power | `hems_pv_power_watts` | Stat |
| Grid Import / Export | `hems_grid_power_watts` | TimeSeries |
| Battery State of Charge | `hems_battery_soc_percent` | Gauge |
| EV Charging Power | `hems_ev_power_watts` | TimeSeries |
| Energy Cost / Savings | `hems_energy_cost_euros` | Stat |
| Active Adapters | `hems_adapters_active_total` | Stat |
| WebSocket Connections | `websocket_connections_active` | TimeSeries |

### 2. Adapter Health

![Adapter health — in-app Monitoring equivalent](./images/operators/grafana-adapter-health.png)
*Monitoring → Adapter Health (Grafana `nexus-hems-adapters` dashboard shows the same MED-18 metrics)*

**UID:** `nexus-hems-adapters`

Shows per-adapter metrics (`{adapter, protocol}` labels, MED-18 — `apps/api/src/middleware/adapter-metrics.ts`):
- `hems_adapter_connected` — 0/1 connection status
- `hems_adapter_latency_seconds` — poll / connection latency
- `hems_adapter_data_freshness_seconds` — age of last datapoint
- `hems_adapter_data_updates_total` — datapoints emitted per adapter
- `hems_adapter_errors_total` — error count per adapter
- `hems_adapter_reconnects_total` — reconnect count per adapter
- `hems_adapter_dlq_total` — dead-letter-queue count per adapter

### 3. API & Security

**UID:** `nexus-hems-api`

- HTTP request rate and error rate
- Rate limiter trigger counts
- JWT authentication success/failure
- WebSocket command throughput

---

## Creating Custom Dashboards

### Method A — Grafana UI

1. Open **Dashboards → New → New Dashboard** in Grafana.
2. Add panels using Prometheus as the data source (pre-configured as `nexus-hems-prometheus`).
3. Export as JSON: **Dashboard Settings → JSON Model → Copy to clipboard**.
4. Save to `grafana/provisioning/dashboards/my-dashboard.json`.
5. Restart Grafana to pick up automatically: `docker compose restart grafana`.

### Method B — JSON File

Create `grafana/provisioning/dashboards/energy-analytics.json`:

```json
{
  "__inputs": [],
  "__elements": {},
  "__requires": [
    { "type": "datasource", "id": "prometheus", "version": "1.0.0" }
  ],
  "id": null,
  "uid": "nexus-hems-analytics",
  "title": "Energy Analytics",
  "tags": ["nexus-hems", "analytics"],
  "schemaVersion": 38,
  "panels": [
    {
      "type": "timeseries",
      "title": "PV vs Consumption",
      "targets": [
        {
          "expr": "hems_pv_power_watts",
          "legendFormat": "PV Production"
        },
        {
          "expr": "hems_consumption_power_watts",
          "legendFormat": "Consumption"
        }
      ],
      "gridPos": { "x": 0, "y": 0, "w": 24, "h": 8 }
    }
  ]
}
```

---

## Adding Custom Alert Rules

Edit `rules/hems-alerts.yml` to add new Prometheus alert rules:

### Existing Alerts

```yaml
# rules/hems-alerts.yml (excerpt)
groups:
  - name: hems
    rules:
      - alert: AdapterDown
        expr: hems_adapter_connected == 0
        for: 2m
        labels:
          severity: warning
        annotations:
          summary: "Adapter {{ $labels.adapter_id }} disconnected"

      - alert: BatteryLow
        expr: hems_battery_soc_percent < 20
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "Battery SoC below 20% ({{ $value }}%)"

      - alert: GridExportExceedsLimit
        expr: hems_grid_power_watts < -10000
        for: 1m
        labels:
          severity: info
        annotations:
          summary: "Grid export exceeds 10 kW"
```

### Adding a New Alert

Append to the `rules:` array, e.g. for high grid import cost:

```yaml
      - alert: ExpensivePeakImport
        expr: hems_grid_power_watts > 5000 and hems_grid_price_euros_kwh > 0.30
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: "Importing {{ $value }}W at high price > €0.30/kWh"
          description: "Consider switching to battery-only or reducing loads"
```

Then reload Prometheus rules:
```bash
curl -X POST http://localhost:9090/-/reload
```

---

## Available Prometheus Metrics

| Metric | Type | Description |
|--------|------|-------------|
| `hems_pv_power_watts` | Gauge | Current PV production (W) |
| `hems_battery_soc_percent` | Gauge | Battery state of charge (%) |
| `hems_battery_power_watts` | Gauge | Battery charge/discharge (W, positive=charging) |
| `hems_grid_power_watts` | Gauge | Grid import/export (W, positive=import) |
| `hems_ev_power_watts` | Gauge | EV charging power (W) |
| `hems_heatpump_power_watts` | Gauge | Heat pump power (W) |
| `hems_consumption_power_watts` | Gauge | Total home consumption (W) |
| `hems_grid_price_euros_kwh` | Gauge | Current grid price (€/kWh) |
| `hems_energy_cost_euros` | Counter | Cumulative energy cost (€) |
| `hems_adapters_active_total` | Gauge | Number of active adapters |
| `hems_adapter_connected` | Gauge | Per-adapter connection status (0/1) (MED-18, `{adapter, protocol}`) |
| `hems_adapter_latency_seconds` | Gauge | Per-adapter poll/connection latency (MED-18) |
| `hems_adapter_data_freshness_seconds` | Gauge | Per-adapter last-datapoint age (MED-18) |
| `hems_adapter_data_updates_total` | Counter | Per-adapter datapoints emitted (MED-18) |
| `hems_adapter_errors_total` | Counter | Per-adapter error count (MED-18) |
| `hems_adapter_reconnects_total` | Counter | Per-adapter reconnect count (MED-18) |
| `hems_adapter_dlq_total` | Counter | Per-adapter dead-letter count (MED-18) |
| `hems_circuit_breaker_state` | Gauge | Per-adapter circuit breaker (0/1/2), frontend-emitted |
| `websocket_connections_active` | Gauge | Active WebSocket connections |
| `http_requests_total` | Counter | HTTP request count by method/path/status |
| `http_request_duration_seconds` | Histogram | HTTP latency |

---

## Alertmanager Configuration

Alertmanager config for routing HEMS alerts to email/Slack/Telegram:

```yaml
# prometheus.yml alerting section
alerting:
  alertmanagers:
    - static_configs:
        - targets: ["alertmanager:9093"]

# alertmanager.yml
route:
  receiver: slack-hems
  group_by: [alertname, adapter_id]
  group_wait: 30s
  group_interval: 5m
  repeat_interval: 12h

receivers:
  - name: slack-hems
    slack_configs:
      - api_url: <YOUR_SLACK_WEBHOOK>
        channel: "#hems-alerts"
        title: "HEMS Alert: {{ .GroupLabels.alertname }}"
        text: "{{ range .Alerts }}{{ .Annotations.summary }}\n{{ end }}"
```

---

## Grafana Variables for Multi-Adapter Dashboards

Add a template variable to filter by adapter:

```json
{
  "name": "adapter",
  "type": "query",
  "query": "label_values(hems_adapter_connected, adapter_id)",
  "multi": true,
  "includeAll": true
}
```

Then use `{adapter_id=~"$adapter"}` in panel queries.

---

*See also: [API-Reference.md](./API-Reference.md) · [Deployment-Guide.md](./Deployment-Guide.md) · `prometheus.yml`*
