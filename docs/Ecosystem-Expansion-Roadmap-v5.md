# Nexus-HEMS-Dash: Ecosystem Expansion Roadmap v5.0

**Date:** 2026-07-02  
**Status:** Active — replaces tactical items in `docs/Perfection-Roadmap.md` for protocol/device scope  
**Source:** Comprehensive v5.0 audit (July 2026)  
**Baseline:** v1.6.1 (P0/P1/P2 items below largely shipped in v1.4.0–v1.6.1; see `CHANGELOG.md`)

> **Status sync (2026-07-02):** P0 (HA, Modbus profiles, ExecAdapter), P1 (MQTT, Zigbee, Shelly, OCPP V2X), and P2 (HeatPump, 190-device registry) are **shipped**. Remaining: P2-EEBUS-GO sidecar, P2-MATTER full SDK, P3 certification items.

---

## Executive Summary

Nexus-HEMS-Dash has an excellent adapter pattern foundation (BaseAdapter, circuit breaker,
command-safety, audit trail, UnifiedEnergyModel). The July 2026 audit reveals that while
the architecture is first-class, the **breadth and depth of protocol/device coverage**
requires systematic expansion across 10 areas to reach production readiness for the
full HEMS device ecosystem.

**Current state at v1.6.1:**

| Area | Frontend | Backend | Quality |
|------|----------|---------|---------|
| Victron MQTT | ✅ Full | ✅ (MQTT adapter) | Production |
| Modbus/SunSpec | ✅ Full | ✅ | Production (15 example profiles) |
| KNX/IP | ✅ Full | ✅ | Production |
| OCPP 2.1 | ✅ Full (P1) | ⏳ | Frontend P1: W-unit §14a, V2H/V2G; CSMS gateway planned |
| EEBUS SPINE/SHIP | ✅ Full | ✅ | Production (`EebusProtocolAdapter`; Go sidecar in v1.5+) |
| evcc | ✅ Full | ✅ | Production |
| OpenEMS | ✅ Full | ⏳ | Frontend only |
| Home Assistant | ✅ Contrib (dual-mode) | ⏳ | ha-ws-api + MQTT Discovery; backend proxy planned |
| Zigbee2MQTT | ✅ Contrib (P1) | ⏳ | Role classification, availability, EV/WP commands |
| Shelly | ✅ Contrib (Gen1/2/3) | ⚠️ Webhook | Gen1/2/3 REST + `/api/shelly/webhook` push |
| Matter/Thread | ⚠️ Contrib (stub) | ⏳ | HA bridge recommended (ADR-022) |
| OpenADR 3.1 | ✅ Contrib | ✅ | Production |
| ExecAdapter | ✅ Contrib | ✅ | Whitelist-only script execution |
| HeatPump | ✅ (via backend) | ✅ | `HeatPumpAdapter` — 6 manufacturer profiles |
| MPPT / Hybrid | ✅ (registry) | ⚠️ | 190-device registry; Modbus profiles in device-map |

---

## Prioritized Master Task List

### P0 — Critical ✅ Shipped (v1.5.0)

| ID | Task | Status |
|----|------|--------|
| P0-HA | Home Assistant dual-mode adapter | ✅ v1.5.0 |
| P0-MODBUS | 15+ hybrid inverter Modbus profiles | ✅ v1.5.0 |
| P0-EXEC | ExecAdapter + API backend | ✅ v1.5.0 |
| P0-PLAN | This document + ADR-021 | ✅ |

### P1 — High ✅ Shipped (v1.6.0)

| ID | Task | Status |
|----|------|--------|
| P1-MQTT | Enhanced MqttAdapter: TLS, QoS, LWT, templates | ✅ v1.6.0 |
| P1-ZIGBEE | Zigbee2MQTT: roles, availability, commands | ✅ v1.6.0 |
| P1-SHELLY | Shelly Gen1/3, webhook, 3-phase | ✅ v1.6.0 |
| P1-OCPP-V2X | V2X + §14a EnWG W-unit fix | ✅ v1.6.0 |

