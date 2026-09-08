# Backend Implementation Roadmap

> **Status:** Active | **Last Updated:** 2026-04-25

Detailed engineering specification for the backend protocol adapter infrastructure, EventBus,
InfluxDB integration, and EnergyRouterService.

---

## 1. EventBus Design

### Rationale

The EventBus decouples protocol adapters from downstream consumers (TSDB writer, WebSocket gateway,
EnergyRouterService). Using Node.js `EventEmitter` keeps the dependency footprint minimal and avoids
introducing RxJS into the backend.

> **Implemented (HIGH-17, ADR-018):** the WebSocket gateway consumer is `LiveEnergyAggregator`
> (`apps/api/src/services/LiveEnergyAggregator.ts`), which folds role-tagged `UnifiedEnergyDatapoint`s
> into the `EnergyData` snapshot the browser consumes and is broadcast in resolved `live` mode with
> fresh data (otherwise the mock stream). Datapoints carry an optional `role` field for this mapping.

### Backpressure Strategy

Protocol adapters may emit data at different rates (Modbus: ~1 Hz, MQTT: bursts). A 500 ms time
window batches datapoints before flushing to consumers. If the buffer exceeds 1 000 entries before
the window closes, an immediate flush is triggered and a `droppedCount` metric is incremented.

```
┌──────────────────────────────────────────────────────────────────┐
│  Protocol Adapter A  emit() → Buffer[]                           │
│  Protocol Adapter B  emit() → Buffer[]  ──→  500 ms window       │
│  Protocol Adapter C  emit() → Buffer[]         │                 │
│                                               flush(batch[])     │
│                                                │                 │
│                                   ┌───────────┴──────────┐       │
│                                   │  TimeseriesService   │       │
│                                   │  EnergyRouterService │       │
│                                   │  WebSocket Gateway   │       │
│                                   └──────────────────────┘       │
└──────────────────────────────────────────────────────────────────┘
```

### API

```typescript
interface EventBusSubscriber {
  onBatch(datapoints: UnifiedEnergyDatapoint[]): void | Promise<void>;
}

class EventBus {
  emit(datapoint: UnifiedEnergyDatapoint): void;
  subscribe(id: string, subscriber: EventBusSubscriber): void;
  unsubscribe(id: string): void;
  getStats(): { buffered: number; flushed: number; dropped: number };
  destroy(): void;
}
```

---

## 2. InfluxDB Integration Spec

### Data Model

| InfluxDB Concept | Mapped From |
|-----------------|-------------|
| Measurement | `metric` field (`POWER_W`, `SOC_PERCENT`, …) |
| Tag: `device_id` | `deviceId` (UUID) |
| Tag: `protocol` | `protocol` (`modbus-sunspec`, `victron-mqtt`, …) |
| Tag: `quality` | `qualityIndicator` (`GOOD`, `STALE`, `ERROR`) |
| Field: `value` | `value` (number) |
| Timestamp | `timestamp` (Unix ms, nanosecond precision in InfluxDB) |

### Example Flux Query (History Route)

```flux
from(bucket: "nexus-hems")
  |> range(start: -1h)
  |> filter(fn: (r) => r["_measurement"] == "POWER_W")
  |> filter(fn: (r) => r["device_id"] == "abc-123")
  |> aggregateWindow(every: 1m, fn: mean, createEmpty: false)
  |> yield(name: "mean")
```

### WAL (Write-Ahead Log) Spec

Location: `apps/api/data/wal.ndjson`

Format: One JSON object per line:
```json
{"timestamp":1714000000000,"deviceId":"...","protocol":"modbus-sunspec","metric":"POWER_W","value":3450.5,"qualityIndicator":"GOOD"}
```

Recovery behavior:
1. On startup: check if `wal.ndjson` exists and is non-empty
2. Read all lines, parse, group into batches of 200
3. Retry write to InfluxDB with exponential backoff (1 s → 2 s → 4 s → 30 s cap, max 5 attempts)
4. On success: truncate file
5. On persistent failure: rename to `wal.ndjson.failed-<timestamp>` for manual recovery

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `INFLUXDB_URL` | No | `http://influxdb:8086` | InfluxDB base URL |
| `INFLUXDB_TOKEN` | No | `nexus-hems-influx-token` | Auth token |
| `INFLUXDB_ORG` | No | `nexus-hems` | Organisation name |
| `INFLUXDB_BUCKET` | No | `nexus-hems` | Target bucket |

---

## 3. Modbus Adapter Spec

### Device Map Format (`apps/api/src/data/device-map.json`)

```json
[
  {
    "deviceId": "sma-sunnyboy-01",
    "host": "192.168.1.100",
    "port": 502,
    "protocol": "modbus-sunspec",
    "unitId": 1,
    "pollIntervalMs": 2000,
    "registers": [
      {
        "address": 40083,
        "metric": "POWER_W",
        "scale": 1,
        "unit": "W",
        "dataType": "INT16",
        "byteOrder": "BE",
        "label": "AC Power Output"
      }
    ]
  }
]
```

### Rate Limiting & Queue

