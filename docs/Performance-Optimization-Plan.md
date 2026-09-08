# Performance Optimization Plan — Nexus-HEMS-Dash

> **Status:** Active
> **Last Updated:** 2026-04-26
> **Horizon:** Q2–Q3 2026

This document covers all planned and implemented performance optimizations, their rationale,
implementation strategy, and metrics targets.

## Scope Classification (Verified 2026-04-26)

| Topic | Classification | Notes |
|------|----------------|-------|
| Dexie tiered downsampling | Implemented | Background service and aggregate tables are already wired |
| Adaptive ring-buffer sizing | Implemented | Per-adapter sizing is already active in `useEnergyStore.ts` |
| Sankey Web Worker | Implemented | Layout computation already runs off the main thread |
| REST polling worker isolation | Implemented | Worker exists; remaining work is monitoring and fine-tuning |
| AI worker isolation | Implemented | Optimization work is already offloaded; remaining work is verification/reporting |
| Lighthouse CI | Implemented | Existing workflow enforces thresholds and stores reports |
| LTTB chart sampling | Implemented & integrated | `sampleIfNeeded` (LTTB) is wired into `HistoricalChart.tsx` and `HistoricalAnalyticsPage.tsx`; utility + tests in `lib/chart-sampling.ts` (MED-17 closed) |
| `.perf` convention and runtime perf probes | Not implemented | Keep CI-first and lightweight for v1.2.0 |
| Canvas/WebGL or virtualization fallback | Deferred | Only revisit if profiling still shows regressions after LTTB integration |

---

## Performance Baseline (2026-04-25)

| Metric | Current | Target |
|--------|---------|--------|
| `useEnergyStore.mergeData()` latency | unmeasured | <50 ms at 1000 updates/min |
| Ring buffer memory (all adapters) | ~6.5 MB (1k × 13 adapters) | ~1.3 MB (adaptive sizing) |
| Dexie 7-day history query | seconds (raw scan) | <200 ms (aggregate) |
| Chart render (1000 data points) | >16 ms (dropped frames) | <16 ms (LTTB sampled) |
| Sankey layout computation | ~80 ms (main thread, old) | ~20 ms (Web Worker) |
| App initial load (Lighthouse) | ≥85 Performance | maintain ≥85 |

---

## P1: Dexie Tiered Downsampling (ADR-005)

**File:** `apps/web/src/lib/downsampling-service.ts`
**Status:** Implemented (Phase 2)
**Gap closed:** G-04

### Problem

Dexie `energyAggregates` table schema exists (v10) but no background service populates it.
7-day history charts scan all ~604 800 raw 1-second snapshots → multi-second query time.

### Solution

Background service started 90 s after app load:

```typescript
export function startDownsamplingService(): void {
  // Delay first run to avoid startup contention
  setTimeout(() => runDownsamplingCycle(), 90_000);

  // Then run every 5 minutes
  const handle = setInterval(() => runDownsamplingCycle(), 5 * 60_000);

  // Cleanup on page unload
  window.addEventListener('beforeunload', () => clearInterval(handle));
}

async function runDownsamplingCycle(): Promise<void> {
  await downsampleRawTo15m();
  await downsample15mTo1h();
}
```

### Bucket algorithm

```typescript
async function downsampleRawTo15m(): Promise<void> {
  const BUCKET_MS = 15 * 60_000;
  const cutoff = Date.now() - BUCKET_MS; // only process completed buckets

  const raws = await db.energySnapshots
    .where('timestamp')
    .below(cutoff)
    .toArray();

  // Group by bucket
  const buckets = new Map<number, EnergySnapshot[]>();
  for (const snap of raws) {
    const bucket = Math.floor(snap.timestamp / BUCKET_MS) * BUCKET_MS;
    if (!buckets.has(bucket)) buckets.set(bucket, []);
    buckets.get(bucket)!.push(snap);
  }

  // Average and write
  for (const [bucketTs, snaps] of buckets) {
    const existing = await db.energyAggregates
      .where('[resolution+bucketTs]')
      .equals(['15m', bucketTs])
      .first();
    if (existing) continue; // idempotent — skip if already aggregated

    const avg = computeAverage(snaps);
    await db.energyAggregates.put({
      resolution: '15m',
      bucketTs,
      sampleCount: snaps.length,
      ...avg,
    });
  }
}
```

### Performance impact

| Query | Before | After |
|-------|--------|-------|
| 24h chart | ~86 400 rows | ~96 rows (15m) |
| 7-day chart | ~604 800 rows | ~672 rows (15m) |
| 30-day chart | ~2.6M rows | ~720 rows (1h) |

---

## P2: Ring-Buffer Adaptive Sizing (ADR-006)

**File:** `apps/web/src/core/useEnergyStore.ts`
**Status:** Implemented (Phase 2)
**Gap closed:** G-09

### Problem

Fixed 1 000-item ring buffer for all adapter types wastes memory on low-frequency adapters
(KNX emits events, not continuous data) while under-serving high-frequency adapters (OCPP V2X).

### Solution

```typescript
export const RING_BUFFER_SIZES: Record<string, number> = {
  'ocpp-21': 500,
  'victron-mqtt': 200,
  'eebus': 200,
  'modbus-sunspec': 150,
  'knx': 100,
  'homeassistant-mqtt': 200,
  'zigbee2mqtt': 150,
  'shelly-rest': 100,
  'matter-thread': 100,
  'default': 100,
};
```

Memory reduction: **~6.5 MB → ~1.3 MB** (80% reduction for 13-adapter setup)

