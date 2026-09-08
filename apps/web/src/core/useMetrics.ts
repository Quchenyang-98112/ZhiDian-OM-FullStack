/**
 * useMetrics – React hook for real-time Prometheus metrics
 *
 * Polls /api/metrics/json and exposes typed metric data for UI components.
 * Also provides useAdapterMetrics() for per-adapter performance tracking.
 */

import { useEffect, useRef, useState } from 'react';
import type { MetricFamily } from '../lib/metrics';
import { metricsCollector } from '../lib/metrics';
import { type AdapterPerfMetrics, BaseAdapter } from './adapters/BaseAdapter';
import type { AdapterId } from './useEnergyStore';
import { useEnergyStoreBase } from './useEnergyStore';

export interface MetricSnapshot {
  families: MetricFamily[];
  health: {
    uptime: number;
    connections: number;
  };
  lastUpdated: number;
  error: string | null;
}

export function useMetrics(intervalMs: number = 5000): MetricSnapshot {
  const [snapshot, setSnapshot] = useState<MetricSnapshot>({
    families: [],
    health: { uptime: 0, connections: 0 },
    lastUpdated: 0,
    error: null,
  });
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchMetrics = async () => {
    try {
      const res = await fetch('/api/metrics/json');
      if (!res.ok) {
        setSnapshot((prev) => ({ ...prev, error: `HTTP ${res.status}` }));
        return;
      }
      const data = await res.json();
      setSnapshot({
        families: data.families ?? [],
        health: data.health ?? { uptime: 0, connections: 0 },
        lastUpdated: Date.now(),
        error: null,
      });
    } catch {
      // Fallback to client-side collector
      const families = metricsCollector.toJSON();
      const health = metricsCollector.getHealthStatus();
      setSnapshot({
        families,
        health: { uptime: health.uptime, connections: 0 },
        lastUpdated: Date.now(),
        error: null,
      });
    }
  };

  useEffect(() => {
    fetchMetrics(); // eslint-disable-line react-hooks/set-state-in-effect
    intervalRef.current = setInterval(fetchMetrics, intervalMs);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [intervalMs]);

  return snapshot;
}

/**
 * Extract a specific metric value from a snapshot
 */
export function getMetricFromSnapshot(
  families: MetricFamily[],
  name: string,
  labels?: Record<string, string>,
): number | null {
  const family = families.find((f) => f.definition.name === name);
  if (!family) return null;

  if (!labels) return family.samples[family.samples.length - 1]?.value ?? null;

  const match = family.samples.find((s) =>
    Object.entries(labels).every(([k, v]) => s.labels[k] === v),
  );
  return match?.value ?? null;
}

// ─── Per-Adapter Metrics ─────────────────────────────────────────────

export interface AdapterMetricsSnapshot {
  /** Per-adapter perf metrics (latency, error rate, freshness, etc.) */
  adapters: Record<AdapterId, AdapterPerfMetrics>;
  /** Overall system data freshness (oldest adapter) */
  worstFreshnessMs: number;
  /** Overall average latency across all connected adapters */
  systemAvgLatencyMs: number;
  /** Total errors across all adapters */
  systemTotalErrors: number;
  /** Whether any adapter has data older than threshold */
  hasStaleData: boolean;
}

const STALE_THRESHOLD_MS = 30_000; // 30s without data = stale

/**
 * useAdapterMetrics — Per-adapter performance monitoring
 *
 * Samples latency, error rate, data freshness from BaseAdapter.perfMetrics
 * at the given interval. Lightweight: reads from adapter instances directly.
 */
export function useAdapterMetrics(intervalMs: number = 2000): AdapterMetricsSnapshot {
  const [snapshot, setSnapshot] = useState<AdapterMetricsSnapshot>({
    adapters: {} as Record<AdapterId, AdapterPerfMetrics>,
    worstFreshnessMs: 0,
    systemAvgLatencyMs: 0,
    systemTotalErrors: 0,
    hasStaleData: false,
  });

  useEffect(() => {
    const collect = () => {
      const entries = useEnergyStoreBase.getState().adapters;
      const adapterMetrics: Record<string, AdapterPerfMetrics> = {};
      let totalLatency = 0;
      let latencyCount = 0;
      let worstFreshness = 0;
      let totalErrors = 0;

      for (const [id, entry] of Object.entries(entries)) {
        if (!entry.enabled) continue;

        const adapter = entry.adapter;
        if (adapter instanceof BaseAdapter) {
          const perf = adapter.perfMetrics;
          adapterMetrics[id] = perf;

          if (perf.avgLatencyMs > 0) {
            totalLatency += perf.avgLatencyMs;
            latencyCount++;
          }
          if (perf.dataFreshnessMs > worstFreshness && perf.lastDataAt > 0) {
            worstFreshness = perf.dataFreshnessMs;
          }
          totalErrors += perf.totalErrors;

          // Push per-adapter metrics to Prometheus
          metricsCollector.recordAdapterStatus(
            id,
            adapter.name,
            entry.status === 'connected',
            perf.avgLatencyMs,
          );
        }
      }

      setSnapshot({
        adapters: adapterMetrics as Record<AdapterId, AdapterPerfMetrics>,
        worstFreshnessMs: worstFreshness,
        systemAvgLatencyMs: latencyCount > 0 ? totalLatency / latencyCount : 0,
        systemTotalErrors: totalErrors,
        hasStaleData: worstFreshness > STALE_THRESHOLD_MS,
      });
    };

    collect();
    const timer = setInterval(collect, intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);

  return snapshot;
}
