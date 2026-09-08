# ADR-029: Defer In-Browser Local-LLM Engines (CSP + Bundle Trade-off)

- **Status:** Accepted
- **Date:** 2026-07-09
- **Deciders:** Maintainer
- **Related:** ADR-026 (BYOK vault), AUD-02 (CSP nonce, `apps/api/src/config/csp-nonce.ts`), audit finding **F-03**, `packages/ai-core/src/providers/local/`, `apps/web/src/core/aiClient.ts`

## Context

`@nexus-hems/ai-core` shipped three experimental in-browser inference engines:

- `WebLLMEngine` (`@mlc-ai/web-llm`, WebGPU)
- `TransformersEngine` (`@xenova/transformers`, WASM)
- `OnnxEngine` (`onnxruntime-web`, WASM)

The deep audit (F-03) found three compounding problems:

1. **They cannot run under the production Content-Security-Policy.** AUD-02 removed
   `style-src 'unsafe-inline'` and the CSP grants neither `wasm-unsafe-eval` (required to
   compile the WASM runtimes) nor the Hugging Face / MLC CDN `connect-src` origins (required to
   fetch model weights). Enabling them would mean reopening the hard-won `unsafe-inline`-free,
   nonce-based CSP — a security regression flagged **RED** in the audit.
2. **Silent heuristic substitution.** `isAvailable()` returned `true` on a bare `navigator.gpu`
   / `WebAssembly` probe. The orchestrator would select the engine, `load()` would fail under
   CSP, and the user could receive **heuristic** output labelled as a local LLM.
3. **Dead weight.** The three runtimes are >2.5 MB gzipped and sat in `dependencies`,
   inflating the install/supply-chain surface for a code path that never executed in
   production.

## Decision — Option B: defer, don't wire

1. **Remove** `@mlc-ai/web-llm`, `@xenova/transformers` and `onnxruntime-web` from
   `packages/ai-core` `dependencies`, and drop the `vendor-ai-local` size-limit bucket and the
   Vite `manualChunks` rule that carved them out.
2. **Gate `isAvailable()`** on all three engines behind a build-time opt-in
   (`isLocalLlmEnabled()`, `local-llm-flag.ts`): `VITE_ENABLE_LOCAL_LLM=true` for the web build
   or `ENABLE_LOCAL_LLM=true` for Node. Default is `false`, so the orchestrator's fallback chain
   resolves to the always-available **heuristic** engine and never silently substitutes it for a
   claimed LLM.
3. **Keep the engine code as an opt-in reference.** The dynamic `import()`s use non-literal
   specifiers with `/* @vite-ignore */`, so neither the bundler nor `tsc` requires the packages
   to be installed, and every engine's `load()` short-circuits on `isLocalLlmEnabled()` so a
   disabled deployment never reaches the import. Re-enabling is deliberately a two-step,
   developer-only action: **re-add the optional peer package to `packages/ai-core`
   `dependencies`** (so the bundler resolves the specifier — the default build ships no import
   map, by design) **and** set the flag. Installing the package without re-adding it to
   `dependencies` is not sufficient for a browser build; the packages are declared under
   `peerDependenciesMeta.optional` to document the requirement without shipping them.
4. **Surface the real provider in the UI** (`meta.provider` already carries the truth), so a
   user always sees which engine produced a response.
5. **No CSP change.** The `unsafe-inline`-free, nonce-based CSP stays intact.

## Consequences

- **Positive:** ~2.5 MB and 38 transitive packages removed from the dependency tree; no CSP
  regression; no risk of mislabelled heuristic output; the heuristic default (the shipped,
  offline-safe path) is unchanged.
- **Negative:** True in-browser LLM inference is not available out-of-the-box. Re-enabling it is
  a deliberate, documented opt-in that also requires a CSP decision (a future ADR) before it
  could ship as a default.
- **Reversal path:** A future ADR may add a scoped, nonce-or-hash CSP profile plus a
  self-hosted model-weight origin; until then the engines remain experimental.

## Alternatives considered

- **Option A — widen the CSP to run them by default.** Rejected: reopening `wasm-unsafe-eval` +
  external model CDNs undoes AUD-02 and was rated RED in the audit.
- **Keep as `optionalDependencies`.** Rejected: pnpm still installs optional deps by default, so
  the supply-chain and bundle concerns remain.
