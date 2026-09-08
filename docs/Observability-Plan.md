# Observability Plan — Nexus-HEMS-Dash

> **Status:** Active — Implementation roadmap through v1.3.x
> **Created:** 2026-04-25
> **Owner:** @qnbs

This document captures the full observability strategy for Nexus-HEMS-Dash: current instrumentation,
gaps, migration path to OpenTelemetry, new alert rules, business metrics, and Grafana dashboard
extensions.

---

## 1. Current State

| Layer | Tool | Status | Notes |
|-------|------|--------|-------|
| Error tracking (frontend) | Sentry v7 + `browserTracingIntegration` | ✅ Active | Transactions captured |
| Error tracking (backend) | None | ❌ Missing | Express + WS untraced |
| Distributed tracing | None | ❌ Missing | No spans between frontend ↔ backend ↔ adapters |
| Metrics (server) | Prometheus/prom-client via `/metrics` endpoint | ✅ Active | 6 scrape jobs |
| Metrics (frontend) | Custom `setMetric()` bridge | ✅ Active | hems_* namespace |
| Alerting | Prometheus Alertmanager | ✅ Active | 13 rules across 3 groups |
| Dashboards | Grafana (2 dashboards) | ✅ Partial | Per-adapter health metrics now ship (`hems_adapter_*`, MED-18); dedicated adapter-matrix + cost/revenue dashboard JSON still outstanding |
| Logging | stdout JSON (docker compose `json-file`) | ✅ Active | No structured trace correlation |
| Profiling | None | ❌ Missing | No continuous profiling |

**Gap Summary:**
- No distributed tracing → cannot correlate frontend user-action → backend command → adapter command
- Error-only observability for backend (Sentry not wired to Express)
- 4 missing alert rule groups (security, performance, business, cert expiry)
- Missing business metrics (self-consumption, CO2, cost savings)
- No adapter-health matrix dashboard
- No MPC solve-time instrumentation

---

## 2. OpenTelemetry Strategy

**Decision (D3):** OpenTelemetry as primary tracing standard, Sentry as error-aggregation sink.

Rationale:
- OTel is vendor-neutral and compatible with Grafana Tempo (self-hosted) + Jaeger + Honeycomb
- Sentry SDK supports OTel propagation (`@sentry/opentelemetry`) — no duplicate instrumentation
- HEMS data must remain on-premises (GDPR, energy system data sovereignty)
- Self-hosted Grafana Tempo + Loki stack avoids vendor lock-in

### 2.1 Backend — `apps/api`

```typescript
// apps/api/src/observability/otel.ts (new file)
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { PrometheusExporter } from '@opentelemetry/exporter-prometheus';

export function initTelemetry(): NodeSDK {
  const sdk = new NodeSDK({
    traceExporter: new OTLPTraceExporter({
      url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? 'http://tempo:4318/v1/traces',
    }),
    metricReader: new PrometheusExporter({ port: 9464 }), // separate metrics port
    instrumentations: [
      getNodeAutoInstrumentations({
        '@opentelemetry/instrumentation-http': { enabled: true },
        '@opentelemetry/instrumentation-express': { enabled: true },
        '@opentelemetry/instrumentation-dns': { enabled: false }, // noisy
      }),
    ],
    serviceName: 'nexus-hems-api',
    serviceVersion: process.env.npm_package_version,
  });
  sdk.start();
  return sdk;
}
```

**Spans to instrument manually:**
- `adapter.connect` — includes adapter `id`, `protocol`, initial status
- `adapter.command` — includes `commandType`, `targetDevice`, `scope`
- `ws.message` — includes `commandType`, `clientId`, scope-gate result
- `mpc.optimize` — includes `horizon_hours`, `solve_time_ms`, `constraints_count`
- `tariff.fetch` — includes `provider`, `points_fetched`

### 2.2 Frontend — `apps/web`

Use existing Sentry browser integration + OTel propagation headers for trace correlation:

```typescript
// apps/web/src/main.tsx — add to Sentry init
import * as Sentry from '@sentry/react';

Sentry.init({
  // ... existing config
  integrations: [
    Sentry.browserTracingIntegration(),
    // Inject W3C traceparent header on fetch/XHR to correlate frontend → backend spans
    new Sentry.BrowserTracing({
      tracePropagationTargets: [/^\/api\//, /^\/ws/],
    }),
  ],
  tracesSampleRate: import.meta.env.PROD ? 0.1 : 1.0,
});
```

**Frontend user-flow spans:**
- `energy.sankey.render` — D3 layout + DOM update time
- `command.send` — time from UI click → WS ack
- `optimizer.run` — MPC solve on main thread (pre-worker migration)
- `tariff.load` — fetch + parse + store latency

### 2.3 Grafana Tempo Self-Hosted Stack

Add to `docker-compose.prod.yml` (monitoring profile):

```yaml
tempo:
  image: grafana/tempo:2.5.0
  profiles: [monitoring]
  command: ["-config.file=/etc/tempo/config.yaml"]
  volumes:
    - ./grafana/tempo.yaml:/etc/tempo/config.yaml:ro
    - tempo-data:/var/tempo
  networks: [backend]

loki:
  image: grafana/loki:3.1.0
  profiles: [monitoring]
  command: ["-config.file=/etc/loki/config.yaml"]
  volumes:
    - loki-data:/loki
  networks: [backend]
```

---

## 3. New Alert Rules (v1.2.0)

