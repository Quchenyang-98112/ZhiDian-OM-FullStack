# ADR-022: Matter/Thread + enbility/eebus-go — P2 Architecture Plan

- **Status:** In Progress — Phase 1 MVP shipped v1.10.0 (`MatterProtocolAdapter`, read-only WS telemetry via `MATTER_BRIDGE_HOST`); full local-commissioner integration still deferred
- **Date:** 2026-07-02
- **Deciders:** Core team
- **Related:** Ecosystem Expansion Roadmap v5.0 (Phase D / P2), ADR-010 (HA integration)

---

## Matter/Thread Full Implementation (P2-MATTER)

### Problem Statement

The current `matter-thread.ts` contrib adapter is a stub. Full Matter implementation
requires a local Matter commissioner (hardware or software), which is not feasible
in a browser-only SPA or a containerised Node.js backend.

### Considered Options

#### Option A — `@project-chip/matter-node.js` embedded in API

Run the official Matter.js reference implementation (`@project-chip/matter-node.js`)
inside the Express API backend.

- **Pros:** No external dependency, full control
- **Cons:** 50+ MB additional dependencies, requires a Thread border router (e.g. Apple TV, Nest Hub) or BLE commissioning, alpha-quality TypeScript API, high maintenance burden
- **Status:** Deferred to v1.5 (blocked on stable matter.js API)

#### Option B — Home Assistant as Matter bridge (Recommended)

Matter devices paired to a Home Assistant instance expose their state via HA's
WebSocket API. The `HomeAssistantMQTTAdapter` (ha-ws-api mode) already
auto-discovers entities by `device_class`, including Matter-bridged devices.