---

## P3: LTTB Chart Downsampling (chart-sampling.ts)

**File:** `apps/web/src/lib/chart-sampling.ts`
**Status:** ✅ Fully Implemented and Integrated (v1.2.0)
**Gap closed:** G-10

### Problem

Recharts renders all data points. With 1 000+ points (7-day chart at 15-min resolution), each
frame re-renders ~1 000 SVG path segments → >16 ms per frame → dropped frames on mobile.

### Solution: LTTB Algorithm

Largest-Triangle-Three-Buckets (LTTB) — visually lossless downsampling:
- Preserves visual shape of the time series
- O(n) time, constant memory
- Target: ≤300 points for charts (imperceptible quality loss)

The shipped implementation in `chart-sampling.ts` accepts both `ts` and `timestamp` as the
x-axis key (supporting both Dexie aggregate snapshots and live energy snapshots).  The public
API uses the `sampleIfNeeded` convenience wrapper:

```typescript
// Only downsample when data exceeds the threshold — returns input unchanged otherwise.
export function sampleIfNeeded<T extends { ts?: number; timestamp?: number }>(
  data: T[],
  threshold = 500,
  outputSize = 300,
): T[] {
  return data.length > threshold ? lttbSample(data, outputSize) : data;
}
```

### Integration points (v1.2.0)

| Surface | Status | Threshold → Output |
|---------|--------|--------------------|
| `apps/web/src/components/HistoricalChart.tsx` | ✅ Integrated | 500 → 300 |
| `apps/web/src/pages/HistoricalAnalyticsPage.tsx` | ✅ Integrated | 120 → 96 (timeseries), proportional (forecast accuracy) |
| `apps/web/src/pages/Analytics.tsx` (realtime tab) | Not needed — series ≤ 24 pts (hourly) | — |
| `apps/web/src/pages/OptimizationAI.tsx` | Not needed — forecast capped at 24 pts | — |
| `apps/web/src/pages/TariffsPage.tsx` | Not needed — PRICE_TIMELINE = 48 pts | — |
| `apps/web/src/pages/MonitoringPage.tsx` | Not needed — loadHistory = 24 pts | — |
| `apps/web/src/components/PredictiveForecast.tsx` | Not needed — max 168 pts (7d × 24h) | — |

Only pages driven by Dexie historical queries (potentially thousands of rows) require LTTB.
Static demo and bounded-window charts are already fast without it.

---

## P4: D3 Sankey Web Worker (Already Implemented)

**Status:** ✅ Already done — `apps/web/src/workers/sankey-worker.ts`

The Sankey layout computation runs in a Comlink-wrapped Web Worker. Main thread only handles
D3 SVG DOM updates. No further optimization needed unless switching to WebGL renderer.

### Optional Future: WebGL Renderer (Identified, Not Planned)

For 50+ flow connections (industrial HEMS with many devices), d3-force + WebGL via `regl` could
provide smoother animation. Not needed for current typical use case (≤15 flows).

---

## P5: REST Polling Adapter Worker

**File:** `apps/web/src/core/adapter-worker.ts`
**Status:** Implemented
**Gap:** Closed for worker isolation; remaining work is instrumentation and tuning

### Problem

REST-polling adapters (e.g., `ShellyRESTAdapter`, `ModbusSunSpecAdapter`) perform HTTP polling
on the main thread. At 1–2 Hz polling of multiple adapters, this blocks React renders.

### Solution

This worker now exists and isolates polling with SSRF protections, header sanitization, and
timeout handling. The remaining v1.2.0 work is to document the boundary correctly and add
measurement around throughput and render impact rather than re-creating the worker.

Isolated Web Worker per polling adapter:

```typescript
// adapter-worker.ts — runs in Worker thread
export async function pollEndpoint(
  url: string,
  headers: Record<string, string>,
): Promise<unknown> {
  // SSRF protection: URL validated against allowlist
  assertAllowedUrl(url);
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}
```

SSRF allowlist:
```typescript
const ALLOWED_ORIGINS = new Set([
  'http://localhost',
  'http://192.168.',
  'http://10.',
  'http://172.16.',
  // ... local network ranges only
]);
```

---

## Monitoring & Measurement

### Prometheus Metrics

Target metrics for the next completion slice:

```
nexus_hems_store_merge_duration_ms   — desired `useEnergyStore.mergeData()` latency histogram
nexus_hems_ring_buffer_size          — desired current ring buffer size per adapter metric
nexus_hems_dexie_query_duration_ms   — desired Dexie query latency histogram
nexus_hems_chart_render_duration_ms  — desired Recharts render duration via client-side observation
```

### CI Performance Gate

`perf-benchmark.yml` currently measures:
- Bundle size (warn if +5%)
- Build time (warn if >120 s)

Planned follow-up additions:
- Merge latency evidence (target: <50 ms at 1000 updates/min)
- Chart render evidence after LTTB integration
- `.perf/` artifact convention for CI-generated summaries

---

## Not Planned (Out of Scope)

| Feature | Reason deferred |
|---------|----------------|
| WebGL Sankey renderer | Not needed for current flow count (≤15 flows) |
| react-window for chart virtualization | LTTB sampling sufficient; react-window adds complexity |
| Web Workers for Dexie (Comlink) | IndexedDB runs in background thread already |
| Server-side rendering | SPA pattern fits HEMS dashboard; SSR adds complexity without benefit |
| Canvas fallback for all charts | Defer unless profiling still shows regressions after LTTB adoption |