Added to `rules/hems-alerts.yml` in groups `hems_security`, `hems_performance`, `hems_business`:

### hems_security group
| Alert | Expression | Threshold | Severity |
|-------|-----------|-----------|----------|
| `JTIRevocationFailure` | `increase(hems_jti_revocation_errors_total[5m]) > 0` | Any error | critical |
| `JTIStoreNearCapacity` | `hems_jti_store_size / 10000 > 0.8` | >80% full | warning |
| `EEBUSCertExpiryWarning` | cert TTL < 30 days | 30d | warning |
| `EEBUSCertExpiryImmediate` | cert TTL < 7 days | 7d | critical |

### hems_performance group
| Alert | Expression | Threshold | Severity |
|-------|-----------|-----------|----------|
| `MPCSolveTimeSlow` | `hems_mpc_solve_duration_seconds > 5` | >5s | warning |
| `DownsamplingLagHigh` | `hems_downsampling_lag_seconds > 30` | >30s | warning |
| `PVForecastAccuracyDrift` | forecast MAE >30% deviation | 30% | info |

### hems_business group
| Alert | Expression | Threshold | Severity |
|-------|-----------|-----------|----------|
| `SelfConsumptionRateLow` | `hems_self_consumption_ratio < 0.5` | <50% | info |
| `GridImportCostHigh` | `increase(hems_grid_cost_eur_total[1h]) > 2.0` | >€2/h | info |

---

## 4. New Business Metrics (v1.2.0)

Export from `apps/api/src/middleware/metrics.ts`:

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `hems_self_consumption_ratio` | gauge | — | PV generation consumed on-site / total PV generation (0–1) |
| `hems_co2_avoided_kg_total` | counter | — | Estimated CO₂ offset from PV generation (kg, rolling) |
| `hems_grid_cost_eur_total` | counter | — | Cumulative grid import cost (EUR) |
| `hems_feed_in_revenue_eur_total` | counter | — | Cumulative feed-in revenue (EUR) |
| `hems_grid_import_reduction_pct` | gauge | — | % reduction vs. baseline (no HEMS) |
| `hems_mpc_solve_duration_seconds` | histogram | — | MPC optimization solve time (buckets: 0.1s to 30s) |
| `hems_downsampling_lag_seconds` | gauge | — | Dexie pipeline: current → aggregated lag |
| `hems_jti_store_size` | gauge | — | Current in-memory JTI revocation store size |
| `hems_jti_revocation_errors_total` | counter | `backend` (redis/memory) | JTI revocation write failures |
| `hems_eebus_cert_expiry_timestamp_seconds` | gauge | `device_id` | Unix timestamp of EEBUS cert expiry |

---

## 5. Grafana Dashboard Extensions (v1.2.0)

### 5.1 Adapter Health Matrix (new dashboard)

File: `grafana/provisioning/dashboards/json/nexus-adapter-health.json`

Panels:
- Heatmap: adapter × time → status (0=disconnected, 1=connected, 2=error)
- Circuit breaker state per adapter (gauge)
- Reconnect attempt rate per adapter (graph)
- Average command latency per adapter (bar chart)

### 5.2 Cost & Revenue Dashboard (new dashboard)

File: `grafana/provisioning/dashboards/json/nexus-cost-revenue.json`

Panels:
- Daily grid import cost (EUR, bar chart)
- Daily feed-in revenue (EUR, bar chart)
- Self-consumption ratio (gauge, 7-day trend)
- CO₂ offset cumulative (stat panel)
- Grid import reduction vs. baseline (percentage gauge)

### 5.3 K8s Cluster Dashboard

File: `grafana/provisioning/dashboards/json/nexus-k8s-cluster.json`

Import standard K8s dashboard ID `15661` from Grafana.com (Kubernetes Cluster Monitoring).

---

## 6. Implementation Roadmap

| Item | Phase | Effort | Status |
|------|-------|--------|--------|
| Alert rules (4 new groups, 10 rules) | 2 | 1h | ✅ Done |
| Business metrics — prometheus export | 2 | 3h | 🔲 Planned |
| OTel SDK — backend integration | 2 | 4h | 🔲 Planned |
| OTel propagation — frontend | 2 | 2h | 🔲 Planned |
| Adapter health matrix dashboard | 2 | 2h | 🔲 Planned |
| Cost/Revenue dashboard | 2 | 2h | 🔲 Planned |
| Grafana Tempo in docker-compose | 2 | 1h | 🔲 Planned |
| Continuous profiling (Pyroscope) | 3 | 3h | 🔲 Future |

---

## 7. Further Considerations

1. **Sampling rates**: Production tracing at 10% (`tracesSampleRate: 0.1`) to avoid storage cost
   on high-frequency WS messages. Increase to 100% temporarily for debugging.
2. **Log correlation**: Structured JSON logging with `trace_id` field injected from OTel context
   allows Loki → Tempo trace drilldown directly from log lines.
3. **Alert routing**: Send `critical` and `warning` to dedicated Slack/PagerDuty channel;
   `info` to email digest only. Configure Alertmanager receivers in `alertmanager.yml`.
4. **Retention**: Prometheus 30d (configured), Tempo 7d (storage-constrained), Loki 14d.
5. **Security**: Prometheus `/metrics` endpoint protected by `requireJWT`
   (already implemented in `apps/api/src/routes/metrics.routes.ts`; JWT required, no additional scope check).