### P2 — Medium (partially shipped v1.6.1)

| ID | Task | Status |
|----|------|--------|
| P2-EEBUS-GO | enbility/eebus-go Go sidecar | ⏳ ADR-022 |
| P2-MPPT | MPPT register profiles | ✅ registry + device-map |
| P2-HEATPUMP | HeatPumpAdapter (6 manufacturers) | ✅ v1.6.1 |
| P2-HARDWARE-REG | Hardware registry 190 devices | ✅ v1.6.1 |
| P2-MATTER | Full Matter/Thread SDK | ⏳ ADR-022 Option B (HA bridge) |

### P3 — Future (v1.5+ / certification roadmap)

| ID | Task | Files Affected | Risk |
|----|------|----------------|------|
| P3-EEBUS-CERT | EEBUS CEM certification (full LPC/LPP compliance testing) | All EEBUS files | Very High |
| P3-VPP-MARKET | VPP/flex market integration (OpenADR → real DSO APIs) | `vpp-service.ts`, `openadr-3-1.ts` | High |
| P3-RBAC | Role-based access control for adapter commands | `auth.routes.ts`, `command-safety.ts` | High |
| P3-HA-CUSTOM | Nexus-HEMS-Dash as HA custom integration component | new `ha-integration/` package | Medium |
| P3-OPENAPI | Full OpenAPI spec for all adapter REST endpoints | `docs/`, `api/*.routes.ts` | Low |

---

## Detailed Phased Plan

---

### Phase A — Immediate (Already implemented in PR #208)

**EEBUS SPINE/SHIP backend adapter (MED-20)**

- `apps/api/src/protocols/eebus/EebusProtocolAdapter.ts` — Full IProtocolAdapter ✅
- `apps/api/src/protocols/index.ts` — Registered ✅
- `apps/web/src/pages/Settings.tsx` — EEBUS Certs tab ✅
- `docs/adr/ADR-020-eebus-spine-backend-adapter.md` ✅

---

### Phase B — Current Sprint (P0)

#### B1: Home Assistant Full Integration (P0-HA)

**Problem:** The current `homeassistant-mqtt.ts` uses a fake JSON-over-WS shim that
won't work with a real Mosquitto broker or HA's MQTT integration. It also lacks
MQTT Discovery auto-detection, support for climate/number/select entity domains,
bidirectional HA service calls, and proper reconnection.

**Target:** First-class HA integration at the same quality level as `VictronMQTTAdapter`.

**Two-mode architecture:**
1. **MQTT Discovery mode** (primary): connects to Mosquitto broker, subscribes to
   `homeassistant/#` discovery topics, auto-maps energy entities.
2. **HA WebSocket API mode** (alternative): connects to `ws://ha:8123/api/websocket`,
   authenticates with Long-Lived Access Token, subscribes to state changes.

**Files to modify/create:**

```
apps/web/src/core/adapters/contrib/homeassistant-mqtt.ts  ← full rewrite
apps/web/src/tests/homeassistant-mqtt-adapter.test.ts     ← update tests
apps/web/src/locales/en.ts                                ← add HA keys
apps/web/src/locales/de.ts                                ← add HA keys
```

**Key changes:**
- Use `mqtt.js` (same as VictronMQTTAdapter) instead of raw WebSocket
- Implement MQTT Discovery: parse `homeassistant/<domain>/<unique_id>/config`
- Support entity domains: `sensor`, `binary_sensor`, `switch`, `climate`, `number`,
  `select`, `input_number`, `input_boolean`
- Auto-detect energy-relevant entities via `device_class` field:
  `energy`, `power`, `current`, `voltage`, `battery`, `temperature`
- Build dynamic entity → UnifiedEnergyModel mapping from discovered entities
- Bidirectional: `_sendCommand()` publishes to entity command topics
- Reconnect logic with auth token refresh
- `ha_discovery_prefix` config (default `homeassistant`)
- Support HA Supervisor token injection

