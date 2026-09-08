# ADR-020: EEBUS SPINE/SHIP Backend Protocol Adapter

- **Status:** Accepted
- **Date:** 2026-07-02
- **Deciders:** Core team
- **Related:** MED-20 (Technical-Debt-Registry) — EEBUS frontend adapter ↔ backend `IProtocolAdapter` parity

---

## Context and Problem Statement

The repository shipped a well-engineered EEBUS **pairing layer** (`ShipHandshakeService`,
`EEBusTrustStore`, REST API in `eebus.routes.ts`) and a rich **frontend adapter**
(`EEBUSAdapter.ts`) capable of sending/receiving SPINE messages via the `/ws/eebus`
browser-proxy. However, there was no `IProtocolAdapter` implementation on the backend,
meaning EEBUS data could **never** reach the `EventBus → LiveEnergyAggregator → dashboard`
pipeline in `ADAPTER_MODE=live`. The frontend `CertificateManagement.tsx` component
(~1,175 lines, feature-complete) was also entirely orphaned — imported nowhere.

This ADR documents the architectural decisions made when closing this gap.

---

## Decision Drivers

1. **§14a EnWG compliance** — Controllable power consumers (EV charger, heat pump) must
   receive and honour grid-operator load limitation signals. EEBUS LPC use-case delivers
   these signals as SPINE `loadControlLimitListData` messages.
2. **Continuous telemetry** — SPINE `measurementListData` notifications must reach the
   energy dashboard in near-real-time (MPC / MGCP use cases).
3. **Security-first** — mTLS 1.3 is non-negotiable for SHIP. SKI fingerprint verification
   must happen on every connection, not just during initial pairing.
4. **Parity with other adapters** — KNX, evcc, Modbus all implement `IProtocolAdapter`;
   EEBUS must too.
5. **Backwards compatibility** — The pairing layer (`ShipHandshakeService`) and browser
   proxy (`/ws/eebus`) must remain intact; the new adapter extends the data path without
   replacing it.

---

## Considered Options

### Option A — Reuse `ShipHandshakeService` for data sessions
Extend `ShipHandshakeService` to emit data events after the handshake completes.

*Rejected:* `ShipHandshakeService` is a single-use pairing FSM; adapting it for long-lived
sessions would conflate two distinct responsibilities and risk breaking existing pairing code.

### Option B — Dedicated `EebusProtocolAdapter` leveraging trust store
Create `apps/api/src/protocols/eebus/EebusProtocolAdapter.ts` that reads the trust store,
independently establishes SHIP sessions for all trusted devices, and emits datapoints to
the EventBus.

*Accepted.* Clean separation of concerns: pairing remains in `ShipHandshakeService`;
ongoing data sessions are managed by the new adapter.

### Option C — enbility/eebus-go sidecar service
Run a Go process (`enbility/eebus-go` reference implementation) alongside the Node.js API,
exposing SPINE data via a REST/WebSocket bridge.

*Deferred to v1.5+.* Would provide the most complete SPINE protocol coverage and is the
recommended path toward EEBUS certification. However, it adds a Go build dependency, Docker
multi-process orchestration, and operational complexity that exceeds the current sprint scope.
The `EebusProtocolAdapter` design explicitly prepares for this migration: the frontend
adapter already proxies all commands through `/api/eebus/*` REST endpoints, so swapping the
backend implementation to delegate to a Go sidecar requires only changes in
`EebusProtocolAdapter` and `eebus.routes.ts`.

---

## Decision

Implement **Option B** with the following design constraints:

### 1. Session lifecycle
- On `connect()`, load all `status: 'trusted'` devices from `EEBusTrustStore`.
- For each device, create an `EebusDataSession` managing a single WebSocket to
  `wss://{hostname}:{port}/ship/`.
- SHIP hello exchange confirms the device is still trusted (no PIN required). Any
  `connectionPinState` message causes the device to be marked `pending` and the WS closed.
- A trust-store poll (default 60 s) picks up newly paired devices without restart.

### 2. TLS 1.3 / mTLS
- Reuses the same ECDSA P-256 server certificate as `ShipHandshakeService`
  (`EEBUS_CERT_FILE` / `EEBUS_KEY_FILE`).
- `checkServerIdentity` verifies the peer's SKI matches the trust-store entry before
  any SPINE messages are accepted.
- `minVersion: 'TLSv1.3'`, `maxVersion: 'TLSv1.3'` enforced on the `https.Agent`.

