# ADR-002: Zustand Dual-Store Pattern

- **Status:** Accepted
- **Date:** 2026-04-25
- **Deciders:** @qnbs
- **Supersedes:** Single-store pattern (pre-monorepo)

## Context

The application needs two fundamentally different types of state:

1. **UI/Settings state** — user preferences, theme, locale, onboarding; must survive page reloads
2. **Real-time energy data** — adapter aggregations, 10 Hz updates; must never be persisted to disk

Combining both in a single Zustand store with `persist` middleware would either persist 10 Hz data
(causing localStorage quota exhaustion) or lose settings on refresh.

## Decision

Maintain two separate Zustand stores:

### `useAppStore` (`apps/web/src/store.ts`)
- **Purpose:** UI/settings with `persist` middleware → localStorage
- **Contains:** `EnergyData`, `FloorplanState`, `StoredSettings`, locale, theme, onboarding
- **Subscribe pattern:** `useAppStoreShallow` for multi-selector access
- **No throttling** — settings updates are infrequent; direct `set()` is adequate

### `useEnergyStore` (`apps/web/src/core/useEnergyStore.ts`)
- **Purpose:** Adapter aggregation — no persistence
- **Contains:** `UnifiedEnergyModel`, per-adapter status, circuit breaker state, ring buffer
- **Performance:** 250 ms UI throttle via accumulator + `flushMerge()`; `stableMerge()` returns
  original reference if nothing changed (avoids unnecessary re-renders)
- **Bridge:** `useAdapterBridge()` syncs real-time data back to `useAppStore` for legacy components

## Rationale

- **Isolation:** localStorage pollution prevention
- **Performance:** Throttled real-time updates don't propagate through persist middleware
- **Compatibility:** `useAdapterBridge()` ensures all existing components work without refactor
- **Memory safety:** Ring buffer bounded at 1 000 points; eviction automatic

## Consequences

**Positive:**
- Settings persist across reloads
- Real-time data never overflows localStorage
- Shallow selectors work correctly on both stores

**Negative:**
- Bridge hook `useAdapterBridge()` must be mounted at app root
- Developers must know which store to use for new state (guideline: settings/UI → `useAppStore`; real-time → `useEnergyStore`)

## Ring-Buffer Sizing (ADR-006 companion)

With the adaptive ring-buffer (see ADR-006), buffer sizes are now:
- `ocpp-21`: 500 items (frequent V2X micro-updates)
- `victron-mqtt`: 200 items
- `knx`: 150 items
- default: 100 items

## Related Files

- `apps/web/src/store.ts` — useAppStore
- `apps/web/src/core/useEnergyStore.ts` — useEnergyStore
- `docs/adr/ADR-006-ring-buffer-per-adapter-sizing.md`