**MQTT Discovery payload example:**
```json
{
  "name": "Solar Power",
  "device_class": "power",
  "state_class": "measurement",
  "unit_of_measurement": "W",
  "state_topic": "homeassistant/sensor/solar_power/state",
  "unique_id": "solar_power_01"
}
```

**Verification:**
```bash
# Test MQTT Discovery parsing
pnpm --filter @nexus-hems/web exec vitest run src/tests/homeassistant-mqtt-adapter.test.ts
```

---

#### B2: ExecAdapter — Safe Script Execution (P0-EXEC)

**Problem:** Advanced users need to integrate custom hardware via local scripts (Python,
Bash). Currently impossible without writing a full adapter. Risk: if done naively,
arbitrary code execution is a critical security vulnerability.

**Security model:**
- Frontend sends `{ scriptId: string, args: Record<string, string> }` to API
- API validates `scriptId` against a static whitelist in `EXEC_SCRIPTS_CONFIG`
  (environment variable or config file — never accepts arbitrary command strings)
- Scripts run with limited timeout (default 30s), no network, no shell expansion
- Output must be valid JSON `{ metric: string, value: number, unit: string }`
- Circuit breaker: 5 consecutive failures → open for 60s
- Full audit log to `command-audit.ndjson`

**Files to create:**

```
apps/web/src/core/adapters/contrib/exec-adapter.ts  ← frontend adapter
apps/api/src/routes/exec.routes.ts                  ← API endpoint
apps/api/src/services/ExecService.ts                ← sandboxed exec service
apps/web/src/tests/exec-adapter.test.ts             ← frontend tests
apps/api/src/tests/exec-service.test.ts             ← backend tests
```

**Frontend adapter interface:**
```typescript
export interface ExecAdapterConfig {
  scriptId: string;               // must match whitelist key
  pollIntervalMs?: number;        // default 10_000
  args?: Record<string, string>;  // validated key=value pairs only
  metricMapping?: Record<string, {
    role: EnergyRole;
    metric: MetricType;
  }>;
}
```

**Backend ExecService whitelist format (env: EXEC_SCRIPTS_CONFIG):**
```json
{
  "scripts": {
    "read_power_meter": {
      "command": "/opt/scripts/read_power_meter.py",
      "args": ["--device"],  // allowed arg keys
      "timeout": 30,
      "outputSchema": "power_reading"
    }
  }
}
```

**Verification:**
- `READ_ONLY_MODE=true` must block all exec commands
- No shell injection possible (no `sh -c`, no interpolation)
- Timeout enforced at OS level via `AbortController` + child_process kill
- i18n: `adapterConfig.exec*` keys in en/de

---

#### B3: Modbus Device Profiles (P0-MODBUS)

Expand `apps/api/src/data/device-map.example.json` with Modbus register maps for:

**Hybrid Inverters (most-requested):**

| Device | Modbus Unit | Key Registers |
|--------|-------------|---------------|
| Deye SUN-xK-SG04LP3 | 1 | PV power: 672, Battery SoC: 103, Grid: 625 |
| Growatt SPH 3000-10000 | 1 | PV power: 35/36, Battery: 1013/1014/1168 |
| Growatt MIN-TL3-XH | 1 | PV1 power: 3, AC output: 35, Grid: 37 |
| Luxpower SNA 5000 | 1 | PV: 40/41, Battery: 162/163/168 |
| Huawei SUN2000-xKTL | 1 | PV total: 32075, Grid: 37113, Battery: 37004 |
| Fronius Symo Gen24 | 1 | SunSpec 160: DC power |
| Sungrow SH-xT | 1 | PV: 5003/5004, Battery: 13022, Grid: 5083 |
| Sofar Solar HYD | 1 | PV: 0x586, Battery: 0x604, Grid: 0x488 |

