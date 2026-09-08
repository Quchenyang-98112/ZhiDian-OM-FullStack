# Protocol Adapter Guide — Backend (Server-Side)

> **Status:** Active | **Last Updated:** 2026-07-08 | **Shipped release:** v1.11.0

This guide explains how to implement **server-side** protocol adapters in `apps/api/src/protocols/`.
Server-side adapters run in the Express backend and feed data into the central EventBus. In **live**
mode, data reaches the browser UI via `LiveEnergyAggregator` → WebSocket gateway (HIGH-17, v1.4.0).

## Shipped Backend Adapters (as of v1.11.0)

| Adapter | File | Enable env | Since |
|---------|------|------------|-------|
| Modbus/SunSpec | `modbus/ModbusAdapter.ts` | `device-map.json` + live mode | v1.3.0 |
| Victron MQTT | `mqtt/MqttAdapter.ts` | MQTT broker env + live mode | v1.3.0 |
| KNX/IP | `knx/KnxAdapter.ts` | `KNX_BRIDGE_WS_URL` | v1.4.0 |
| evcc | `evcc/EvccAdapter.ts` | `EVCC_BASE_URL` | v1.4.0 |
| EEBUS SPINE/SHIP | `eebus/EebusProtocolAdapter.ts` | trust store (disable: `EEBUS_DISABLE=true`) | v1.5.0 |
| HeatPump | `heatpump/HeatPumpAdapter.ts` | `HEATPUMP_HOST` | v1.6.1 |
| OpenEMS | `openems/OpenEMSProtocolAdapter.ts` | `OPENEMS_HOST` | v1.7.0 |
| OCPP CSMS | `ocpp/OcppCsmsProtocolAdapter.ts` | `OCPP_CSMS_PORT` | v1.7.0 |
| Home Assistant (WS) | `homeassistant/HomeAssistantProtocolAdapter.ts` | `HA_HOST` + `HA_TOKEN` | v1.10.0 |
| Home Assistant (MQTT) | `homeassistant/HomeAssistantMqttProtocolAdapter.ts` | `HA_MQTT_BROKER_URL` | v1.10.0 |
| Matter | `matter/MatterProtocolAdapter.ts` | `MATTER_BRIDGE_HOST` | v1.10.0 |
| Zigbee2MQTT | `zigbee2mqtt/Zigbee2MQTTProtocolAdapter.ts` | `Z2M_BROKER_URL` | v1.10.0 |
| Exec scripts | `services/ExecService.ts` | `EXEC_SCRIPTS_CONFIG` | v1.5.0 |

**Shipped:** OCPP CSMS Security Profile 3 / mTLS browser proxy (`/ws/ocpp`, HIGH-12). Backend `OcppCsmsProtocolAdapter` remains SP0 gateway.

## Adapter Mode (Safety-Critical)

Backend protocol adapters **never start** unless both conditions are met:

| Variable | Default | Purpose |
| -------- | ------- | ------- |
| `ADAPTER_MODE` | `mock` | Requested mode (`mock` or `live`) |
| `ALLOW_LIVE_HARDWARE` | unset | Must be `true` together with `ADAPTER_MODE=live` |

Resolution lives in `apps/api/src/config/adapter-mode.ts`:

- `ADAPTER_MODE=mock` → effective mode `mock`, no hardware adapters started (safe for CI/demo).
- `ADAPTER_MODE=live` without `ALLOW_LIVE_HARDWARE=true` → **effective mode stays `mock`**; server logs a warning and skips adapter startup.
- `ADAPTER_MODE=live` + `ALLOW_LIVE_HARDWARE=true` → Modbus adapters from `device-map.json` (default **empty** `[]`; copy `device-map.example.json` for live edge deploys) and MQTT when configured

`GET /api/health` reports `mode` from **effective** mode (`getEffectiveAdapterMode()`), not the raw env value alone.

See `docs/Safety-Certification-Notice.md` before enabling live mode on edge hardware.

> **Frontend vs Backend Adapters:**
> - **Frontend adapters** (`apps/web/src/core/adapters/`) connect browsers directly to hardware.
>   They implement the `EnergyAdapter` interface and update `useEnergyStore`. Suitable for
>   browser-accessible WebSocket endpoints.
> - **Backend adapters** (`apps/api/src/protocols/`) run on Edge hardware with direct network
>   access. They implement the `IProtocolAdapter` interface and feed the `EventBus`.
>   Suitable for Modbus TCP (local network only), serial port access, mTLS connections.

---

## The `IProtocolAdapter` Interface

All backend adapters must implement:

```typescript
import type { IProtocolAdapter, UnifiedEnergyDatapoint } from '@nexus-hems/shared-types';

export class MyAdapter implements IProtocolAdapter {
  readonly id: string;          // Unique adapter ID e.g. 'modbus-inverter-01'
  readonly protocol: ProtocolType;

  async connect(): Promise<void> { /* ... */ }
  async disconnect(): Promise<void> { /* ... */ }
  async healthCheck(): Promise<AdapterHealth> { /* ... */ }
  async *getDataStream(): AsyncGenerator<UnifiedEnergyDatapoint> { /* ... */ }
}
```

---

## Minimal Adapter Example

