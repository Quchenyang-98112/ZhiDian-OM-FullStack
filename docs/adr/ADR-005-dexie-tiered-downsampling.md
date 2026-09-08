# ADR-005: Dexie Tiered Downsampling Strategy

- **Status:** Accepted
- **Date:** 2026-04-25
- **Deciders:** @qnbs
- **Supersedes:** On-demand downsampling (no auto-trigger)

## Context

Dexie.js (IndexedDB) schema v10 already defines the `energyAggregates` table with compound index
`[resolution+bucketTs]`. However, no background service populates this table. Without automatic
downsampling:

- 7-day history queries scan all ~100 800 raw 1-second snapshots (at 10 Hz recording)
- `energySnapshots` table can overflow the 50 000-item cap
- Historical charts in `Analytics.tsx` are slow on mobile/PWA

## Decision

Implement a **tiered background downsampling service** (`apps/web/src/lib/downsampling-service.ts`):

### Bucket strategy

| Source | Interval | Target table | Target resolution |
|--------|----------|-------------|-------------------|
| `energySnapshots` (raw) | 1 s – 1 min | `energyAggregates` | `15m` |
| `energyAggregates` (`15m`) | 15 min – 24 h | `energyAggregates` | `1h` |

### Trigger schedule

```typescript
// Run 90 s after app load (avoids startup contention), then every 5 min
setTimeout(() => startDownsamplingService(), 90_000);
setInterval(() => runDownsamplingCycle(), 5 * 60_000);
```

### Algorithm (per cycle)

1. Find all raw snapshots older than 1 min that haven't been aggregated
2. Group by 15-minute bucket (floor to `Math.floor(ts / (15 * 60_000)) * (15 * 60_000)`)
3. Average all numeric fields within each bucket (pvPower, batterySoC, etc.)
4. Write bucket to `energyAggregates` as `resolution: '15m'`
5. Repeat for 1h buckets from 15m aggregates

### Idempotency

- Each bucket is identified by `[resolution, bucketTs]` unique compound key
- If a bucket already exists, skip (no duplicate writes)
- Dexie `put()` with key check via `getByKeys()`

## Rationale

- **Background, non-blocking** — Runs after app load; uses `requestIdleCallback` when available
- **Tiered** — 15-min tier for 1-week views; 1-hour tier for 30-day views
- **IndexedDB-native** — No server round-trip; works fully offline
- **Bounded storage** — 15-min aggregates: ~672 entries/week; 1-hour: 168 entries/week

## Performance Impact

| Query type | Before | After |
|-----------|--------|-------|
| 24-hour chart (raw) | ~86 400 rows | ~96 rows (15m agg) |
| 7-day chart | ~604 800 rows | ~672 rows (15m agg) |
| 30-day chart | ~2.6M rows | ~720 rows (1h agg) |

## Consequences

**Positive:**
- Historical charts respond in <200 ms (vs multi-second raw scans)
- Mobile/PWA performance dramatically improved
- `energySnapshots` table pressure reduced

**Negative:**
- Aggregates lose sub-15-minute resolution for historical views
- Background service consumes IndexedDB write quota during aggregation cycles

## Related Files

- `apps/web/src/lib/downsampling-service.ts` — implementation
- `apps/web/src/lib/db.ts` — Dexie v10/11 schema
- `apps/web/src/main.tsx` — service startup
- `apps/web/src/pages/Analytics.tsx` — consumer

## Supporting Links

- [Dexie.js bulk operations](https://dexie.org/docs/Table/Table.bulkPut())
- [requestIdleCallback MDN](https://developer.mozilla.org/en-US/docs/Web/API/Window/requestIdleCallback)