- Maximum concurrent Modbus requests: 10 (configurable via `MODBUS_MAX_CONCURRENT`)
- Maximum requests per minute: 100 (configurable via `MODBUS_RATE_LIMIT`)
- Request queue: FIFO, non-blocking; excess requests are dropped (metrics counter incremented)

### Reconnect Strategy

```
Attempt 1: wait 1 s
Attempt 2: wait 2 s
Attempt 3: wait 4 s
Attempt 4: wait 8 s
...
Max wait: 60 s (cap)
After 10 failed attempts: emit ERROR quality indicator, continue retrying silently
```

---

## 4. MQTT Adapter Spec

### Topic Mapping Configuration

Topics are mapped to metrics via a `topicPatterns` array in the adapter config:

```typescript
interface TopicPattern {
  pattern: string;          // e.g. "victron/+/+/Dc/0/Power"
  metric: MetricType;       // e.g. "POWER_W"
  deviceIdExtract: string;  // JSON path or topic segment index e.g. "topic[1]"
  scale?: number;           // value multiplier
}
```

### Dead-Letter Queue

Location: `apps/api/data/dead-letter.ndjson`

Triggers:
- JSON parse failure
- Zod schema validation failure
- Unknown topic (no matching pattern)
- Value out of safe range (NaN, Infinity)

Format per entry:
```json
{"ts":1714000000000,"topic":"hems/devices/xxx/data","rawPayload":"...","error":"Zod: invalid_type"}
```

Rotation: max 10 000 entries; when exceeded, oldest 1 000 entries are purged.

---

## 5. EnergyRouterService Spec

### aWATTar Day-Ahead API

```
GET https://api.awattar.de/v1/marketdata
Response: { "data": [{ "start_timestamp": ms, "end_timestamp": ms, "marketprice": ct/MWh }] }
Conversion: ct/MWh ÷ 10 000 = €/kWh
Refresh interval: every 60 minutes (prices update once daily at ~14:00 CET)
```

### LP Optimization Logic

```
Input:
  - prices[24]: hourly Day-Ahead prices for today (€/kWh)
  - soc: current battery SoC (%)
  - inverterMaxW: from device-map.json
  - chargeThreshold: lower quartile of today's prices

Decision:
  if currentPrice <= lowerQuartile(prices) AND soc < 50:
    recommend "FORCE_CHARGE"
    log audit entry
    (Write to Modbus: deferred to Phase 3b)
  elif soc > 85 AND pvPower > houseLoad:
    recommend "MAXIMIZE_SELF_CONSUMPTION"
    log audit entry
```

### Optimization Loop

- Runs every 5 minutes via `setInterval`
- Fetches current price from aWATTar (cached, refreshed hourly)
- Reads latest SoC from EventBus (last received `SOC_PERCENT` datapoint)
- Logs all decisions to audit trail regardless of action

---

## 6. History API Spec

```
GET /api/v1/history

Query Parameters:
  metric      (required) e.g. "POWER_W"
  deviceId    (optional) filter by device UUID
  from        (required) ISO 8601 datetime e.g. "2026-04-01T00:00:00Z"
  to          (required) ISO 8601 datetime
  granularity (optional, default "5m") one of: "1m" | "5m" | "15m" | "1h" | "1d"

Response 200:
{
  "metric": "POWER_W",
  "granularity": "5m",
  "points": [
    { "timestamp": 1714000000000, "value": 3450.5 },
    ...
  ],
  "count": 288,
  "source": "influxdb" | "unavailable"
}

Response when InfluxDB unavailable:
{ "metric": "...", "points": [], "count": 0, "source": "unavailable" }

Max points returned: 1000 (server-side downsampling via Flux aggregateWindow)
```

---

## 7. New Dependencies

| Package | Workspace | Version | Purpose |
|---------|-----------|---------|---------|
| `@influxdata/influxdb-client` | `apps/api` | `^1.35.0` | InfluxDB v2 write + query |
| `modbus-serial` | `apps/api` | `^10.x` | Modbus RTU/TCP client |
| `better-sqlite3` | `apps/api` | `^11.x` | SQLite audit log fallback |
| `@types/better-sqlite3` | `apps/api` (dev) | `^7.x` | TypeScript types |

---

## 8. Testing Strategy

### Backend Unit Tests (Vitest)

New test coverage for `apps/api`:

| Test File | Coverage |
|-----------|----------|
| `src/protocols/modbus/ModbusAdapter.test.ts` | Mock serial port; register parsing; error handling; reconnect logic |
| `src/protocols/mqtt/MqttAdapter.test.ts` | Mock MQTT client; topic matching; DLQ routing; Zod validation |
| `src/core/EventBus.test.ts` | Buffer flush timing; backpressure; subscriber isolation |
| `src/services/TimeseriesService.test.ts` | WAL write/recovery; InfluxDB mock; batch conversion |

### Integration Tests (planned, Phase 9)

- Docker Compose integration: spin up InfluxDB in CI, run real write/query cycle
- Modbus TCP mock server: `modbus-serial` has built-in TCP server mode for testing
