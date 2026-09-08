# ADR-024: BaseAdapter `connect()` is Non-Throwing (Status-Based Failure Signalling)

- **Status:** Accepted
- **Date:** 2026-07-02
- **Related:** ADR-018 (backend-mediated protocol adapters), ADR-019 (adapter instance management), `BaseAdapter`, `AddAdapterWizard`, PR #226

---

## Context

`BaseAdapter.connect()` (`apps/web/src/core/adapters/BaseAdapter.ts`) is the public template method every frontend adapter inherits. It wraps the adapter-specific `_connect()` in a try/catch that, on failure, records a circuit-breaker failure, increments the error counter, and sets status to `error`.

An earlier audit flagged that `connect()` **does not re-throw** on failure — it resolves `undefined` even on a hard connection failure. Two contract shapes were possible:

- **Option A — re-throw:** `connect()` records the failure *and* re-throws, so `await connect()` rejects. Callers detect failure via try/catch.
- **Option B — non-throwing:** `connect()` records the failure and returns normally. Callers detect failure via the adapter's `status` (`'error'`) and the `onStatus(status, error?)` callback.

PR #226 aligned the adapter unit tests (`evcc`, `homeassistant-mqtt`, `openadr`) to **Option B**, asserting post-connect status rather than `rejects.toThrow`. This matches the primary consumer, `useEnergyStore`, which fires connections fire-and-forget (`void entry.adapter.connect()`) and observes state through `onStatus`/`setAdapterStatus` — a throwing contract there would surface only as an unhandled rejection.

## Decision

**`BaseAdapter.connect()` is non-throwing by contract.** On any unrecoverable failure it:

1. sets status to `'error'` with a message,
2. increments `_totalErrors`,
3. records a circuit-breaker failure,

and resolves normally. **Failure is signalled through `status === 'error'` and the `onStatus(status, error?)` callback, never through a rejected promise.**

Adapter authors implement `_connect()` to throw on every unrecoverable path; the base method converts that throw into recorded state.

## Consequences

- **Consumers must check status, not catch.** Any caller that needs to branch on connection success must read `adapter.status` after awaiting `connect()` (and/or subscribe to `onStatus` for the error message) — awaiting alone never rejects.
- **`AddAdapterWizard` fix (this pass):** the "test connection" flow previously assumed a throwing contract (`Promise.race([connect(), timeout])` inside try/catch) and therefore reported **false success** for a failed live probe. It now subscribes to `onStatus` to capture the error and checks `probe.status === 'error'` after the race before reporting success. See the wizard's `runTest`.
- **`useEnergyStore` is unaffected** — its `void connect()` + `onStatus` path already matches this contract.
- **If a future caller genuinely needs a throwing connect**, wrap it (`connectOrThrow`) rather than changing this contract, to avoid re-introducing unhandled rejections in the store path.

## Alternatives considered

**Option A (re-throw)** was rejected as higher blast-radius: it would reverse the CI-green #226 test alignment, require a `.catch()` on every `void connect()` call site to avoid unhandled rejections, and provide no benefit over status-based detection for the fire-and-forget store path. The single real defect (wizard false-success) is fully resolved by the status check under Option B.
