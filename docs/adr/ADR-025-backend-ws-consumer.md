# ADR-025: Opt-In Backend WebSocket Consumer (`useServerWebSocket`)

- **Status:** Accepted
- **Date:** 2026-07-03
- **Related:** ADR-018 (backend-mediated protocol adapters / EventBus→WS bridge), HIGH-17, `useEnergyStore`, `energy.ws.ts`

---

## Context

HIGH-17 (PR #197, ADR-018) wired the backend `EventBus → LiveEnergyAggregator → WebSocket` broadcast so that, in live mode with fresh data, the Express gateway ships real adapter data (`resolveBroadcastData` in `apps/api/src/ws/energy.ws.ts`).

A 2026-07-03 verification audit found the **frontend consumer was never mounted**: `useServerWebSocket` (`apps/web/src/core/useEnergyStore.ts`) existed with full backoff/jitter logic but had **zero call sites**. The shipped app runs protocol adapters **client-side** via `useAdapterBridge()` and never opened a socket to the backend. Two further gaps compounded this:

1. **Shape mismatch.** The gateway broadcasts the **flat** `EnergyData` snapshot (`gridPower`, `pvPower`, …). The store accumulates the **nested** `UnifiedEnergyModel` (`pv`, `battery`, `grid`, `load`). The old `onmessage` cast `msg.data as Partial<UnifiedEnergyModel>` and merged it verbatim — a latent no-op (keys never align).
2. **No validation.** Neither end validated `ENERGY_UPDATE`; `WSMessageSchema`/`WSEnergyUpdateSchema` were dead on the wire (R2).

The static GitHub Pages demo has **no backend**, so unconditionally opening a socket there would spin a permanent reconnect loop.

## Decision

Mount `useServerWebSocket` in `App.tsx` alongside `useAdapterBridge()`, **gated by a build flag** `VITE_BACKEND_WS` (`isBackendWsEnabled()` in `apps/web/src/lib/adapter-mode.ts`):

- **Default OFF.** The gh-pages static demo and standard PWA builds never open the socket — behaviour is byte-for-byte unchanged; the client-side adapters remain the runtime.
- **Full-stack opt-in.** Deployments where the Express API is reachable set `VITE_BACKEND_WS=true` to consume the backend broadcast (the real HIGH-17 live path).

Correctness fixes shipped with the mount:

- **Flat→nested projection** — `mapServerEnergyDataToUnified()` (`apps/web/src/core/server-energy-mapping.ts`) projects `EnergyData` into a complete `Partial<UnifiedEnergyModel>` before merge.
- **Inbound validation** — the consumer validates every frame with `WSMessageSchema` and drops non-conforming frames.
- **Outbound validation** — `resolveBroadcastData` validates the live snapshot with `EnergyDataSchema` and falls back to the mock stream on failure (fail-safe; never ship out-of-contract data).
- **Liveness watchdog** — a silent socket (no `ENERGY_UPDATE` within 6 s, vs. the 2 s broadcast cadence) is force-closed to trigger reconnect, since `onclose` alone cannot detect a half-open stall.
- **Observability** — `serverWsConnected` store field drives a conditional "Backend WS" status pill on the Monitoring page (rendered only when the flag is on).

## Consequences

- The HIGH-17 backend live path now has a **real, tested consumer** for full-stack deployments without disturbing the static demo.
- New wire boundary is Zod-validated in both directions; the previously dead `WSMessageSchema`/`EnergyDataSchema` are now enforced on the live wire.
- `useServerWebSocket` and the mapping are unit-tested (`use-server-websocket.test.ts`, `server-energy-mapping.test.ts`); the backend fallback is covered in `live-energy-aggregator.test.ts`.
- The client-side-adapter path (`useAdapterBridge`) remains the default and is unchanged. The two paths are mutually independent; enabling `VITE_BACKEND_WS` adds a `'server'` virtual adapter merge source, it does not replace the adapters.

## Alternatives considered

- **Remove `useServerWebSocket` as dead code** and declare client-side adapters canonical. Rejected: it would discard the entire HIGH-17 backend investment and leave full-stack/edge-hardware deployments with no server-mediated data path.
- **Mount unconditionally.** Rejected: guarantees a permanent failed-reconnect loop on the static demo (no backend), and would change demo behaviour.
- **Have the backend emit the nested `UnifiedEnergyModel`.** Rejected for now: `EnergyData` is the established gateway contract consumed by other clients/tests; a client-side projection is lower-blast-radius than changing the wire schema.
