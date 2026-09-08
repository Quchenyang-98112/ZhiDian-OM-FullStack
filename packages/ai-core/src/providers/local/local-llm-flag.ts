/**
 * Build-time opt-in flag for the experimental local-LLM engines.
 *
 * The WebLLM / Transformers.js / ONNX engines are **deferred** (audit finding
 * F-03, ADR-029). They cannot load under the production Content-Security-Policy
 * — which deliberately omits `wasm-unsafe-eval` and the Hugging Face / MLC CDN
 * `connect-src` origins — and their runtime deps (>2.5 MB) are no longer shipped
 * as dependencies. The default AI path is the local heuristic engine.
 *
 * To experiment with them you must (1) re-add the relevant optional peer package
 * to `packages/ai-core` `dependencies` so the bundler can resolve the dynamic
 * import (installing it alone is not enough — the default web build ships no
 * import map and the `@vite-ignore` specifier is intentionally opaque to Vite),
 * and (2) set `VITE_ENABLE_LOCAL_LLM=true` (web build) or `ENABLE_LOCAL_LLM=true`
 * (Node). Until then every engine's `isAvailable()` returns `false` AND `load()`
 * short-circuits before the import, so a disabled deployment never touches the
 * removed dependency and the orchestrator never substitutes heuristic output for
 * a real LLM.
 */
export function isLocalLlmEnabled(): boolean {
  const meta = import.meta as unknown as { env?: Record<string, string | undefined> };
  const viteFlag = meta.env?.VITE_ENABLE_LOCAL_LLM;
  if (viteFlag != null) {
    return viteFlag === 'true';
  }
  if (typeof process !== 'undefined' && process.env) {
    return process.env.ENABLE_LOCAL_LLM === 'true';
  }
  return false;
}