**MPPT Charge Controllers:**

| Device | Interface | Key Registers |
|--------|-----------|---------------|
| EPever XTRA/Tracer | RS485 Modbus | PV power: 0x3100-0x3101, Battery: 0x331A |
| SRNE ML Series | RS485 Modbus | Battery SoC: 0x100, PV: 0x107-108 |
| Renogy Wanderer/Rover | RS485 Modbus | SOC: 0x100, PV voltage: 0x107 |

**Battery Systems:**

| Device | Interface | Key Registers |
|--------|-----------|---------------|
| PYLONTECH US2000C | RS485 | SOC: 0x0, Voltage: 0x2, Current: 0x3 |
| BYD B-Box Premium HV | TCP | SOC: 0x02, Temp: 0x08, Power: 0x0A |
| WECO 5K | TCP Modbus | SOC: 100, Voltage: 105, Power: 107 |
| Dyness DT Series | RS485 | SOC: 0x0100, Current: 0x0102 |
| Alpha ESS Smile | TCP | SOC: 0x0100, Power: 0x0102 |

Each profile includes `role: "pv"/"battery"/"grid"/"load"` tags on registers for
the LiveEnergyAggregator (HIGH-17).

---

### Phase C — Next Sprint (P1)

#### C1: Enhanced MQTT Ecosystem (P1-MQTT)

The backend `MqttAdapter` has good bones but missing:
- TLS client certificates (`MQTT_CLIENT_CERT`, `MQTT_CLIENT_KEY`)
- QoS 1/2 subscriptions for reliable delivery
- Retained message handling
- Last Will Testament for connection drop detection
- Topic template substitution (`{deviceId}`, `{siteName}`)
- Payload format options: JSON, raw float, Protobuf via schema registry

Files:
```
apps/api/src/protocols/mqtt/MqttAdapter.ts         ← TLS, QoS, will, templates
apps/api/src/protocols/mqtt/MqttAdapter.test.ts    ← additional test cases
apps/api/src/data/device-map.example.json          ← MQTT device examples
```

---

#### C2: Zigbee2MQTT Full Integration (P1-ZIGBEE)

The current contrib adapter is a thin stub. Target:
- Real `mqtt.js` client (not WS shim)
- Full device discovery from `zigbee2mqtt/bridge/devices` response
- Map `device_class` / `endpoint` features to energy roles:
  - `electricalMeasurement`: power, current, voltage → `load`
  - `metering`: energy → `load`/`grid`
  - `thermostat`: temperature, setpoint → heat pump integration
- OTA update status in device registry
- Pairing mode toggle via `zigbee2mqtt/bridge/request/permit_join`

```
apps/web/src/core/adapters/contrib/zigbee2mqtt.ts ← real MQTT.js, device discovery
```

---

#### C3: Shelly Comprehensive Support (P1-SHELLY)

Expand from Gen2-only to:
- **Gen1:** `GET /status` HTTP API (Shelly Plug S, EM, 3EM, 2.5)
- **Gen2/Gen3:** RPC over HTTP + MQTT (Shelly Plus 1PM, Plus 2PM, Pro 3EM, Plus Plug S)
- **Shelly Pro 3EM:** 3-phase grid meter → role `grid` with phases
- **Webhook push:** Shelly can POST to `POST /api/shelly/webhook` instead of polling
- Energy accumulation: `aenergy.total` → kWh counter with daily reset

```
apps/web/src/core/adapters/contrib/shelly-rest.ts ← Gen1+Gen3, webhook, phases
apps/api/src/routes/shelly-webhook.routes.ts       ← new webhook receiver
```

---

#### C4: OCPP V2X / §14a EnWG Completion (P1-OCPP-V2X)