- **Pros:** No new dependencies; Matter devices just work via HA; production-ready today
- **Cons:** Requires HA as intermediary; direct Matter commissioning not possible
- **Status:** Already implemented via `HomeAssistantMQTTAdapter` (PR #209)

#### Option C — Matter WebSocket Bridge

Run a local `chip-tool` or `python-matter-server` process and bridge its data to
the HEMS API via WebSocket.

- **Pros:** Direct commissioner; no HA dependency
- **Cons:** Requires system-level socket access; Docker multi-process complexity
- **Status:** Candidate for v1.5; needs ADR + prototype

### Decision

**Option B is the recommended path today** (already implemented via HA integration).
For users who want direct Matter without HA: implement a lightweight
`python-matter-server` bridge adapter in v1.5 as an alternative path.

### Implementation Scaffold (for v1.5 reference)

When implementing direct Matter support:

1. New backend service: `apps/api/src/services/MatterBridgeService.ts`
   - Connects to `python-matter-server` WebSocket (`ws://localhost:5580`)
   - Discovers EPM (Energy Power Measurement) clusters
   - Maps Matter power readings → `UnifiedEnergyDatapoint` role `load`/`pv`

2. New backend adapter: `apps/api/src/protocols/matter/MatterAdapter.ts`
   - Implements `IProtocolAdapter`
   - Handles cluster subscriptions and attribute reports

3. Frontend adapter update: `apps/web/src/core/adapters/contrib/matter-thread.ts`
   - Add `matter-bridge-ws` connection mode
   - Map Matter cluster attributes to `UnifiedEnergyModel`

4. New `DeviceProtocol` value `matter-thread` — already added to `hardware-registry.ts`

**Environment variables (v1.5):**
```
MATTER_BRIDGE_WS_URL=ws://localhost:5580  # python-matter-server WebSocket
```

---

## enbility/eebus-go Go Sidecar (P2-EEBUS-GO)

### Problem Statement

The current `EebusProtocolAdapter` (PR #208) uses JSON text framing over WebSocket
SHIP. While compatible with most commercial devices, it does not support:
- Binary SHIP message framing (SHIP v1.0.1 §4.1 — required for certification)
- Full SPINE protocol negotiation (feature discovery, entity description, access methods)
- EEBus Initiative conformance testing

For EEBUS certification readiness, the `enbility/eebus-go` reference implementation
provides production-grade SHIP + SPINE in Go.

### Architecture Plan

```
┌──────────────────────────────────────────────────────────────────────┐
│ Nexus-HEMS-Dash API (Node.js/Express)                                │
│                                                                      │
│  EebusProtocolAdapter.ts                                             │
│    ↓ connects to http://localhost:4713 (or sidecar service URL)      │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────────┐ │
│  │ eebus-go sidecar (separate process / container)                │ │
│  │  - SHIP v1.0.1 binary framing                                  │ │
│  │  - SPINE v1.3.0 full protocol                                  │ │
│  │  - mTLS TLS 1.3                                                │ │
│  │  - REST + WebSocket bridge API on :4713                        │ │
│  │  - Exposes: /devices, /pair, /pair/pin, /data, /ws/data        │ │
│  └─────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────┘
         ↕ SHIP/SPINE mTLS
  EEBUS Device (Heat Pump, EV Charger, Smart Meter)
```

### Implementation Plan (v1.5)

1. **Go module:** `go/eebus-proxy/` in the monorepo root
   - Go module: `github.com/qnbs/nexus-hems-dash/eebus-proxy`
   - Dependency: `github.com/enbility/eebus-go` (Apache-2.0)
   - Dependency: `github.com/enbility/ship-go` + `github.com/enbility/spine-go`

2. **Bridge REST + WS API:** `go/eebus-proxy/api/`
   - `GET /devices` → trusted device list (mirrors EEBusTrustStore)
   - `POST /pair` → initiate SHIP pairing
   - `GET /data` → latest SPINE measurements JSON
   - `WS /ws/data` → push SPINE measurement updates
   - `POST /loadcontrol` → send LoadControl limit (§14a EnWG / LPC)

3. **Node.js adapter delegation:** `EebusProtocolAdapter.ts` gains a
   `EEBUS_GO_BRIDGE_URL` env var; when set, all SPINE operations delegate
   to the Go sidecar instead of the built-in WebSocket handler.
   **Zero frontend changes required.**

4. **Docker Compose:**
   ```yaml
   eebus-go:
     build: ./go/eebus-proxy
     environment:
       - EEBUS_GO_PORT=4713
       - EEBUS_CERT_FILE=/data/eebus-server.cert.pem
       - EEBUS_KEY_FILE=/data/eebus-server.key.pem
     volumes:
       - eebus-data:/data
     ports:
       - "4712:4712"  # SHIP (IANA registered)
   api:
     environment:
       - EEBUS_GO_BRIDGE_URL=http://eebus-go:4713
   ```

5. **Helm chart:** add `eebus-go` as sidecar container in the `nexus-hems` pod

6. **CI:** Add `go test ./...` step, `go vet`, `golangci-lint`

### Migration Path from Current JSON-WS to Go Sidecar

The migration is transparent to the frontend adapter:
1. Deploy `eebus-go` sidecar container
2. Set `EEBUS_GO_BRIDGE_URL=http://localhost:4713` on the API
3. The `EebusProtocolAdapter` auto-detects the env var and delegates
4. Existing trust store (`data/eebus-trust.json`) is read by the Go sidecar
5. No frontend changes, no UI changes

### Certification Readiness Checklist (post-Go sidecar)

- [ ] LPC §14a EnWG: `loadControlLimitListData` write round-trip ≤ 2s
- [ ] MGCP: `measurementListData` `GridFeedIn` notifications ≥ 1/min
- [ ] MPC: `measurementListData` `ACPowerTotal` notifications ≥ 1/min
- [ ] SHIP handshake: binary framing per SHIP v1.0.1 §4.1
- [ ] SKI verification: per SHIP v1.0.1 §4.2
- [ ] EEBus CTS: ≥ 90% pass rate on EEBus Initiative conformance test suite
- [ ] VDE-AR-E 2829-6: LPC/LPP/MPC/MGCP use case compliance

---

## Files Affected (P2 — Current Sprint)

| File | Change |
|------|--------|
| `apps/web/src/core/hardware-registry.ts` | +~90 devices, 3 new DeviceProtocol types |
| `apps/api/src/protocols/heatpump/HeatPumpAdapter.ts` | New IProtocolAdapter for Stiebel/Viessmann/Wolf/NIBE/Alpha/Daikin |
| `apps/api/src/protocols/index.ts` | Register HeatPumpAdapter (via HEATPUMP_HOST env) |
| `docs/adr/ADR-022-matter-thread-eebus-go-p2-architecture.md` | This file |
