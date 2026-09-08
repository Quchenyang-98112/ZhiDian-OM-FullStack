# ADR-018: Backend-mediated protocol adapters (EventBus → WebSocket bridge + proxy pattern)

- **Status:** Accepted (implemented — PR #197, v1.3.x)
- **Date:** 2026-07-02
- **Deciders:** Maintainer
- **Related:** ADR-002 (Zustand dual-store), ADR-006 (ring-buffer per-adapter sizing), `docs/Backend-Implementation-Roadmap.md`, `docs/Protocol-Adapter-Guide-Backend.md`, `docs/Audit-Report-2026-07-02.md`, HIGH-17 / MED-18 / MED-20 in `docs/Technical-Debt-Registry.md`

## Context

The 2026-07-02 audit (`docs/Audit-Report-2026-07-02.md`) surfaced a keystone gap that
earlier audits missed. The backend protocol layer has **two** real adapters —
`apps/api/src/protocols/modbus/ModbusAdapter.ts` and `.../mqtt/MqttAdapter.ts` — both
implementing `IProtocolAdapter` (`packages/shared-types/src/domain/energy.types.ts`),
validating every datapoint with `energyDatapointSchema`, and piping output into the
`EventBus` (`apps/api/src/core/EventBus.ts`). From there data flows to `TimeseriesService`
(InfluxDB) and `EnergyRouterService` (optimizer).

**But the WebSocket gateway (`apps/api/src/ws/energy.ws.ts`) never subscribes to the
EventBus.** It broadcasts `mock-data.ts` to browser clients on a 2 s loop in *both* mock
**and** live mode. So real adapter data never reaches the UI — the backend adapter layer
is a dead-end for the frontend, and "live mode" today shows the operator simulated data.

`docs/Backend-Implementation-Roadmap.md` §1 already *designed* the WebSocket gateway as an
EventBus subscriber (see the fan-out diagram), so this is unfinished wiring, not a new
architecture. The browser adapters (`apps/web/src/core/adapters/*`) meanwhile connect
directly to hardware, which is fine for dev/demo but carries the CORS/firewall/single-client/
weaker-central-audit limitations documented in the audit. Several protocols (KNX, OCPP-CSMS,
EEBUS continuous SPINE, evcc, OpenEMS) have **no** backend adapter at all (MED-20).

A standing decision is needed on *how* backend adapters feed the UI and how future live
protocols are mediated, so the campaign's next code phases build on one coherent pattern
rather than ad-hoc bridges.

## Decision

Adopt **backend-mediated protocol adapters** as the target architecture for live hardware,
delivered in two layers:

1. **Bridge the EventBus to the WebSocket gateway (the keystone, HIGH-17).**
   `energy.ws.ts` subscribes to the `EventBus` and broadcasts real batched
   `UnifiedEnergyDatapoint`s to clients **when the resolved adapter mode is `live`**, falling
   back to `mock-data.ts` otherwise. Mode is resolved through the existing
   `apps/api/src/config/adapter-mode.ts` (`ADAPTER_MODE` + `ALLOW_LIVE_HARDWARE` double
   opt-in) — never a raw env read. The mock path is retained verbatim as the default so the
   GitHub Pages demo and mock deployments are unaffected.

2. **Backend proxy/gateway pattern per protocol (MED-20).** New live protocols are added as
   backend `IProtocolAdapter` implementations under `apps/api/src/protocols/<protocol>/`,
   mirroring the Modbus/MQTT structure (Zod-validated datapoints, DLQ on
   `energyDatapointSchema` failure, exponential-backoff reconnect, registered in
   `protocols/index.ts`). The matching browser adapter gains an optional "backend proxy"
   connection mode so production deployments route through the server (central auth, audit,
   single upstream connection) while dev/demo keeps browser-direct. This extends the shipped
   Modbus SunSpec REST proxy precedent (PROT-01, `routes/modbus.routes.ts`).

3. **Safety gates are non-negotiable on every backend path.** All live data/command flow
   stays behind `ADAPTER_MODE=live` + `ALLOW_LIVE_HARDWARE=true`; `READ_ONLY_MODE=true`
   continues to block every control command at the WS layer; every command remains recorded
   in the append-only command-audit trail (`apps/api/src/data/command-audit.ts`) with scope
   checks (`ws-scope.ts`). No backend adapter may bypass these.

4. **Per-adapter observability accompanies the bridge (MED-18).** As adapters begin feeding
   the UI, each backend adapter instance exposes Prometheus metrics (connect success/fail,
   poll latency, last-data age, error breakdown) via the existing
   `apps/api/src/middleware/metrics.ts` registry — today only platform-level gauges exist.

This ADR records the **direction**; the implementation lands in later campaign PRs (see the
sequence in `docs/Audit-Report-2026-07-02.md`).

## Consequences

- **Positive:** live mode finally delivers real data to the UI; the two existing backend
  adapters stop being a dead-end; every future protocol has one clear pattern (proxy +
  EventBus + WS bridge) instead of bespoke wiring; central auth/audit/observability for
  production deployments.
- **Positive:** no change to the default mock experience — the demo and mock deployments are
  byte-for-byte unaffected because the bridge is gated on resolved live mode.
- **Negative / residual:** the bridge widens the live-hardware surface, so it must ship with
  the parity/fixture discipline already demanded by MED-12 (worker↔adapter parity) and the
  safety gates above; broadcasting real data raises the bar on backpressure handling in
  `EventBus` (1000-point cap, PERF-07) which must be validated under real ingest.
- **Revisit if:** a push model (server-sent per-device topics) or a device-level store
  (PERF-05 `useDeviceStore`) supersedes the single `UnifiedEnergyModel` broadcast, or if
  browser-direct proves sufficient for all realistic deployments (then downgrade the proxy
  layer to opt-in-only and keep just the EventBus→WS bridge).