Current `OCPP21Adapter.ts` has V2G scaffolding but missing:
- Full ISO 15118-20 BPT parameter exchange on `RequestStartTransaction`
- §14a EnWG `SetChargingProfile` with `chargingRateUnit: W` for grid operator signals
- V2H: `DischargeToHome` profile support
- Smart charging: `GetCompositeSchedule` + `ChargingProfileKindType.Recurring`
- Phase balancing for 3-phase wallboxes
- Multiple EVSE support within a single charger

```
apps/web/src/core/adapters/OCPP21Adapter.ts  ← V2H discharge, §14a profiles
apps/web/src/tests/OCPP21Adapter.test.ts     ← V2X test coverage
```

---

#### C5: Heat Pump / HVAC Dedicated Adapters (P1-HEATPUMP, via Modbus)

Add manufacturer-specific Modbus register profiles:

| Manufacturer | Protocol | Register notes |
|---|---|---|
| Viessmann Vitocal | RS485 Modbus TCP bridge | OpMode, return temp, power |
| Stiebel Eltron WPL | ModbusTCP native (ISG web) | System status, cop, power |
| Wolf BWL-1S | RS485 → TCP gateway | Flow temp, outdoor temp |
| Nibe F-series | RS485 Modbus | Multiple status registers |
| Daikin Altherma | LAN adapter (REST) | JSON API over HTTP |
| Mitsubishi MAC-558IF | MELCLOUD REST | REST/WebSocket bridge |

Heat pump role mapping: `metric: POWER_W, role: heatpump` + `TEMPERATURE_C` sensors.

Add to `device-map.example.json` with `protocol: "modbus-sunspec"` (Modbus TCP) or
new `protocol: "rest-json"` for HTTP-based APIs.

---

### Phase D — v1.4 (P2)

#### D1: enbility/eebus-go Sidecar (P2-EEBUS-GO)

Per ADR-020, this requires:
1. New Go module `go/eebus-proxy/` in the monorepo
2. `enbility/eebus-go` as Go dependency (Apache 2.0 / MIT license)
3. REST + WebSocket bridge: the Go proxy manages SHIP/SPINE sessions;
   Node.js `EebusProtocolAdapter` delegates to `http://localhost:4713`
4. Docker Compose: `eebus-go` container alongside `nexus-hems-api`
5. Helm chart: add `eebus-go` sidecar container to `nexus-hems` deployment
6. Frontend `EEBUSAdapter.ts`: zero changes (bridge is transparent)
7. New Prometheus metrics from Go proxy: `eebus_spine_messages_total`,
   `eebus_ship_sessions_active`, `eebus_handshake_duration_seconds`

**Risk:** Go build in CI, Docker multi-process, Helm changes are significant.
Full Go sidecar deferred to v1.5.

---

#### D2: Hardware Registry Expansion (P2-HARDWARE-REG)

