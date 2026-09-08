# Adapter Developer Guide

> **Nexus-HEMS-Dash** — Adapter Architecture, Data Flow & Custom Adapter Development

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Core Interface: `EnergyAdapter`](#core-interface-energyadapter)
3. [Base Class: `BaseAdapter`](#base-class-baseadapter)
4. [Data Flow: `emitData()` → `deepMergeModel()` → Store](#data-flow)
5. [Built-in Adapters](#built-in-adapters)
6. [Writing a Custom Adapter](#writing-a-custom-adapter)
7. [Registering Your Adapter](#registering-your-adapter)
8. [Config Validation (Zod Schemas)](#config-validation)
9. [Credential Security](#credential-security)
10. [Command Handling](#command-handling)
11. [§14a EnWG + VDE-AR-N 4105 Compliance](#compliance)
12. [Testing](#testing)
13. [Plugin Marketplace — Publishing & Security](#plugin-marketplace)
14. [FAQ](#faq)

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    React UI Layer                           │
│  useEnergyStore ← useAdapterBridge → useAppStore           │
├─────────────────────────────────────────────────────────────┤
│              Adapter Aggregation Layer                      │
│  deepMergeModel(base, partial) → UnifiedEnergyModel        │
├────────┬──────────┬───────┬──────────┬─────────────────────┤
│Victron │ Modbus   │ KNX   │ OCPP 2.1 │ EEBUS SPINE        │
│MQTT    │ SunSpec  │ /IP   │          │ /SHIP              │
├────────┴──────────┴───────┴──────────┴─────────────────────┤
│              BaseAdapter (Abstract)                         │
│  Circuit Breaker · Reconnect · Audit Trail · Metrics       │
├────────────────────────────────────────────────────────────┤
│              EnergyAdapter Interface                       │
└────────────────────────────────────────────────────────────┘
```

### Dual-Store Pattern

| Store            | Purpose                                             | Persistence                          |
| ---------------- | --------------------------------------------------- | ------------------------------------ |
| `useEnergyStore` | Real-time adapter aggregation, `UnifiedEnergyModel` | None (in-memory)                     |
| `useAppStore`    | UI settings, locale, theme, user configs            | `localStorage` via Zustand `persist` |

The bridge hook `useAdapterBridge()` syncs adapter data from `useEnergyStore` → `useAppStore.energyData` for backward compatibility.

### Adapter Mode & Hardware Safety (Frontend)

Browser adapters use the same **mock-by-default, double opt-in for live** model as the backend.

| Build-time variable | Default | Purpose |
| ------------------- | ------- | ------- |
| `VITE_ADAPTER_MODE` | `mock` | Requested mode (`mock` or `live`) |
| `VITE_ALLOW_LIVE_HARDWARE` | unset | Must be `true` with `VITE_ADAPTER_MODE=live` |

Runtime rules (`apps/web/src/lib/adapter-mode.ts`):

1. **All built-in adapters start disabled** — `isBuiltinAdapterEnabledByDefault()` returns `false`.
2. User must enable an adapter in **Settings** (`enableAdapter`).
3. `useAdapterBridge()` calls `connect()` only when `canConnectHardwareAdapter(enabled)` is true (live build acknowledgement **and** adapter enabled).
4. Demo/simulated energy data is shown via `EnergyContext` when no hardware connection is active.

`canConnectHardwareAdapter()` never returns true in a standard dev build (`pnpm dev`) unless you explicitly set both `VITE_ADAPTER_MODE=live` and `VITE_ALLOW_LIVE_HARDWARE=true`.

See `docs/Safety-Certification-Notice.md` before connecting to real inverters, batteries, or EV chargers.

---

## Core Interface: `EnergyAdapter`

Every adapter **must** implement this interface (`apps/web/src/core/adapters/EnergyAdapter.ts`):

```typescript
interface EnergyAdapter {
  readonly id: string; // e.g. "victron-mqtt"
  readonly name: string; // Human-readable
  readonly status: AdapterStatus; // 'disconnected'|'connecting'|'connected'|'error'
  readonly capabilities: AdapterCapability[]; // ['pv','battery','grid','load','evCharger','knx','tariff']

  connect(): Promise<void>;
  disconnect(): Promise<void>;
  onData(callback: AdapterDataCallback): void;
  onStatus(callback: AdapterStatusCallback): void;
  sendCommand(command: AdapterCommand): Promise<boolean>;
  poll?(): Promise<Partial<UnifiedEnergyModel>>;
  getSnapshot(): Partial<UnifiedEnergyModel>;
  destroy(): void;
}
```

### `UnifiedEnergyModel` — The Canonical Data Shape

```typescript
interface UnifiedEnergyModel {
  timestamp: number;
  pv: PVData; // Solar production
  battery: BatteryData; // Storage state
  grid: GridData; // Grid import/export
  load: LoadData; // Consumption breakdown
  evCharger?: EVChargerData;
  knx?: KNXData;
  tariff?: TariffData;
}
```

Each adapter emits **partial** `UnifiedEnergyModel` — only the fields it owns. The aggregation store deep-merges all partials.

### Capability Declaration

```typescript
type AdapterCapability = 'pv' | 'battery' | 'grid' | 'load' | 'evCharger' | 'knx' | 'tariff';
```

| Adapter        | Capabilities                    |
| -------------- | ------------------------------- |
| Victron MQTT   | `pv`, `battery`, `grid`, `load` |
| Modbus SunSpec | `pv`, `battery`, `grid`         |
| KNX/IP         | `knx`                           |
| OCPP 2.1       | `evCharger`                     |
| EEBUS SPINE    | `evCharger`, `load`, `grid`     |

---

## Base Class: `BaseAdapter`

All built-in adapters extend `BaseAdapter` (`apps/web/src/core/adapters/BaseAdapter.ts`) which provides:

### Circuit Breaker

```
failureThreshold: 5 errors → OPEN state (30s cooldown)
OPEN → HALF_OPEN → (success) → CLOSED
                  → (failure) → OPEN again
```

### Exponential Backoff Reconnect

```
initialDelayMs × backoffMultiplier^n ± 25% jitter
capped at maxDelayMs
```

Listens for `navigator.onLine` events for auto-reconnect on network recovery.

### Audit Trail

Every command logged to IndexedDB:

```typescript
logCommandAudit({
  adapterId: this.id,
  command: cmd,
  status: 'success' | 'error',
  timestamp: Date.now(),
  error?: string
})
```

### Performance Metrics

```typescript
interface AdapterMetrics {
  lastDataAt: number;
  avgLatencyMs: number;
  errorRate: number;
  dataFreshnessMs: number;
  reconnectAttempts: number;
}
```

### Key Methods for Subclasses

```typescript
abstract class BaseAdapter implements EnergyAdapter {
  // Override in your adapter:
  protected abstract doConnect(): Promise<void>;
  protected abstract doDisconnect(): Promise<void>;
  protected abstract doPoll(): Promise<Partial<UnifiedEnergyModel>>;
  protected abstract doSendCommand(command: AdapterCommand): Promise<boolean>;

  // Call from your adapter to push data:
  protected emitData(model: Partial<UnifiedEnergyModel>): void;
  protected emitStatus(status: AdapterStatus, error?: string): void;
}
```

---

## Data Flow

```
Adapter.emitData(partial)
    ↓
useEnergyStore.mergeAdapterData(adapterId, partial)
    ↓
deepMergeModel(currentUnified, partial) → new UnifiedEnergyModel
    ↓
React components re-render (Zustand selectors)
    ↓
useAdapterBridge() syncs → useAppStore.energyData (backward compat)
```

**There is no `normalizeToUnified()` method.** Instead, each adapter builds a `Partial<UnifiedEnergyModel>` directly and emits it via `this.emitData()`.

### Example: How Victron MQTT maps data

```typescript
// Inside VictronMQTTAdapter
const model: Partial<UnifiedEnergyModel> = {
  timestamp: Date.now(),
  pv: {
    totalPowerW: mqttValues['/Ac/PvOnOutput/L1/Power'] ?? 0,
    yieldTodayKWh: mqttValues['/Yield/Today'] ?? 0,
  },
  battery: {
    powerW: mqttValues['/Dc/Battery/Power'] ?? 0,
    socPercent: mqttValues['/Dc/Battery/Soc'] ?? 0,
    voltageV: mqttValues['/Dc/Battery/Voltage'] ?? 0,
    currentA: mqttValues['/Dc/Battery/Current'] ?? 0,
  },
  grid: {
    powerW: mqttValues['/Ac/Grid/L1/Power'] ?? 0,
    voltageV: mqttValues['/Ac/Grid/L1/Voltage'] ?? 230,
  },
  load: {
    totalPowerW: mqttValues['/Ac/Consumption/L1/Power'] ?? 0,
    heatPumpPowerW: 0,
    evPowerW: 0,
    otherPowerW: mqttValues['/Ac/Consumption/L1/Power'] ?? 0,
  },
};
this.emitData(model);
```

### Example: How OCPP 2.1 maps data

```typescript
// Inside OCPP21Adapter — on MeterValues / TransactionEvent
const model: Partial<UnifiedEnergyModel> = {
  timestamp: Date.now(),
  evCharger: {
    status: ocppStatusToEnum(statusNotification.connectorStatus),
    powerW: meterValues.power ?? 0,
    energySessionKWh: meterValues.energy ?? 0,
    currentA: meterValues.current,
    voltageV: meterValues.voltage,
    maxCurrentA: chargingProfile.maxCurrent ?? 32,
    vehicleConnected: isVehicleConnected(statusNotification),
    v2xCapable: this.config.iso15118 ?? false,
    v2xActive: meterValues.power < 0,
  },
};
this.emitData(model);
```

### Example: How KNX maps data

```typescript
// Inside KNXAdapter — on KNX telegram received
const model: Partial<UnifiedEnergyModel> = {
  timestamp: Date.now(),
  knx: {
    rooms: this.roomStates.map((room) => ({
      id: room.id,
      name: room.name,
      temperature: room.temperature,
      setpoint: room.setpoint,
      lightsOn: room.lightsOn,
      brightness: room.brightness,
      windowOpen: room.windowOpen,
      humidity: room.humidity,
      co2ppm: room.co2ppm,
    })),
  },
};
this.emitData(model);
```

---

## Built-in Adapters

### 1. VictronMQTTAdapter

| Property           | Value                                                 |
| ------------------ | ----------------------------------------------------- |
| **Protocol**       | MQTT over WebSocket                                   |
| **Default Port**   | 1880                                                  |
| **Auth**           | Token (MQTT password)                                 |
| **D-Bus Paths**    | `N/<portalId>/...` (read), `W/<portalId>/...` (write) |
| **Gateway Types**  | `cerbo-gx`, `venus-gx`, `rpi-victron`                 |
| **Auto-Detection** | Portal ID from MQTT topic                             |

### 2. ModbusSunSpecAdapter

| Property           | Value                                                                        |
| ------------------ | ---------------------------------------------------------------------------- |
| **Protocol**       | REST bridge (HTTP polling)                                                   |
| **Default Port**   | 502                                                                          |
| **Auth**           | Bearer token                                                                 |
| **SunSpec Models** | 1 (common), 101-103 (inverters), 124 (battery), 160 (MPPT), 201-204 (meters) |
| **Scale Factors**  | Automatically parsed (W_SF, SoC_SF, etc.)                                    |
| **Poll Interval**  | 5000ms default                                                               |

### 3. KNXAdapter

| Property         | Value                                                           |
| ---------------- | --------------------------------------------------------------- |
| **Protocol**     | WebSocket (knxd) or MQTT bridge                                 |
| **Default Port** | 3671                                                            |
| **DPT Support**  | 1 (bool), 5 (8-bit), 9 (16-bit float), 14 (32-bit float)        |
| **GA Mapping**   | Room → {light, dimmer, temperature, setpoint, window, humidity} |

### 4. OCPP21Adapter

| Property              | Value                                          |
| --------------------- | ---------------------------------------------- |
| **Protocol**          | WebSocket JSON-RPC (OCPP-J)                    |
| **Default Port**      | 9000                                           |
| **Security Profiles** | 0 (none), 1 (basic), 2 (TLS), 3 (mTLS)         |
| **Charging Profiles** | TxDefaultProfile, ChargingStationMaxProfile    |
| **V2X**               | Negative current detection for vehicle-to-grid |
| **§14a EnWG**         | `handleGridCurtailment()` built-in             |

### 5. EEBUSAdapter

| Property               | Value                                                          |
| ---------------------- | -------------------------------------------------------------- |
| **Protocol**           | SHIP (Smart Home IP) → TLS 1.3 → SPINE JSON-RPC                |
| **Default Port**       | 4712                                                           |
| **Auth**               | mTLS mandatory, SKI fingerprint for pairing                    |
| **SPINE Features**     | Measurement, LoadControl, IncentiveTable, DeviceDiagnosis      |
| **Measurement Scopes** | ACPowerTotal, ACCurrent, ACVoltage, StateOfCharge, Temperature |

---

## Writing a Custom Adapter

### Step 1: Create the adapter file

```typescript
// apps/web/src/core/adapters/contrib/MyProtocolAdapter.ts
import { BaseAdapter } from '../BaseAdapter';
import type {
  AdapterConnectionConfig,
  AdapterCommand,
  AdapterCapability,
  UnifiedEnergyModel,
} from '../EnergyAdapter';

interface MyProtocolConfig extends AdapterConnectionConfig {
  customField: string;
}

export class MyProtocolAdapter extends BaseAdapter {
  readonly id = 'my-protocol';
  readonly name = 'My Protocol Adapter';
  readonly capabilities: AdapterCapability[] = ['pv', 'battery'];

  private config: MyProtocolConfig;
  private pollingTimer?: ReturnType<typeof setInterval>;

  constructor(config?: MyProtocolConfig) {
    super();
    this.config = config ?? {
      name: 'My Protocol',
      host: 'localhost',
      port: 8080,
      customField: 'default',
    };
  }

  protected async doConnect(): Promise<void> {
    // Establish connection to your device/service
    // Start polling or subscribe to events
    this.pollingTimer = setInterval(() => {
      void this.doPoll().then((data) => this.emitData(data));
    }, this.config.pollIntervalMs ?? 5000);
  }

  protected async doDisconnect(): Promise<void> {
    if (this.pollingTimer) clearInterval(this.pollingTimer);
  }

  protected async doPoll(): Promise<Partial<UnifiedEnergyModel>> {
    // Fetch data from your device
    // Map to UnifiedEnergyModel partial
    return {
      timestamp: Date.now(),
      pv: {
        totalPowerW: 3500,
        yieldTodayKWh: 12.4,
      },
      battery: {
        powerW: -1200,
        socPercent: 72,
        voltageV: 51.2,
        currentA: -23.4,
      },
    };
  }

  protected async doSendCommand(command: AdapterCommand): Promise<boolean> {
    switch (command.type) {
      case 'SET_BATTERY_POWER':
        // Send command to device
        return true;
      default:
        return false; // Not handled by this adapter
    }
  }
}
```

### Step 2: Add a Zod config schema

```typescript
// apps/web/src/core/adapter-config-schemas.ts
export const myProtocolConfigSchema = adapterConnectionSchema.extend({
  port: port.default(8080),
  customField: z.string().min(1).max(100),
});
```

### Step 3: Register the adapter

```typescript
// apps/web/src/core/adapters/adapter-registry.ts
import { MyProtocolAdapter } from './contrib/MyProtocolAdapter';

registerAdapter(
  'my-protocol',
  (config) => new MyProtocolAdapter(config as MyProtocolConfig | undefined),
  { source: 'builtin' },
);
```

Or use the contrib auto-loader pattern (see [Registering Your Adapter](#registering-your-adapter)).

---

## Registering Your Adapter

### Option A: Static Registration

```typescript
import { registerAdapter } from '../adapter-registry';

registerAdapter('my-adapter', (config) => new MyAdapter(config), {
  source: 'builtin', // or 'contrib'
});
```

### Option B: Contrib Auto-Loader

Place your adapter in `apps/web/src/core/adapters/contrib/`:

```typescript
// apps/web/src/core/adapters/contrib/my-adapter.ts
// Must export either:
//   { id, factory } — a ContribAdapterModule
//   { id, factory } — default export
//   or call registerAdapter() internally

export const id = 'my-adapter';
export const factory = (config?: AdapterConnectionConfig) => new MyAdapter(config);
```

Then load dynamically:

```typescript
await loadContribAdapter('my-adapter');
```

### Naming Rules

- Adapter IDs must be **kebab-case lowercase**: `my-adapter`, `shelly-pro`
- IDs must be unique across all registered adapters

---

## Config Validation

All configs validated via `zod` before being stored in the encrypted vault:

```typescript
import { adapterConnectionSchema } from '../adapter-config-schemas';

// Base schema — every adapter inherits:
adapterConnectionSchema = z.object({
  name: z.string().min(1).max(100),
  host: hostname,
  port: port,
  tls: z.boolean().optional(),
  clientCert: pemString.optional(),
  clientKey: pemString.optional(),
  authToken: z.string().max(4096).optional(),
  reconnect: reconnectConfigSchema.optional(),
  pollIntervalMs: z.number().int().min(500).max(300_000).optional(),
});
```

### Protocol-Specific Schemas

| Schema                | Protocol | Extras                                  |
| --------------------- | -------- | --------------------------------------- |
| `victronConfigSchema` | Victron  | `gatewayType`                           |
| `modbusConfigSchema`  | SunSpec  | `pollIntervalMs` override               |
| `knxConfigSchema`     | KNX      | standard                                |
| `ocppConfigSchema`    | OCPP 2.1 | `securityProfile` (0–3), optional mTLS  |
| `eebusConfigSchema`   | EEBUS    | `tls: true` mandatory, `skiFingerprint` |

---

## Credential Security

**Never store credentials in plain text or environment variables.**

All adapter credentials are encrypted via AES-GCM 256-bit with a PBKDF2-derived key (SHA-256, **600 000 iterations**) and stored in IndexedDB (Dexie.js):

```
User Input → Zod Validation → AES-GCM Encrypt → Dexie.js (IndexedDB)
                                                     ↓
                                          Adapter connect() ← Decrypt
```

See `apps/web/src/lib/ai-keys.ts` for the encryption implementation.

---

## Command Handling

### Command Lifecycle

```
UI Button Click
    → useSafeCommand() — presents confirm dialog for danger commands
    → BaseAdapter.sendCommand()
        → validateCommand() — Zod schema validation
        → circuit breaker check
        → doSendCommand() — your adapter implementation
        → logCommandAudit() — IndexedDB audit trail
    → Result
```

### Danger Commands (require double-confirm)

Commands that affect physical hardware get a confirmation dialog:

- `SET_BATTERY_POWER`, `SET_BATTERY_MODE`
- `SET_GRID_LIMIT`
- `SET_V2X_DISCHARGE`
- Emergency stops

---

## §14a EnWG + VDE-AR-N 4105 Compliance

### Per-Adapter Compliance Matrix

| Requirement                          | Victron                 | Modbus                | KNX                  | OCPP                         | EEBUS                 |
| ------------------------------------ | ----------------------- | --------------------- | -------------------- | ---------------------------- | --------------------- |
| **§14a Netz-Abregelung (4,2 kW)**    | ✅ via `SET_GRID_LIMIT` | ✅ via register write | N/A                  | ✅ `handleGridCurtailment()` | ✅ LoadControl limits |
| **§14a Smart-Meter-Gateway (iMSys)** | ⚠️ external             | ⚠️ external           | N/A                  | ⚠️ external                  | ✅ SHIP/SPINE native  |
| **§14a Lastmanagement**              | ✅ D-Bus commands       | ✅ SunSpec models     | ⚠️ via KNX actuators | ✅ ChargingProfiles          | ✅ LoadControl        |
| **§14a Reduziertes Netzentgelt**     | ⚠️ manual proof         | ⚠️ manual proof       | N/A                  | ✅ automatic                 | ✅ IncentiveTable     |
| **VDE 4105 Wirkleistung (70%)**      | ✅ ESS mode             | ✅ Model 124          | N/A                  | N/A                          | ⚠️ partial            |
| **VDE 4105 Blindleistung cos(φ)**    | ✅ configurable         | ✅ Model 124          | N/A                  | N/A                          | ⚠️ partial            |
| **VDE 4105 Frequenzschutz**          | ✅ firmware             | ✅ firmware           | N/A                  | N/A                          | N/A                   |
| **VDE 4105 Spannungsschutz**         | ✅ firmware             | ✅ firmware           | N/A                  | N/A                          | N/A                   |
| **VDE 4105 Netzcode-Konformität**    | ✅ certified            | ⚠️ depends on HW      | N/A                  | N/A                          | N/A                   |

Legend: ✅ Fully supported | ⚠️ Partial / external | N/A Not applicable

### Implementing §14a Grid Curtailment

```typescript
// Your adapter should handle SET_GRID_LIMIT command:
protected async doSendCommand(command: AdapterCommand): Promise<boolean> {
  if (command.type === 'SET_GRID_LIMIT') {
    const limitW = Number(command.value);
    // §14a EnWG: max 4200W for controllable consumers
    const clampedLimit = Math.min(limitW, 4200);
    await this.writeToDevice('gridImportLimit', clampedLimit);
    return true;
  }
  return false;
}
```

### VDE-AR-N 4105 Active Power Curtailment

```typescript
// For PV inverters ≤25kW — enforce 70% rule
const maxFeedIn = systemPeakKWp * 0.7;
if (currentFeedInKW > maxFeedIn) {
  await adapter.sendCommand({
    type: 'SET_GRID_LIMIT',
    value: maxFeedIn * 1000, // Convert to W
  });
}
```

---

## Testing

### Unit Test Template

```typescript
// apps/web/src/tests/my-adapter.test.ts
import { describe, it, expect, vi } from 'vitest';
import { MyProtocolAdapter } from '../core/adapters/contrib/MyProtocolAdapter';

describe('MyProtocolAdapter', () => {
  it('should emit UnifiedEnergyModel partial on poll', async () => {
    const adapter = new MyProtocolAdapter({
      name: 'Test',
      host: 'localhost',
      port: 8080,
      customField: 'test',
    });

    const dataCallback = vi.fn();
    adapter.onData(dataCallback);

    const snapshot = await adapter.poll?.();
    expect(snapshot).toBeDefined();
    expect(snapshot?.pv?.totalPowerW).toBeTypeOf('number');
    expect(snapshot?.battery?.socPercent).toBeGreaterThanOrEqual(0);
    expect(snapshot?.battery?.socPercent).toBeLessThanOrEqual(100);
  });

  it('should declare correct capabilities', () => {
    const adapter = new MyProtocolAdapter();
    expect(adapter.capabilities).toContain('pv');
    expect(adapter.capabilities).toContain('battery');
  });

  it('should handle SET_BATTERY_POWER command', async () => {
    const adapter = new MyProtocolAdapter();
    const result = await adapter.sendCommand({
      type: 'SET_BATTERY_POWER',
      value: 2000,
    });
    expect(result).toBe(true);
  });

  it('should return false for unhandled commands', async () => {
    const adapter = new MyProtocolAdapter();
    const result = await adapter.sendCommand({
      type: 'KNX_TOGGLE_LIGHTS',
      value: true,
    });
    expect(result).toBe(false);
  });
});
```

### Storybook / Manual Verification

For each adapter's data emission flow, verify:

1. **`emitData()` output** matches `UnifiedEnergyModel` partial shape
2. **Deep merge** doesn't overwrite other adapters' fields
3. **Capabilities** match the fields actually emitted
4. **Commands** return `true` only for handled types
5. **Circuit breaker** opens after 5 consecutive failures
6. **Reconnect** respects backoff configuration

---

## FAQ

### Q: Why is there no `normalizeToUnified()` method?

Each adapter builds its `Partial<UnifiedEnergyModel>` directly in `doPoll()` or event handlers, then calls `this.emitData(model)`. The `useEnergyStore` performs the merge via `deepMergeModel()`. This avoids an extra abstraction layer.

### Q: Can two adapters provide the same capability?

Yes. If both Victron and Modbus provide `'pv'`, values are deep-merged. The last `emitData()` call wins for each field. Use priority ordering in adapter initialization if needed.

### Q: How do I test without real hardware?

Use the demo data generator in `apps/web/src/lib/demo-data.ts` or create a mock adapter that emits synthetic data.

### Q: Where are adapter credentials stored?

In IndexedDB (Dexie.js), encrypted with AES-GCM 256-bit. See `apps/web/src/lib/ai-keys.ts` and `apps/web/src/lib/secure-store.ts`.

### Q: How do I add a new command type?

1. Add to `AdapterCommandType` in `apps/web/src/core/adapters/EnergyAdapter.ts`
2. Add validation in `apps/web/src/core/command-safety.ts`
3. Handle in your adapter's `doSendCommand()`
4. Optionally add danger-confirm classification

---

## Plugin Marketplace — Publishing & Security

The **Adapter Marketplace** (`apps/web/src/core/adapters/adapter-marketplace.ts`) lets users discover and one-click-install community adapters directly from `Settings → Plugins → Browse Adapters`.

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│              BrowseAdaptersPanel (React UI)                  │
│  Search · Category filter · Card grid · One-click install   │
├─────────────────────────────────────────────────────────────┤
│              AdapterMarketplace (service)                   │
│  fetchCatalog() · search() · install() · listInstalled()    │
├─────────────┬───────────────────┬───────────────────────────┤
│ Catalog     │ Signature verify  │ CDN loader                │
│ /adapter-   │ Ed25519 (SubtleCrypto)│ esm.sh / skypack /   │
│ marketplace │ SHA-256 integrity │ unpkg / jsdelivr          │
│ -catalog.json│                  │ (SSRF allowlist)          │
└─────────────┴───────────────────┴───────────────────────────┘
```

### Permission Model

| Permission   | `getData` / `connect` | `sendCommand` | Registry access |
|:-------------|:---------------------:|:-------------:|:---------------:|
| `read-only`  | ✅                    | ❌ blocked     | ❌              |
| `write`      | ✅                    | ✅             | ❌              |
| `admin`      | ✅                    | ✅             | ✅              |

- **`read-only`**: The sandbox wrapper replaces `sendCommand` with a no-op that logs a warning and returns `false`. Suitable for monitoring-only adapters (Tibber, P1 meter, Fronius read-only mode).
- **`write`**: Adapter can actuate hardware. The HEMS `CommandSafety` layer still applies — all commands pass through Zod validation and rate limiting.
- **`admin`**: Full access, including the ability to register sub-adapters. Reserved for tightly integrated packages (e.g. Powerwall gateway that manages its own sub-devices).

The dashboard never grants a higher permission than what the adapter declares in the catalog. Users can choose to *reduce* the permission during install; they cannot elevate it.

### Security Controls

1. **CDN Allowlist** — Only `esm.sh`, `cdn.skypack.dev`, `unpkg.com`, `cdn.jsdelivr.net/npm/` are permitted CDN origins. Any other URL is rejected before fetch.
2. **Ed25519 Signature** — Each verified catalog entry carries a base64url-encoded Ed25519 signature over `${id}@${version}`. The catalog embeds the SPKI-encoded verifier public key. Verification uses `SubtleCrypto.verify('Ed25519', …)`.
3. **SHA-256 Integrity** — After fetch, the raw module text is hashed with `SubtleCrypto.digest('SHA-256', …)` and stored in the install ledger for audit.
4. **500 KB Size Cap** — Modules larger than 500 KB are rejected outright.
5. **Blob URL Isolation** — Modules are loaded via `URL.createObjectURL(blob)` so they execute on a `blob:` origin, isolated from the main app origin. The blob URL is revoked immediately after import.
6. **Unverified adapters** — Entries with `verified: false` or no `signature` skip cryptographic verification and are loaded with their declared permission. Users see a "not verified" indicator in the UI.

### Writing a Publishable Adapter

A marketplace adapter is a standard npm package that exports one of the supported module shapes (same as contrib adapters):

```typescript
// my-adapter/src/index.ts

import type { AdapterFactory } from 'nexus-hems-adapter-sdk';
import { MyAdapter } from './MyAdapter';

export const id = 'nexus-my-adapter';
export const factory: AdapterFactory = (config) => new MyAdapter(config);

// Or: export default { id, factory };
// Or: export function register() { registerAdapter(id, factory, { ... }); }
```

**`package.json` requirements:**

```json
{
  "name": "nexus-hems-adapter-my-adapter",
  "version": "1.0.0",
  "type": "module",
  "main": "dist/index.js",
  "exports": { ".": "./dist/index.js" },
  "keywords": ["nexus-hems", "adapter"],
  "peerDependencies": {}
}
```

Key rules:
- **No Node.js built-ins** (`fs`, `net`, `crypto` — use `SubtleCrypto` instead). The module runs in the browser.
- **No top-level side effects** — the module must not call `registerAdapter` at import time; wait for the `register()` function call or default export consumption.
- **Bundle size** — keep the gzipped bundle under 100 KB. Declare `peerDependencies` for shared dependencies (e.g. `zod`); do not bundle them.
- **ESM only** — no CJS. `"type": "module"` is required.

### Submitting to the Catalog

1. Publish your package to npm (or create a GitHub release).
2. Open a PR against this repository adding your entry to `apps/web/public/adapter-marketplace-catalog.json`.
3. A maintainer will review the code, run security checks, and sign the entry with the Nexus-HEMS Ed25519 key.
4. Once merged, your adapter appears in the marketplace with the ✅ verified badge.

Unsigned community entries (those you add yourself with an empty `signature`) will appear but without the verified badge. Users can still install them, with a clear visual warning.

### Updating the Catalog Locally

During development you can point the app at a local catalog override:

```typescript
// vite.config.ts — proxy /adapter-marketplace-catalog.json to your local file
server: {
  proxy: {
    '/adapter-marketplace-catalog.json': {
      target: 'http://localhost:3001',
      changeOrigin: true,
    },
  },
},
```

Or simply replace `apps/web/public/adapter-marketplace-catalog.json` in your fork.

---

## Related Documentation

- **[Security Architecture](./Security-Architecture.md)** — Threat model, encryption, audit, incident response
- **[Deployment Checklist](./Deployment-Checklist.md)** — TLS, Reverse-Proxy, Docker, Failover
- **[DESIGN-SYSTEM.md](../DESIGN-SYSTEM.md)** — Neo-Energy Cyber-Glassmorphism patterns
- **[CONTRIBUTING.md](../CONTRIBUTING.md)** — Contribution guidelines
- **[CHANGELOG.md](../CHANGELOG.md)** — Release history (automated via semantic-release)
