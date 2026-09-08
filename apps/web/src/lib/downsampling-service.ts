/**
 * Downsampling Service — Tiered Dexie Aggregate Builder
 *
 * Background service that aggregates raw EnergySnapshot records into time-bucketed
 * aggregates (15-minute and 1-hour resolution). This makes 7-day and 30-day
 * history chart queries ~1000× faster by scanning pre-averaged rows instead of
 * raw individual snapshots.
 *
 * Service lifecycle:
 *   startDownsamplingService() → 90 s delay → first cycle → 5 min interval
 *
 * Bucket algorithm:
 *   - Groups snapshots by floor(timestamp / bucketSizeMs) * bucketSizeMs
 *   - Averages all numeric fields per bucket
 *   - Idempotent: skips buckets already present in energyAggregates
 *   - Only processes completed buckets (cutoff = now - bucketSizeMs)
 *
 * @see docs/adr/ADR-005-dexie-tiered-downsampling.md
 */

import type { AggregateResolution, EnergyAggregate, EnergySnapshot } from './db';
import { nexusDb } from './db';

const BUCKET_15M_MS = 15 * 60 * 1_000;
const BUCKET_1H_MS = 60 * 60 * 1_000;
const CYCLE_INTERVAL_MS = 5 * 60 * 1_000; // 5 minutes
const STARTUP_DELAY_MS = 90_000; // 90 seconds — avoid startup contention

let _handle: ReturnType<typeof setInterval> | null = null;
let _isRunning = false;

// ─── Public API ─────────────────────────────────────────────────────

/**
 * Start the background downsampling service.
 * Safe to call multiple times — subsequent calls are no-ops.
 */
export function startDownsamplingService(): void {
  if (_handle !== null) return; // already started

  const timeout = setTimeout(() => {
    void runDownsamplingCycle();
    _handle = setInterval(() => void runDownsamplingCycle(), CYCLE_INTERVAL_MS);
    // Remove the startup timeout ref since it has fired
  }, STARTUP_DELAY_MS);

  // Store the timeout handle so stopDownsamplingService can cancel it if called early
  _startupTimeout = timeout;

  window.addEventListener('beforeunload', stopDownsamplingService, { once: true });
}

let _startupTimeout: ReturnType<typeof setTimeout> | null = null;

/** Stop the background service and cancel any pending interval/timeout. */
export function stopDownsamplingService(): void {
  if (_startupTimeout !== null) {
    clearTimeout(_startupTimeout);
    _startupTimeout = null;
  }
  if (_handle !== null) {
    clearInterval(_handle);
    _handle = null;
  }
}

/**
 * Run one downsampling cycle (15m + 1h).
 * Exported for testing and for manual trigger from admin UI.
 */
export async function runDownsamplingCycle(): Promise<void> {
  if (_isRunning) return; // Prevent overlapping cycles
  _isRunning = true;
  try {
    await downsampleTo('15m', BUCKET_15M_MS);
    await downsampleTo('1h', BUCKET_1H_MS);
  } finally {
    _isRunning = false;
  }
}

// ─── Core aggregation logic ──────────────────────────────────────────

/**
 * Aggregate raw EnergySnapshot records into coarser-grained buckets.
 *
 * @param resolution  Target resolution label stored in energyAggregates
 * @param bucketMs    Bucket width in milliseconds (e.g. 15 * 60 * 1000)
 */
async function downsampleTo(resolution: AggregateResolution, bucketMs: number): Promise<void> {
  // Only aggregate completed buckets — the current bucket might still receive data
  const cutoff = Math.floor(Date.now() / bucketMs) * bucketMs;

  const raws = await nexusDb.energySnapshots.where('timestamp').below(cutoff).toArray();

  if (raws.length === 0) return;

  // Group snapshots by bucket start timestamp
  const buckets = groupByBucket(raws, bucketMs);

  for (const [bucketTs, snaps] of buckets) {
    // Idempotent: skip if already aggregated for this resolution + bucket
    const existing = await nexusDb.energyAggregates
      .where('[resolution+bucketTs]')
      .equals([resolution, bucketTs])
      .first();

    if (existing !== undefined) continue;

    const aggregate = computeAggregate(resolution, bucketTs, snaps);
    await nexusDb.energyAggregates.add(aggregate);
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────

function groupByBucket(
  snapshots: EnergySnapshot[],
  bucketMs: number,
): Map<number, EnergySnapshot[]> {
  const map = new Map<number, EnergySnapshot[]>();
  for (const snap of snapshots) {
    const bucket = Math.floor(snap.timestamp / bucketMs) * bucketMs;
    let group = map.get(bucket);
    if (group === undefined) {
      group = [];
      map.set(bucket, group);
    }
    group.push(snap);
  }
  return map;
}

function computeAggregate(
  resolution: AggregateResolution,
  bucketTs: number,
  snaps: EnergySnapshot[],
): Omit<EnergyAggregate, 'id'> {
  const n = snaps.length;
  if (n === 0) {
    return {
      resolution,
      bucketTs,
      sampleCount: 0,
      pvPower: 0,
      batteryPower: 0,
      gridPower: 0,
      houseLoad: 0,
      batterySoC: 0,
      heatPumpPower: 0,
      evPower: 0,
      gridVoltage: 0,
      batteryVoltage: 0,
      pvYieldToday: 0,
      priceCurrent: 0,
    };
  }

  let pvPower = 0;
  let batteryPower = 0;
  let gridPower = 0;
  let houseLoad = 0;
  let batterySoC = 0;
  let heatPumpPower = 0;
  let evPower = 0;
  let gridVoltage = 0;
  let batteryVoltage = 0;
  let pvYieldToday = 0;
  let priceCurrent = 0;

  for (const s of snaps) {
    pvPower += s.pvPower ?? 0;
    batteryPower += s.batteryPower ?? 0;
    gridPower += s.gridPower ?? 0;
    houseLoad += s.houseLoad ?? 0;
    batterySoC += s.batterySoC ?? 0;
    heatPumpPower += s.heatPumpPower ?? 0;
    evPower += s.evPower ?? 0;
    gridVoltage += s.gridVoltage ?? 0;
    batteryVoltage += s.batteryVoltage ?? 0;
    pvYieldToday += s.pvYieldToday ?? 0;
    priceCurrent += s.priceCurrent ?? 0;
  }

  return {
    resolution,
    bucketTs,
    sampleCount: n,
    pvPower: pvPower / n,
    batteryPower: batteryPower / n,
    gridPower: gridPower / n,
    houseLoad: houseLoad / n,
    batterySoC: batterySoC / n,
    heatPumpPower: heatPumpPower / n,
    evPower: evPower / n,
    gridVoltage: gridVoltage / n,
    batteryVoltage: batteryVoltage / n,
    pvYieldToday: pvYieldToday / n,
    priceCurrent: priceCurrent / n,
  };
}
