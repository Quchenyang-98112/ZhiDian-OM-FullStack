# ADR-006: Ring-Buffer Per-Adapter Sizing

- **Status:** Accepted
- **Date:** 2026-04-25
- **Deciders:** @qnbs
- **Supersedes:** Fixed 1 000-item ring buffer (all adapters)

## Context

The `useEnergyStore` ring buffer holds up to 1 000 `HistoryPoint` snapshots (one per 250 ms flush).
This is a fixed constant for all adapter types:

```typescript
// Current — one size fits all
const MAX_HISTORY = 1_000;
```

Problem: different adapters have very different update rates and visualization needs:

| Adapter | Update rate | Typical need | Penalty of 1k |
|---------|------------|--------------|---------------|
| `ocpp-21` | Up to 10 Hz V2X micro-updates | 500 items (>2 min window) | Wastes 500 slots |
| `victron-mqtt` | 1 Hz | 200 items (~3 min) | Wastes 800 slots |
| `knx` | 0.1 Hz events | 100 items | Wastes 900 slots |
| `eebus` | 1 Hz | 200 items | Wastes 800 slots |
| `modbus-sunspec` | 0.5 Hz | 150 items | Wastes 850 slots |

At 1 000 items × ~500 bytes/point × up to 13 adapters = ~6.5 MB in-memory ring buffer.
With adaptive sizing: ~1.3 MB total.

## Decision

Replace the fixed `MAX_HISTORY` constant with a `RING_BUFFER_SIZES` map:

```typescript
export const RING_BUFFER_SIZES: Record<string, number> = {
  'ocpp-21': 500,     // V2X micro-updates, frequent EV state changes
  'victron-mqtt': 200, // 1 Hz Cerbo GX data
  'eebus': 200,        // 1 Hz SPINE/SHIP
  'modbus-sunspec': 150, // 0.5 Hz polling
  'knx': 100,          // event-driven, low frequency
  'homeassistant-mqtt': 200,
  'zigbee2mqtt': 150,
  'shelly-rest': 100,
  'matter-thread': 100,
  'default': 100,      // fallback for unknown adapters
};
```

The ring buffer per adapter is enforced in `mergeData()`:

```typescript
// Trim oldest entries if over adapter-specific limit
const maxHistory = RING_BUFFER_SIZES[adapterId] ?? RING_BUFFER_SIZES['default'];
if (state.history.length > maxHistory) {
  newHistory = newHistory.slice(-maxHistory);
}
```

## Rationale

- **Memory efficiency** — ~5× reduction in ring buffer memory usage
- **No breaking change** — `history` slice still works identically for all consumers
- **Per-adapter tuning** — EV adapter keeps more history for V2X charge curve visualization
- **Configurable at runtime** — can be overridden via settings if needed

## Consequences

**Positive:**
- Memory pressure reduced, especially on edge devices (Raspberry Pi 4, 2 GB RAM)
- Tauri/Capacitor deployments benefit most

**Negative:**
- Very high-frequency adapters (>10 Hz) may lose short-term history faster
- `RING_BUFFER_SIZES` map must be kept in sync when new adapters are added

## Related Files

- `apps/web/src/core/useEnergyStore.ts` — implementation
- `docs/adr/ADR-002-zustand-dual-store-pattern.md` — parent decision
