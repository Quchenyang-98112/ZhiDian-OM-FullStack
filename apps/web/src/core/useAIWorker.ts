/**
 * useAIWorker.ts — React hook for off-main-thread AI computations.
 *
 * Spawns a singleton AI Web Worker (via Comlink) and exposes its typed API.
 * The worker runs optimizer recommendations, price history generation,
 * forecast analysis, and predictive AI — all off the main thread.
 *
 * Usage:
 *   const api = useAIWorker();
 *   const recs = await api.computeRecommendations(energyData, settings);
 */

import * as Comlink from 'comlink';
import type { AIWorkerAPI } from '../workers/worker-types';

// Module-level singleton — shared across all component instances.
// Created once on first import; survives React re-renders.
let _proxy: Comlink.Remote<AIWorkerAPI> | null = null;

function getProxy(): Comlink.Remote<AIWorkerAPI> {
  if (!_proxy) {
    const w = new Worker(new URL('../workers/ai-worker.ts', import.meta.url), {
      type: 'module',
    });
    _proxy = Comlink.wrap<AIWorkerAPI>(w);
  }
  return _proxy;
}

/**
 * Returns a Comlink proxy to the AI Worker.
 * The worker is lazily created on first call and reused across components.
 */
export function useAIWorker(): Comlink.Remote<AIWorkerAPI> {
  return getProxy();
}
