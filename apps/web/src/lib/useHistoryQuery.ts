/**
 * useHistoryQuery — TanStack Query wrapper around getAggregatedSnapshots.
 *
 * Automatically selects the right bucket size based on the requested
 * time span so callers do not need to hard-code resolutions:
 *
 *   span ≤ 24 h  →  5-minute buckets  (raw-quality, ~288 points/day)
 *   span ≤ 7 d   → 15-minute buckets  (~672 points/week)
 *   span  > 7 d  →  1-hour buckets    (~720 points/month)
 *
 * Usage:
 *   const { data, isLoading, resolutionMs } = useHistoryQuery({
 *     startTime: subDays(Date.now(), 7).getTime(),
 *     endTime:   Date.now(),
 *   });
 */

import { useQuery } from '@tanstack/react-query';
import type { HistoryEntry } from './db';
import { getAggregatedSnapshots } from './db';

// ─── Resolution thresholds ───────────────────────────────────────────

const MS_24H = 24 * 60 * 60 * 1000;
const MS_7D = 7 * 24 * 60 * 60 * 1000;

export const RESOLUTION_5M_MS = 5 * 60 * 1000;
export const RESOLUTION_15M_MS = 15 * 60 * 1000;
export const RESOLUTION_1H_MS = 60 * 60 * 1000;

/**
 * Pick the appropriate bucket size for a given time span.
 * Exported so callers can display the active resolution in the UI.
 */
export function resolveResolutionMs(spanMs: number): number {
  if (spanMs <= MS_24H) return RESOLUTION_5M_MS;
  if (spanMs <= MS_7D) return RESOLUTION_15M_MS;
  return RESOLUTION_1H_MS;
}

// ─── Hook types ──────────────────────────────────────────────────────

export interface UseHistoryQueryOptions {
  startTime: number;
  endTime: number;
  /** Override the auto-detected bucket size (milliseconds). */
  resolutionMs?: number | undefined;
  /** Set to false to skip the query while times are not yet ready. */
  enabled?: boolean | undefined;
}

export interface UseHistoryQueryResult {
  data: HistoryEntry[];
  isLoading: boolean;
  isError: boolean;
  /** The bucket size actually used for this query (milliseconds). */
  resolutionMs: number;
}

// ─── Hook ────────────────────────────────────────────────────────────

export function useHistoryQuery({
  startTime,
  endTime,
  resolutionMs: overrideMs,
  enabled = true,
}: UseHistoryQueryOptions): UseHistoryQueryResult {
  const spanMs = endTime - startTime;
  const resolutionMs = overrideMs ?? resolveResolutionMs(spanMs);

  const query = useQuery({
    queryKey: ['history-query', startTime, endTime, resolutionMs],
    queryFn: () => getAggregatedSnapshots(startTime, endTime, resolutionMs),
    enabled: enabled && startTime < endTime,
    // Cached for 1 minute — historical data doesn't change frequently.
    staleTime: 60_000,
    // Keep previous data visible while re-fetching a new range.
    placeholderData: (prev) => prev,
  });

  return {
    data: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    resolutionMs,
  };
}
