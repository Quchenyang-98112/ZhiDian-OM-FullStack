/**
 * useLLMWorker.ts — React hook for off-main-thread local LLM inference.
 *
 * Spawns a singleton LLM Web Worker via Comlink. The worker runs WebLLM,
 * Transformers.js, ONNX Runtime, and heuristic engines without blocking the
 * main thread.
 */

import * as Comlink from 'comlink';
import type { LLMWorkerAPI } from '../workers/worker-types';

let _proxy: Comlink.Remote<LLMWorkerAPI> | null = null;

function getProxy(): Comlink.Remote<LLMWorkerAPI> {
  if (!_proxy) {
    const w = new Worker(new URL('../workers/llm-worker.ts', import.meta.url), {
      type: 'module',
    });
    _proxy = Comlink.wrap<LLMWorkerAPI>(w);
  }
  return _proxy;
}

/**
 * Returns a Comlink proxy to the LLM Worker.
 * The worker is lazily created on first call and reused across components.
 * Pass `enabled=false` to avoid spawning the worker when local inference is not
 * needed (e.g. cloud-only users).
 */
export function useLLMWorker(enabled: boolean): Comlink.Remote<LLMWorkerAPI> | null {
  return enabled ? getProxy() : null;
}