### 3. SPINE datagram parsing
Only `notify` / `reply` datagrams containing `measurementListData` or
`loadControlLimitListData` produce `UnifiedEnergyDatapoint` emissions. Other SPINE
features (IncentiveTable, DeviceDiagnosis) are subscribed to but their datagrams are
silently consumed (relevant for future use cases).

Scope → role mapping follows VDE-AR-E 2829-6 §7.4:

| SPINE scopeType | EnergyRole | MetricType | Use Case |
|---|---|---|---|
| `ACPowerTotal` | `load` | `POWER_W` | MPC |
| `GridFeedIn` | `grid` | `POWER_W` | MGCP |
| `StateOfCharge` | `battery` | `SOC_PERCENT` | Battery |
| `ChargingPower` | `ev` | `POWER_W` | EVCC |
| `HeatPumpPower` | `heatpump` | `POWER_W` | HP |
| `SelfConsumption` | `pv` | `POWER_W` | LPP |

### 4. LoadControl limits (§14a EnWG / LPC)
Active `loadControlLimitListData` entries are emitted as `POWER_W` datapoints.
Role is derived from `limitId` convention:
- `1–9` → `ev` (EV charger / wallbox)
- `10–19` → `heatpump`
- `≥100` → `grid` (grid connection point restriction)

Current-in-amperes limits (`unit: 'A'`) are converted to watts assuming 230 V (single-
phase approximation). This is sufficient for monitoring and basic MPC scheduling; a
future update should use `ElectricalConnection.nominalVoltage` from the device's entity
description for accurate phase-aware conversion.

### 5. Error handling
- SHIP reconnect: exponential backoff (1 s base, 120 s max).
- Malformed SPINE JSON → DLQ (`dead-letter.ndjson`) + `recordAdapterDlq` metric.
- `energyDatapointSchema.safeParse` validates every emitted datapoint; failures → DLQ.
- `EebusProtocolAdapter.healthCheck()` aggregates per-session connected status.

### 6. Disable switch
`EEBUS_DISABLE=true` skips adapter registration entirely. Useful for environments
without local network access to EEBUS devices (CI, pure-cloud deployments).

---

## Consequences

### Positive
- EEBUS data now reaches the live dashboard via the standard `EventBus → LiveEnergyAggregator` path.
- §14a EnWG LPC signals are captured and emitted to the optimizer.
- The `CertificateManagement.tsx` UI is now accessible via Settings → EEBUS Certs.
- All new code is covered by `EebusProtocolAdapter.test.ts` (17 unit tests).

### Negative / Risk
- SHIP protocol framing is simplified: SPINE JSON is transmitted as WebSocket text frames
  (as supported by most commercial devices); devices requiring binary SHIP framing (rare,
  older firmware) are not yet supported. Mitigation: DLQ captures unrecognised messages.
- `limitId` → role mapping is a convention, not a SPINE spec-mandated mapping. Commercial
  devices may use different `limitId` assignments. Mitigation: the mapping is a constant
  in `EebusProtocolAdapter.ts` and easily overridden per deployment.

### Deferred (tracked in Technical Debt Registry)
- Go sidecar with `enbility/eebus-go` for full SHIP binary framing and certification-
  grade SPINE protocol support (v1.5+ target, see `docs/Technical-Debt-Registry.md`).
- mDNS/DNS-SD discovery service for automatic `_ship._tcp` device browsing.
- UC 2.6.x Matter↔EEBUS interworking (EEBUS paths in `uc26-translator.ts`).
- OCSP/CRL revocation policy wired into `https.Agent`.

---

## File Changes

| File | Change |
|---|---|
| `apps/api/src/protocols/eebus/EebusProtocolAdapter.ts` | New — `IProtocolAdapter` implementation |
| `apps/api/src/protocols/eebus/EebusProtocolAdapter.test.ts` | New — 17 unit tests |
| `apps/api/src/protocols/index.ts` | Register `EebusProtocolAdapter` in `startProtocolAdapters()` |
| `apps/web/src/pages/Settings.tsx` | Add `certificates` tab; import `CertificateManagement` |
| `apps/web/src/locales/en.ts` | `settings.certificatesTab`, `settings.certificatesTabDesc` |
| `apps/web/src/locales/de.ts` | German translations for above |
| `FEATURE_STATUS.md` | EEBUS row updated to ✅/✅ |
| `CHANGELOG.md` | Unreleased entries for adapter + certificates tab |