Expand `apps/web/src/core/hardware-registry.ts` (currently **190 devices**, P2 #212) toward 250+:

New categories:
- MPPT charge controllers (EPever, SRNE, Renogy, Victron SmartSolar)
- Hybrid inverters (Deye, Growatt, Luxpower, Huawei SUN2000, Sungrow, Sofar)
- Heat pump controllers (Viessmann, Stiebel Eltron, Wolf, Nibe, Daikin)
- Smart meters (Eastron SDM series, ABB B-series, Siemens PAC series)
- Shelly devices (all Gen1/Gen2/Gen3 energy-relevant models)
- Zigbee energy sensors (IKEA, Tuya, Sonoff, Third Reality)

Each device entry format:
```json
{
  "id": "deye-sun-6k-sg04lp3",
  "manufacturer": "Deye",
  "model": "SUN-6K-SG04LP3-EU",
  "type": "hybrid-inverter",
  "protocols": ["modbus-tcp"],
  "capabilities": ["pv", "battery", "grid", "load"],
  "phase": "3",
  "maxPowerW": 6000,
  "firmwareVersion": null,
  "datasheet": "https://www.deye.com.cn/...",
  "modbusUnitId": 1,
  "modbusPort": 502,
  "registerProfile": "deye-sun-6k-sg04lp3"
}
```

---

#### D3: Matter/Thread Full Implementation (P2-MATTER)

The current `matter-thread.ts` is a well-designed stub. Full implementation requires:
- `@project-chip/matter-node.js` or `matter.js` runtime
- Matter commissioner for device pairing
- EPM cluster (Energy Power Measurement) → `pv`/`load` roles
- DEM cluster (Device Energy Management) → load control
- EVSE cluster → EV charger data
- Thermostat cluster → heat pump
- Thread border router discovery via mDNS

This is a complex multi-sprint effort. Start with a browser-side commissioning wizard
via the W3C WebBluetooth API for BLE-based commissioning.

---

### Phase E — v1.5+ (P3)

#### E1: Home Assistant Custom Integration (P3-HA-CUSTOM)

Expose Nexus-HEMS-Dash as a Home Assistant custom component:
- `custom_components/nexus_hems/` Python package
- Sensors: grid/pv/battery/load/ev power + energy
- Services: `nexus_hems.set_ev_current`, `nexus_hems.set_grid_limit`
- Config flow in HA UI (connection wizard)
- HACS (Home Assistant Community Store) distribution

---

#### E2: EEBUS Certification (P3-EEBUS-CERT)

After Go sidecar integration:
- Full LPC use case test suite (§14a EnWG)
- EEBUS Conformance Test Suite (CTS) integration
- VDE-AR-E 2829-6 compliance validation
- BSI TR-03109-1 security profile testing
- Target: EEBus Initiative e.V. certification

---

## Success Metrics

### Home Assistant (P0-HA)
- [ ] MQTT Discovery: auto-discovers ≥95% of HA energy entities without manual config
- [ ] Reconnect: WS drops handled within 10s without data loss
- [ ] Bidirectional: SET_EV_CURRENT, START/STOP_CHARGING, SET_HEAT_PUMP_POWER all work
- [ ] Test coverage: ≥80% on `homeassistant-mqtt-adapter.test.ts`
- [ ] Entity count: supports ≥50 simultaneous energy entities
- [ ] Latency: state updates propagate to dashboard in ≤2s

### ExecAdapter (P0-EXEC)
- [ ] Security: `npm run test:fuzz -- exec` passes with no injection vectors
- [ ] Whitelist: rejects any command not in `EXEC_SCRIPTS_CONFIG`
- [ ] READ_ONLY_MODE: exec commands produce `rejected_readonly` audit entries
- [ ] Timeout: 30s timeout enforced, process killed, circuit breaker incremented
- [ ] i18n: all UI strings translated (en + de)

### Modbus Profiles (P0-MODBUS)
- [ ] 15+ new device entries in `device-map.example.json`
- [ ] Each entry includes `role` tags on power registers
- [ ] `pnpm type-check` passes (JSON schema validated in tests)

### MQTT Ecosystem (P1-MQTT)
- [ ] TLS: connections with client certs work (unit-tested with fake certs)
- [ ] QoS 1: subscriptions survive broker restart without message loss
- [ ] Topic templates: `{deviceId}` substitution in unit tests

### Hybrid Inverters (P2-HARDWARE-REG)
- [ ] 200+ devices in hardware registry
- [ ] Each new device has working device-map register profile
- [ ] Hardware registry search finds device by manufacturer + model

### EEBUS Certification (P3-EEBUS-CERT)
- [ ] LPC use case (§14a): loadControlLimit write + ack round-trip ≤2s
- [ ] SHIP session stability: 24h uptime without reconnect (soak test)
- [ ] EEBus CTS: ≥90% pass rate on conformance test suite

---

## Architecture Guidelines for New Adapters

### Frontend adapter checklist (from `BaseAdapter`)
```typescript
// 1. Extend BaseAdapter (not EnergyAdapter directly)
export class MyAdapter extends BaseAdapter {
  readonly id = 'my-adapter';           // kebab-case, unique
  readonly capabilities: AdapterCapability[] = ['pv', 'load'];

  // 2. Implement _connect() — never call setStatus() directly, use super
  protected async _connect(): Promise<void> { /* ... */ }

  // 3. Implement _disconnect()
  protected async _disconnect(): Promise<void> { /* ... */ }

  // 4. Implement _sendCommand() — check READ_ONLY_MODE first
  protected async _sendCommand(command: AdapterCommand): Promise<boolean> { /* ... */ }

  // 5. Emit data via emitData() — never this.snapshot directly
  private handleUpdate(data: Partial<UnifiedEnergyModel>): void {
    this.emitData(data); // triggers circuit-breaker + audit
  }
}

// 6. Register with metadata
export function register(): void {
  registerAdapter('my-adapter', (config) => new MyAdapter(config), {
    displayName: 'My Adapter',
    description: 'Short description of what hardware this integrates',
    source: 'contrib',
  });
}

// 7. Named exports for marketplace hot-loading
export const id = 'my-adapter';
export const factory = (config?: Partial<AdapterConnectionConfig>) => new MyAdapter(config);
```

### Backend adapter checklist (from `IProtocolAdapter`)
```typescript
// See apps/api/src/protocols/eebus/EebusProtocolAdapter.ts for full reference
export class MyProtocolAdapter implements IProtocolAdapter {
  readonly id: string;
  readonly protocol: ProtocolType;

  async connect(): Promise<void> { /* ... */ }
  async disconnect(): Promise<void> { /* ... */ }
  async healthCheck(): Promise<AdapterHealth> { /* ... */ }

  async *getDataStream(): AsyncGenerator<UnifiedEnergyDatapoint> {
    // Yield Zod-validated datapoints → EventBus → LiveEnergyAggregator
    const result = energyDatapointSchema.safeParse(candidate);
    if (result.success) yield result.data;
    else writeToDLQ({ ...candidate, error: result.error.message });
  }
}

// Register in apps/api/src/protocols/index.ts
```

### i18n rule
Every new user-facing string → both `apps/web/src/locales/en.ts` AND
`apps/web/src/locales/de.ts`. Use the `adapterConfig.*` namespace for
adapter configuration UI and `monitoring.*` for status labels.

### Safety invariants (never violate)
1. `READ_ONLY_MODE=true` blocks ALL hardware write commands (both API + frontend)
2. Every hardware command goes through `command-safety.ts` (frontend) and
   `energy.ws.ts` + scope check (backend)
3. Circuit breaker: 5 consecutive failures → open for 30s (BaseAdapter default)
4. No shell expansion in ExecAdapter (pass array to `child_process.spawn()`,
   never `shell: true`)
5. Never store credentials in plaintext — use `lib/secure-store.ts` (Dexie + AES-GCM)

---

## Files Changed (This PR — Phase B P0)

| File | Type | Description |
|------|------|-------------|
| `apps/web/src/core/adapters/contrib/homeassistant-mqtt.ts` | Modified | Full rewrite: real MQTT.js + Discovery + HA WS API mode |
| `apps/web/src/core/adapters/contrib/exec-adapter.ts` | New | Safe shell script adapter (frontend side) |
| `apps/api/src/routes/exec.routes.ts` | New | Whitelisted exec endpoint |
| `apps/api/src/services/ExecService.ts` | New | Sandboxed process execution |
| `apps/api/src/data/device-map.example.json` | Modified | +15 hybrid inverter/MPPT/battery profiles |
| `apps/web/src/locales/en.ts` | Modified | HA + exec i18n keys |
| `apps/web/src/locales/de.ts` | Modified | German translations |
| `docs/Ecosystem-Expansion-Roadmap-v5.md` | New | This document |
| `docs/adr/ADR-021-ha-exec-adapter-patterns.md` | New | Architecture decisions |
| `CHANGELOG.md` | Modified | Unreleased entries |
| `FEATURE_STATUS.md` | Modified | Status updates |