```typescript
import EventEmitter from 'node:events';
import type {
  AdapterHealth,
  IProtocolAdapter,
  ProtocolType,
  UnifiedEnergyDatapoint,
} from '@nexus-hems/shared-types';
import { energyDatapointSchema } from '@nexus-hems/shared-types';

export class ExampleBackendAdapter implements IProtocolAdapter {
  readonly id = 'example-01';
  readonly protocol: ProtocolType = 'modbus-sunspec';

  private connected = false;
  private emitter = new EventEmitter();

  async connect(): Promise<void> {
    // Initialize hardware connection
    this.connected = true;
    // Start polling / subscription
    this.startPolling();
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    this.emitter.removeAllListeners();
  }

  async healthCheck(): Promise<AdapterHealth> {
    return {
      status: this.connected ? 'healthy' : 'disconnected',
      lastSeenMs: Date.now(),
      errorCount: 0,
    };
  }

  async *getDataStream(): AsyncGenerator<UnifiedEnergyDatapoint> {
    // Yield datapoints as they arrive from hardware
    while (this.connected) {
      const datapoint = await this.nextDatapoint();
      yield datapoint;
    }
  }

  private nextDatapoint(): Promise<UnifiedEnergyDatapoint> {
    return new Promise((resolve) => {
      this.emitter.once('data', resolve);
    });
  }

  private startPolling(): void {
    setInterval(() => {
      // Read from hardware ...
      const rawValue = 3450; // W

      const candidate = {
        timestamp: Date.now(),
        deviceId: this.id,
        protocol: this.protocol,
        metric: 'POWER_W' as const,
        value: rawValue,
        qualityIndicator: 'GOOD' as const,
      };

      // Always validate before emitting
      const result = energyDatapointSchema.safeParse(candidate);
      if (result.success) {
        this.emitter.emit('data', result.data);
      } else {
        console.warn('[ExampleAdapter] Invalid datapoint', result.error.issues);
      }
    }, 2000);
  }
}
```

---

## Registering an Adapter

Adapters are instantiated in `apps/api/src/protocols/index.ts` inside `startProtocolAdapters()`.
That function returns immediately when `isLiveHardwareAllowed()` is false (the default).

```typescript
export async function startProtocolAdapters(eventBus: EventBus): Promise<void> {
  logAdapterModeStartup();

  if (!isLiveHardwareAllowed()) {
    return; // mock / live-without-ack — no hardware adapters
  }

  const adapter = new ExampleBackendAdapter();
  await adapter.connect();
  // ... wire getDataStream() → eventBus.emit()
}
```

---

## Zod Validation Contract

Every datapoint **must** be validated against `energyDatapointSchema` before emission. Never
bypass this — malformed data silently corrupts InfluxDB time series.

```typescript
import { energyDatapointSchema } from '@nexus-hems/shared-types';

const result = energyDatapointSchema.safeParse(rawData);
if (!result.success) {
  // Route to Dead-Letter Queue, do NOT emit
  dlq.write({ topic, rawData, error: result.error.toString() });
  return;
}
eventBus.emit(result.data);
```

---

## Reconnect Pattern

Use exponential backoff for hardware connections:

```typescript
private async reconnectWithBackoff(): Promise<void> {
  const maxDelayMs = 60_000;
  let attempt = 0;

  while (!this.connected) {
    const delayMs = Math.min(1000 * 2 ** attempt, maxDelayMs);
    console.log(`[${this.id}] Reconnecting in ${delayMs}ms (attempt ${attempt + 1})`);
    await new Promise((r) => setTimeout(r, delayMs));

    try {
      await this.connect();
    } catch {
      attempt++;
    }
  }
}
```

---

## Dead-Letter Queue

For MQTT adapters handling potentially malformed payloads:

```typescript
import { appendFileSync } from 'node:fs';
import { join } from 'node:path';

const DLQ_PATH = join(import.meta.dirname, '../../data/dead-letter.ndjson');
const MAX_DLQ_LINES = 10_000;
let dlqLineCount = 0;

function writeToDLQ(entry: { ts: number; topic: string; rawPayload: string; error: string }): void {
  if (dlqLineCount >= MAX_DLQ_LINES) {
    // Rotate — truncate and restart
    // In production: move to dead-letter.ndjson.old-<timestamp>
    dlqLineCount = 0;
  }
  appendFileSync(DLQ_PATH, JSON.stringify(entry) + '\n', 'utf8');
  dlqLineCount++;
}
```

---

## Testing Checklist

Before submitting a backend adapter:

- [ ] Implements `IProtocolAdapter` interface (TypeScript compiler enforces)
- [ ] All emitted datapoints validated with `energyDatapointSchema.safeParse()`
- [ ] Invalid datapoints routed to DLQ (never thrown/logged only)
- [ ] Reconnect logic uses exponential backoff with cap
- [ ] `healthCheck()` reflects real connection state (not hardcoded)
- [ ] `disconnect()` cleans up all timers, sockets, event listeners
- [ ] Unit tests mock the hardware client (not real network)
- [ ] `qualityIndicator` set correctly: `GOOD` (fresh), `STALE` (>30s old), `ERROR` (parse fail)
- [ ] No `any` types — TypeScript strict mode must pass (`pnpm type-check`)
- [ ] `pnpm lint` zero warnings

---

## Supported Protocol Types

```typescript
type ProtocolType =
  | 'victron-mqtt'
  | 'modbus-sunspec'
  | 'knx'
  | 'ocpp'
  | 'eebus'
  | 'homeassistant-mqtt'
  | 'matter-thread'
  | 'zigbee2mqtt'
  | 'shelly-rest';
```

Add new protocols here and in `packages/shared-types/src/domain/energy.types.ts`.
