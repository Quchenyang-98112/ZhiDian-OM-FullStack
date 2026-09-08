# Technical Debt Registry — Nexus-HEMS-Dash

**Last audited:** 2026-09-02 (Stream F protocol depth closeout)  
**Version at audit:** 1.11.1 tagged; `main` @ `c4e7939` unreleased  
**Last updated:** 2026-09-02  
**Release line:** v1.11.1 tagged (`1716a42`); `main` ahead with offline-sync Stream C (#354), protocol depth Stream F (#355–#356), demo i18n (#353), CI SLSA/Scorecard (#350–#351), release-workflow fix (#347), and review policy (#348) — **release intentionally deferred** until maintainer cuts next patch  
**Auditor:** Cursor Cloud Agent (2026-06-29 full audit; 2026-07-02 delta; 2026-07-03 full review; 2026-09-01 freeze + campaign closeout)

This file is the canonical issue tracker for known technical debt, security gaps, incomplete implementations, and quality issues. It is **not** a substitute for GitHub Issues — use it for context, rationale, and multi-sprint planning.

## Truth-Sync Note (2026-09-02)

Aligned to `main` @ `c4e7939` (Stream F protocol depth closeout). Supersedes the 2026-09-02 note below (`1993cb2`). Confirmed in code:

- **LOW-11** — ESS clamp from `settings.systemConfig.battery` (#316) ✅
- **F-01–F-07** — deep-audit remediation shipped in v1.11.0 (#313) ✅
- **SEC-12 / ADR-026** — non-extractable `vault-key-v2` CryptoKey (`secure-store.ts`) ✅; XSS-on-origin residual remains accepted
- **SEC-11** — fail-closed `NODE_ENV` handling (`runtime-env.ts`, `isDevRuntime()`) ✅ (#333)
- **PRF-01** — DeepSource advisory; JavaScript analyzer removed (#299/#301)
- **OPS-FREEZE-01** — Sep 2026 campaign complete (#329–#337); stale Dependabot pins #323–#327 closed (superseded by #329)
- **Offline sync slices 2–4 + Stream C** — version endpoint, conflict UI, `/api/sync/diff`, Redis persistence, `/api/commands/replay` (#344, #346, #349, #354) ✅
- **Stream F protocol depth** — SG Ready closed loop, OpenADR DR→hardware, Matter/Zigbee/HA backend commands (#355–#356) ✅
- **Review quiescence policy** — canonical in `docs/runbooks/pr-review-correction-loop.md` §1.1 (#348) ✅

Campaign PRs (Sep 2026, all merged): #336 (deps/CVE), #329 (CI pins), #332 (demo chrome), #334 (docs), #335 (E-STOP test), #333 (SEC-11), #337 (campaign closeout). Duplicate empty squash commit on `main` removed during housekeeping.

## Truth-Sync Note (2026-09-02, superseded)

Aligned to `main` @ `1993cb2` (post-v1.11.1 HEAD truth-sync). Superseded by the note above (`c4e7939`). Confirmed in code:

- **LOW-11** — ESS clamp from `settings.systemConfig.battery` (#316) ✅
- **F-01–F-07** — deep-audit remediation shipped in v1.11.0 (#313) ✅
- **SEC-12 / ADR-026** — non-extractable `vault-key-v2` CryptoKey (`secure-store.ts`) ✅; XSS-on-origin residual remains accepted
- **SEC-11** — fail-closed `NODE_ENV` handling (`runtime-env.ts`, `isDevRuntime()`) ✅ (#333)
- **PRF-01** — DeepSource advisory; JavaScript analyzer removed (#299/#301)
- **OPS-FREEZE-01** — Sep 2026 campaign complete (#329–#337); stale Dependabot pins #323–#327 closed (superseded by #329)
- **Offline sync slices 2–4** — version endpoint, conflict UI, `/api/sync/diff` + server-wins reconciliation (#344, #346, #349) ✅
- **Review quiescence policy** — canonical in `docs/runbooks/pr-review-correction-loop.md` §1.1 (#348) ✅

Campaign PRs (Sep 2026, all merged): #336 (deps/CVE), #329 (CI pins), #332 (demo chrome), #334 (docs), #335 (E-STOP test), #333 (SEC-11), #337 (campaign closeout). Duplicate empty squash commit on `main` removed during housekeeping.

## Truth-Sync Note (2026-04-26, superseded header)

The registry is aligned to the verified repository state. Items marked `✅` are implemented in the
codebase already. Items marked `⏳` remain genuine follow-up work. Where documentation previously
mixed roadmap intent with shipped status, this file now treats `1.1.0` as the shipped baseline and
`v1.2.0` as in-flight scope only.

---

## Legend

| Tag    | Meaning                                                |
| ------ | ------------------------------------------------------ |
| `CRIT` | Blocks shipping or causes data loss / security breach  |
| `HIGH` | Significant bug or risk; fix before next minor release |
| `MED`  | Quality / incomplete feature; fix within 2 sprints     |
| `LOW`  | Nice-to-have; backlog                                  |
| ✅     | Fixed                                                  |
| 🔄     | In progress                                            |
| ⏳     | Scheduled                                              |
| ❌     | Won't fix (with reason)                                |

---

## Active Remediation — 2026-04-26 CI Recovery

These items are part of the active all-green remediation pass. Here, **"all green" means every currently triggered `push` check passes**, not only the aggregate status jobs.

### CI-R1 — Aggregate CI Status Jobs Were Too Weak

**Files:** `.github/workflows/ci.yml`, `.github/workflows/perf-optimized-ci.yml`
**Status:** ✅ Fixed in v1.2.0

Both `ci-passed` aggregate jobs now fail with `exit 1` when any prerequisite job result is not `success`. Additionally, the `size-limit check` step in `perf-optimized-ci.yml` had its `|| true` fallback removed — `pnpm size` now fails the build job directly on budget overrun, consistent with `ci.yml`.

### CI-R2 — Browser-Test Build Artifacts Were Not Built with Consistent E2E Env

**Files:** `.github/workflows/ci.yml`, `.github/workflows/perf-optimized-ci.yml`, `turbo.json`
**Status:** ✅ Fixed in v1.2.0

Both `ci.yml` and `perf-optimized-ci.yml` build with `VITE_E2E_TESTING=true`. `turbo.json` `web#build` lists `VITE_E2E_TESTING` in `env` so the Turbo cache keys differ between E2E-enabled and standard builds. E2E jobs consume the `build-${{ github.sha }}` artifact produced by the `VITE_E2E_TESTING=true` build.

### CI-R3 — Lighthouse Preview Server Parity Drift on Node 24

**Files:** `apps/web/lighthouserc.json`, `apps/web/playwright.config.ts`
**Status:** ✅ Fixed in v1.2.0

`lighthouserc.json` `startServerCommand` uses `--host 0.0.0.0 --port 9876 --strictPort`, matching the `--host 0.0.0.0` flag already present in `playwright.config.ts`. Both preview servers now bind to all interfaces, resolving the Node 24 / Ubuntu IPv6-only localhost binding issue.

### CI-R4 — Central Documentation Drifted from Verified Repo Truth

**Files:** `README.md`, `CLAUDE.md`, `.github/copilot-instructions.md`, `docs/Toolchain-Architecture.md`, `docs/Testing-Coverage-Strategy.md`
**Status:** ✅ Core docs synchronized on 2026-04-26

Central docs and agent-instruction files diverged from code on shipped-vs-in-flight version language, controller count, coverage thresholds, and CI semantics.

**Fix applied:** Synchronized the canonical docs and agent instructions to the verified repository state, including current controller inventory, active coverage thresholds, root script semantics, and current CI behavior.

---

## PR Feedback & Static Analysis Rollout

Items introduced by the 2026-06-28 PR-feedback improvement initiative.

### PRF-01 — DeepSource Integrated (Advisory Mode)

**Files:** `.deepsource.toml`, `docs/runbooks/deepsource-integration.md`
**Status:** ✅ Advisory-only (JavaScript analyzer removed 2026-07-07, #299/#301)

DeepSource is connected for secrets + Docker analysis. The JavaScript analyzer was **removed** after JS-0067 noise made it non-actionable. DeepSource is **not** a merge gate; blocking quality remains Layer 1 (`ci.yml`, `security-full.yml`). Tuning of remaining analyzers is ongoing.

### PRF-02 — CodeAnt.ai AI Reviewer Integrated (Advisory Mode)

**Files:** `.codeant/configuration.json`, `.codeant/instructions.json`, `docs/runbooks/codeant-ai-integration.md`
**Status:** 🔄 In progress (repo config ✅; GitHub App install pending)

CodeAnt.ai is configured via repo files (`.codeant/` — analyzer de-duplication + domain/safety instructions, ADR-027). As of 2026-09-01 the **`CodeAnt AI` status check does not appear** on open PRs (#344–#346) while CodeRabbit and Codecov do — the owner must install the CodeAnt GitHub App and grant repo access (runbook §Installation). It remains advisory to avoid replacing human judgment on control logic.

### PRF-03 — Coverage Diff Not Yet Enforced

**Files:** `.github/workflows/ci.yml`, `scripts/check-coverage-baseline.mjs`, `apps/web/coverage-baseline.json`
**Status:** ✅ Fixed in v1.3.0

`pnpm check:coverage-baseline` runs after web `test:coverage` in CI and fails when statements/branches/functions/lines drop below the committed baseline. Vitest emits `coverage-summary.json` via the `json-summary` reporter.

### PRF-04 — Unified PR Feedback Comment Missing

**Files:** `.github/workflows/pr-feedback-summary.yml`
**Status:** ✅ Fixed in v1.3.0 prep (#91)

Workflow posts/updates a single PR comment with links to Lighthouse, coverage, bundle analysis, and static-analysis dashboards. DeepSource/Codecov links are now wired; the malformed "Coverage artifact" table row was fixed (ADR-027).

### PRF-05 — Branch Protection Settings Not Codified
**Files:** `.github/CI-AUDIT.md`, `docs/runbooks/pr-status-checks.md`
**Status:** ✅ Fixed in v1.3.0

Required checks documented in `pr-status-checks.md` including `ci-passed` rollup (covers fuzz-tests). Branch protection must still be applied manually in GitHub Settings → Branches → main.

### PRF-06 — Layered Quality Platforms & CI Consolidation

**Files:** `.codecov.yml`, `.coderabbit.yaml`, `.codeant/`, `.deepsource.toml`, `.github/workflows/ci.yml`, `.github/workflows/security-full.yml`, `.github/dependabot.yml`, `DEVOPS.md`, `docs/adr/ADR-027-layered-quality-platforms.md`
**Status:** 🔄 In progress (CodeAnt App install + `GH_TOKEN` rotation pending)

Codecov wired and **active** (`codecov/patch` on PRs, uploads via `ci.yml`); CodeRabbit **active** (`.coderabbit.yaml` + `coderabbit-rereview.yml`); CodeAnt repo config committed but **App not yet reporting**; Dependabot/Renovate reconciled; CodeQL/Semgrep/Scorecard consolidated. Blocking gates remain Layer 1 only (`CI Passed`, `E2E Tests`, `lighthouse`). **Owner actions:** install CodeAnt GitHub App; rotate `GH_TOKEN` if `release.yml` push fails (2026-09-01 dispatch failed checkout when expired PAT was passed to checkout — fixed by using `GITHUB_TOKEN` for fetch). See `DEVOPS.md`.

---

## Safety

### SAF-01 — Implicit Live Hardware Connection on Dev/CI Startup

**Files:** `apps/api/src/config/adapter-mode.ts`, `apps/web/src/lib/adapter-mode.ts`, `apps/web/src/core/useEnergyStore.ts`, `docker-compose.yml`, `helm/nexus-hems/values.yaml`
**Status:** ✅ Fixed in v1.3.0 (#128)

`ADAPTER_MODE` / `VITE_ADAPTER_MODE` default to `mock`. Live hardware requires explicit double opt-in (`ALLOW_LIVE_HARDWARE=true` backend, `VITE_ALLOW_LIVE_HARDWARE=true` frontend build) plus per-adapter enablement in Settings. All built-in frontend adapters start disabled.

### SAF-05 — Read-Only Deployment Mode Missing

**Files:** `apps/api/src/config/read-only-mode.ts`, `apps/api/src/ws/energy.ws.ts`, `apps/web/src/lib/adapter-mode.ts`, `apps/web/src/core/command-safety.ts`
**Status:** ✅ Fixed in v1.3.0

`READ_ONLY_MODE=true` blocks all hardware control commands at both API (WebSocket) and frontend (command validation) levels. Essential for certification-grade deployments and incident investigation.

---

## Supply Chain

### SUPPLY-01 — Grype CVE Scan and Cosign Signing Not Wired in CI

**Files:** `.github/workflows/sbom-scan.yml`, `.github/workflows/container-publish.yml`, `docs/Master-Improvement-Roadmap.md`
**Status:** ✅ Fixed in v1.3.0 prep

`sbom-scan.yml` generates syft SPDX SBOMs, runs `pnpm audit --audit-level=high`, and scans images/source via `anchore/scan-action@v7` (critical cutoff, blocking, `.grype.yaml` targeted ignores). `container-publish.yml` builds both GHCR images, Grype-gates before push, cosign keyless-signs, and attaches SLSA provenance.

---

### SUPPLY-02 — Grype CVE exception registry (targeted ignores)

**Files:** `.grype.yaml`, `docs/Supply-Chain-Grype-Policy.md`, `scripts/verify-grype-policy.sh`
**Status:** ⚠️ Active exception — quarterly review

| CVE | Package | Scope | Next review |
|-----|---------|-------|-------------|
| CVE-2026-5450 | libc6 (deb) | distroless backend base | 2026-09-29 |

**Policy:** No global `only-fixed: true`. New unfixable critical CVEs fail CI until explicitly documented in `.grype.yaml` + this registry. Compensating controls: PSS restricted, readOnlyRootFilesystem, cap_drop ALL, seccomp RuntimeDefault.

**Future:** Evaluate Chainguard/Wolfi zero-CVE base (SUPPLY-03) when distroless libc remains unpatched across two review cycles.

---

## CRITICAL

### CRIT-01 — EEBUS SHIP Handshake Not Implemented

**File:** `apps/api/src/routes/eebus.routes.ts:61`
**Status:** ✅ Fixed in v1.2.0 (see `docs/EEBUS-SHIP-Handshake-Implementation.md`)

Full SHIP v1.0.1 handshake implemented:

- `apps/api/src/services/ShipHandshakeService.ts` — SHIP FSM (10 states), TLS 1.3, ECDSA P-256 auto-gen cert, SKI extraction
- `apps/api/src/services/EEBusTrustStore.ts` — atomic JSON file trust store, survives restarts
- `apps/api/src/routes/eebus.routes.ts` — full REST API (discover/pair/pin/status/trust), SSRF guard
- `packages/shared-types/src/protocol.ts` — 5 new Zod schemas (EEBUSDeviceInfo, pair/pin/status/trust)
- `apps/web/src/lib/db.ts` — v13 migration, `eebusDevices` IndexedDB table
- `apps/web/src/components/CertificateManagement.tsx` — SHIP Trust Store UI with PIN dialog
- `docs/EEBUS-SHIP-Handshake-Implementation.md` — complete technical spec
- VDE-AR-E 2829-6 compliance: SKI fingerprint auth, PIN exchange, TLS 1.3 mTLS

---

### CRIT-02 — Tauri Updater Signing Key (Removed)

**Status:** 🗑️ Removed 2026-05-08 — auto-updater dropped from project

The Tauri auto-updater plugin and Minisign signing infrastructure have been removed entirely (`tauri-plugin-updater`, `plugins.updater`, `bundle.createUpdaterArtifacts`, `TAURI_SIGNING_*` CI env vars, `.secrets/` directory, `docs/Tauri-Desktop-Updater-Setup.md`, `TauriAutoUpdater.tsx`). Desktop users update by downloading a new release from GitHub.

**Why removed:** Maintenance burden of key management (generation, rotation, GitHub secret setup) was disproportionate for a single-maintainer homelab project. Auto-updates can be re-introduced later by following the official Tauri v2 docs.

---

### CRIT-03 — JWT Weak-Entropy Secrets Warn But Don't Block in Production

**File:** `apps/api/src/jwt-utils.ts` (`checkSecretEntropy`, `resolveSigningMaterial`)
**Status:** ✅ Fixed in v1.9.x remediation pass

**Correction:** the prior "✅ Fixed in v1.1.1" claim was **stale/inaccurate**. A 2026-07-03 verification found `checkSecretEntropy()` only emitted `console.warn`/`console.error` for weak patterns, low entropy, and short length — and was invoked *only* inside production branches, so a weak or low-entropy `JWT_SECRET` (e.g. `changeme-changeme-changeme-…`, ≥32 chars) still **booted the server** in production.

**Fix applied (this pass):** `checkSecretEntropy(secret, source, isProd)` now aborts boot in production by throwing on (a) a known-weak dictionary pattern, or (b) estimated entropy `< 128` bits. A secret shorter than the recommended 64 chars remains a **non-fatal warning**. In dev/test every condition is warn-only (never throws), and the check now runs in all environments so dev surfaces warnings without blocking. Thrown/logged messages never include the secret, its length, or the derived entropy value (CodeQL `js/clear-text-logging` preserved). Covered by `apps/api/src/tests/jwt-secret-enforcement.test.ts`.

---

## HIGH

### HIGH-01 — Hardcoded Localhost Fallbacks in Adapters

**File:** Multiple — `apps/web/src/core/adapters/EEBUSAdapter.ts`, `ModbusSunSpecAdapter.ts`, `KNXAdapter.ts`
**Status:** ✅ Fixed in v1.2.0

Added constructor guard in all three adapters: throws `Error` if `config.host` is absent/empty and `config.mock !== true`. Fast-fail with clear message instead of silent fallback to localhost.

---

### HIGH-02 — Modbus SunSpec Unsupported Register Types Crash at Runtime

**File:** `apps/api/src/protocols/modbus/ModbusAdapter.ts`
**Status:** ✅ Fixed in v1.2.0

`validateRegisterConfig()` called in the `ModbusAdapter` constructor filters registers to the five supported data types (`INT16`, `UINT16`, `INT32`, `UINT32`, `FLOAT32`). Unsupported types (e.g. `UINT64`, `STRING` from JSON device-map) log a structured warning and are skipped instead of crashing the polling loop at runtime.

---

### HIGH-03 — InfluxDB Flux Query Built via String Concatenation

**File:** `apps/web/src/lib/influxdb-client.ts`, `apps/api/src/routes/history.routes.ts`
**Status:** ✅ Fixed in v1.2.0

Both Flux query paths now enforce strict allowlists before any interpolation:

- `influxdb-client.ts`: `validateFluxField`, `validateFluxMetric`, `validateFluxRange`, `validateFluxAggregateWindow` functions with Set-based and regex allowlists.
- `history.routes.ts`: Zod schema tightened — `metric` requires `^[a-zA-Z][a-zA-Z0-9_]{0,63}$`, `deviceId` requires `^[a-zA-Z0-9_:.-]{1,128}$`, `granularity` uses `z.enum` (closed set).

---

### HIGH-04 — CORS Localhost Exclusion Relies Solely on NODE_ENV

**File:** `apps/api/src/middleware/security.ts:16-31`
**Status:** ✅ Fixed in v1.2.0

Added post-construction filter in `configureCors()`: when `isProduction`, iterate `allowedOriginSet` and delete any origin containing `localhost`, `127.`, `[::1]`, or `0.0.0.0`, with `console.warn` for each removal. Defence-in-depth against `CORS_ORIGINS` misconfiguration.

---

### HIGH-05 — AI Key Storage: No Guard Against IndexedDB Unavailability

**File:** `apps/web/src/lib/ai-keys.ts`
**Status:** ✅ Fixed in v1.2.0

Added `isKeyStorageAvailable(): Promise<boolean>` helper that probes Dexie with `.count()`. `saveAIKey()` now calls it first and throws a user-visible error if storage is unavailable (private browsing, quota exceeded, etc.).

---

### HIGH-06 — WebSocket Broadcast Lacks Per-Connection Rate Limiting

**File:** `apps/api/src/ws/energy.ws.ts`, `apps/api/src/ws/ws-conn-limit.ts`
**Status:** ✅ Fixed in v1.2.0; per-IP cap extended to relay proxies in v1.9.x

WS command rate limit is configurable via `WS_RATE_LIMIT` env var (default 30 cmd/min). When the limit is exceeded, the connection is closed with code `4429 Rate limit exceeded` in addition to the error frame.

**v1.9.x extension:** the per-IP connection cap (`WS_MAX_CONNECTIONS_PER_IP`, default 10) was previously enforced only on the energy stream — the OCPP (`/ws/ocpp`) and EEBUS (`/ws/eebus`) mTLS relay proxies bypassed it. The accounting now lives in the shared `ws-conn-limit.ts` module and is applied to both proxy handlers (slot released on connection close). Relays forward opaque frames, so a per-connection cap is the correct primitive there rather than the per-message limiter. Covered by `ws-conn-limit.test.ts`.

---

### HIGH-07 — JWT Key Rotation Requires Server Restart

**File:** [`apps/api/src/jwt-utils.ts`](apps/api/src/jwt-utils.ts), [`apps/api/src/routes/auth.routes.ts`](apps/api/src/routes/auth.routes.ts)
**Status:** ✅ Fixed in v1.3.0

Dual-key mode loads `JWT_SECRET` + optional `JWT_SECRET_NEW` (and optional `JWT_SECRET_NEW_FILE`) without restart via `reloadJwtKeysFromEnv()`; `POST /api/auth/rotate-key` (admin JWT) triggers reload; verification tries signing key then legacy secret.

**Fix:** Shipped — see [`SECURITY.md`](SECURITY.md) env table.

### HIGH-09 — Security/Performance Roadmaps Need Truth-Sync Boundaries

**Files:** `docs/Security-Roadmap-2026.md`, `docs/Performance-Optimization-Plan.md`, `CHANGELOG.md`, `README.md`
**Status:** ✅ Fixed in v1.2.0

Roadmap and release-facing docs reclassified. JTI revocation, audit automation, Renovate, AI-side PII masking, CSP partial state, EEBUS certificate UX, and LTTB integration status all now reflect verified shipped state vs. active v1.2 targets.

---

### HIGH-08 — Docker Secret Path Hardcoded

**File:** `apps/api/src/jwt-utils.ts:35`
**Status:** ✅ Fixed in v1.2.0

Changed to `process.env.JWT_SECRET_FILE ?? '/run/secrets/jwt_secret'`.

---

## MEDIUM

### MED-01 — Test Coverage Floors Enforced (Roadmap Stretch Remaining)

**File:** `apps/web/vitest.config.ts:22-27`, `apps/web/coverage-baseline.json`, `apps/api/vitest.config.ts:18-23`, `packages/ai-core/vitest.config.ts`
**Status:** ✅ Enforced floors met — roadmap stretch targets remain in `docs/Testing-Coverage-Strategy.md`

Current enforced thresholds (verified 2026-09-01):

- Web `apps/web/vitest.config.ts`: statements **78%**, branches **72%**, functions **70%**, lines **80%**
- API `apps/api/vitest.config.ts`: statements **55%**, branches **46%**, functions **62%**, lines **55%** — measured ~**66/59/71/68** after slice 4
- ai-core `packages/ai-core/vitest.config.ts`: statements **73%**, branches **51%**, functions **77%**, lines **73%** (F-05a; `pnpm check:coverage-baseline`)

**Follow-up:** raise toward roadmap targets via tested helper extraction (`docs/Test-Coverage-TODO.md`); do not lower floors to greenwash CI.

---

### MED-02 — Structured Logging Missing in API Routes

**File:** `apps/api/src/routes/*.ts`, `apps/api/src/index.ts`
**Status:** ✅ Fixed in v1.2.0

Created `apps/api/src/core/logger.ts` — a zero-dependency NDJSON structured logger that outputs `{ time, level, msg, ...ctx }` lines to stdout (compatible with Loki, Datadog, etc.). Express namespace augmented in `apps/api/src/types/express.d.ts` to add `req.requestId`. `configureRequestTracking()` now attaches the UUID to `req.requestId` so route handlers can include it in log context. All `console.error`/`console.warn` calls in `eebus.routes.ts`, `openadr.routes.ts`, `history.routes.ts`, and `index.ts` replaced with `logger.error`/`logger.warn` carrying `{ requestId, error }` context.

---

### MED-03 — nginx WS_ORIGINS Env Var Not Validated at Startup

**File:** `apps/web/nginx.conf`, `Dockerfile`, `apps/web/docker-entrypoint.sh`
**Status:** ✅ Fixed in v1.2.0

Added `apps/web/docker-entrypoint.sh` — a POSIX shell script that validates every space-separated token in `WS_ORIGINS` against a strict character allowlist (`ws://`/`wss://` scheme + alphanumeric/dot/hyphen/underscore/colon/brackets only) and exits 1 with a clear error message on violation. The Dockerfile uses this as the `ENTRYPOINT`; it delegates to the nginx-unprivileged base image's `/docker-entrypoint.sh` (which runs `envsubst`) before starting nginx.

### MED-11 — LTTB Sampling Exists But Is Not Fully Wired Into Chart Surfaces

**Files:** `apps/web/src/lib/chart-sampling.ts`, `apps/web/src/components/HistoricalChart.tsx`, `apps/web/src/pages/HistoricalAnalyticsPage.tsx`
**Status:** ✅ Fixed in v1.2.0

`sampleIfNeeded(filteredData, 500, 300)` wired into `HistoricalChart.tsx` (the shared historical rendering path) and `HistoricalAnalyticsPage.tsx` (time series + forecast accuracy charts). All other chart pages (Analytics, TariffsPage, OptimizationAI, MonitoringPage, PredictiveForecast) use static bounded series ≤ 168 points and are well below the sampling threshold — no additional wiring needed there.

---

### MED-04 — React Compiler ESLint Plugin Still RC

**File:** `package.json`
**Status:** ⏳ Monitor — upgrade when stable

`eslint-plugin-react-compiler: ^19.1.0-rc.2` is a release candidate. Pin to stable when available.

---

### MED-05 — Contrib Adapter Glob Discovery Fails Silently on Empty Directory

**File:** `apps/web/src/core/adapters/adapter-registry.ts:175`
**Status:** ✅ Fixed in v1.2.0

`if (!loader)` block now enumerates available adapter IDs from `Object.keys(contribModules)` and includes them in the error message for easy diagnosis.

---

### MED-06 — AI Response Output Not Schema-Validated

**File:** `apps/web/src/core/aiClient.ts:82-98`
**Status:** ✅ Fixed in v1.2.0

Added `OptimizationSuggestionSchema`, `OptimizationResponseSchema`, and `ForecastResponseSchema` Zod schemas. New `parseAIStructuredOutput<T>(text, schema)` helper extracts JSON from markdown code fences and validates via `safeParse`, returning `null` on failure (graceful degradation).

---

### MED-07 — Tauri Mobile Build Config Incomplete

**File:** `apps/web/src-tauri/tauri.conf.json:54-59`
**Status:** ❌ Won't fix in v1.2 — mobile support is planned for v1.3

iOS and Android sections are defined but empty. No CI mobile build jobs.

**Fix (v1.3):** Add complete iOS/Android config, provisioning profiles, and a Tauri mobile CI job.

---

### MED-08 — i18n Sync Not Automatically Validated

**File:** `apps/web/src/locales/en.ts` vs `apps/web/src/locales/de.ts`
**Status:** ✅ Fixed in v1.2.0

Created `apps/web/src/tests/i18n-sync.test.ts` — recursive key walker comparing EN↔DE for bidirectional parity. Runs as part of `pnpm test:run`.

---

### MED-09 — Circuit Breaker Has No Jitter on Cooldown

**File:** `apps/web/src/core/circuit-breaker.ts:25`
**Status:** ✅ Fixed in v1.2.0

Added `openCount` field; each OPEN transition increments it. `currentState` getter computes `effectiveCooldown = min(cooldown × 2^(openCount-1), 300_000) × jitter(0.8–1.2)`. `reset()` also clears `openCount`.

---

### MED-10 — req.ip Rate Limiting on `trust proxy: 1` (Single Level Only)

**File:** [`apps/api/src/config/trust-proxy.ts`](apps/api/src/config/trust-proxy.ts), [`apps/api/src/index.ts`](apps/api/src/index.ts), [`docs/Deployment-Guide.md`](docs/Deployment-Guide.md) §2.1
**Status:** ✅ Fixed in v1.3.0

`TRUST_PROXY` configures Express `trust proxy` (default `1`). Multi-hop deployments set hop count or subnet list (e.g. `loopback,10.0.0.0/8`) so `req.ip` reflects the real client for rate limiting.

**Fix:** Documented in Deployment Guide; env-driven via `resolveTrustProxy()`.

---

## Audit Remediation — 2026-07-02 (PR #227)

### AUD-01 — Static Shell CSP Shipped Localhost WebSocket Origins to Production

**File:** [`apps/web/index.html`](apps/web/index.html), [`apps/web/vite.config.ts`](apps/web/vite.config.ts), [`apps/web/vite.csp.ts`](apps/web/vite.csp.ts)
**Status:** ✅ Fixed in PR #227

The static meta CSP (effective policy for GitHub Pages, no Express in front) shipped `ws(s)://localhost:*` / `ws(s)://127.0.0.1:*` in `connect-src`. `cspNoncePlugin` now strips them from production builds via `stripLocalhostWsOrigins`; dev/E2E keep them for the Vite proxy. Unit test + `smoke-prod-build.mjs` `dist/index.html` assertion guard it.

### AUD-02 — CSP `style-src 'unsafe-inline'` Reduction Plan

**File:** [`apps/web/index.html`](apps/web/index.html), [`apps/api/src/middleware/security.ts`](apps/api/src/middleware/security.ts), [`apps/web/nginx.conf`](apps/web/nginx.conf), [`apps/web/src-tauri/tauri.conf.json`](apps/web/src-tauri/tauri.conf.json)
**Status:** ✅ Phase 2 shipped — Tauri production CSP nonce sync + `style-src-attr`; dev HMR exception retained
**Severity:** MED

**Nonce-clean (no `style-src 'unsafe-inline'` in production):**

| Surface | `style-src` today | Notes |
|---|---|---|
| GitHub Pages / Vite `index.html` meta CSP | `'self' 'nonce-__CSP_NONCE__'` | Build-time nonce via `cspNoncePlugin`; `smoke-prod-build.mjs` asserts no `unsafe-inline` |
| API Helmet prod (`security.ts`) | `'self' 'nonce-{build}'` when `buildNonce` extracted from `index.html`; `'self'` only when nonce missing | AUD-02 phase 1 — fail-closed (no `unsafe-inline` fallback); `helmet-csp.test.ts` guards both paths |
| Docker/nginx (`nginx.conf`) | `'self' 'nonce-${CSP_NONCE}'` | `docker-entrypoint.sh` extracts nonce from baked `index.html`; removed Google Fonts origins (self-hosted) |
| Tauri desktop prod (`tauri.conf.json`) | `'self' 'nonce-{build}'` + `style-src-attr 'unsafe-inline'` | AUD-02 phase 2 — `sync-tauri-csp.ts` patches CSP after Vite build; Radix/motion positioning attrs only |

**Still requires `unsafe-inline` (or equivalent work):**

| # | Surface | Consumer | Removal path |
|---|---|---|---|
| 1 | API Helmet dev (`security.ts:100`) | Vite HMR style injection | Keep dev-only `unsafe-inline`; documented dev exception |
| 2 | Tauri dev (`tauri.conf.json`) | Vite HMR during `tauri dev` | Keep dev-only `style-src 'unsafe-inline'`; production patched at build |
| 3 | Tauri/Radix/motion prod | Inline `style=""` attrs (positioning, dynamic colors) | `style-src-attr 'unsafe-inline'`; migrate app-owned inline styles to CSS where practical |

**Acceptance (phase 2):** Tauri production build drops `style-src 'unsafe-inline'`, uses build nonce, documents `style-src-attr` for Radix; dev exception retained. **Optional follow-up:** reduce `style-src-attr` surface by migrating app inline styles.

### AUD-03 — Adapter Safety Matrix Gaps (missing per-adapter tests)

**File:** [`docs/Adapter-Safety-Matrix.md`](docs/Adapter-Safety-Matrix.md)
**Status:** ✅ Resolved (2026-07-02)
**Severity:** LOW–MED

G-1…G-4 closed with `openems-adapter.test.ts`, `exec-adapter.test.ts`, extended `homeassistant-mqtt-adapter.test.ts` (ha-ws-api), and `example-contrib-adapter.test.ts`. Matrix cells re-marked 🟢 with linked tests.

---

## LOW

### LOW-01 — SSRF Allowlist Missing mDNS `.local` Hostnames

**File:** `apps/web/src/core/adapter-worker.ts:168`
**Status:** ✅ Fixed in v1.2.0

Added `/\.local$/` to `ALLOWED_HOSTNAME_PATTERNS`. Security note in comment: mDNS is unauthenticated, so `.local` hostnames should only be used on trusted LAN.

---

### LOW-02 — OpenEMS Writable Property Allowlist Hardcoded

**File:** `apps/web/src/core/adapters/OpenEMSAdapter.ts`, `EnergyAdapter.ts`
**Status:** ✅ Fixed in v1.9.0 prep

`AdapterConnectionConfig.additionalWritableProperties` merges user-supplied property names per component ID into the built-in allowlist (or enables writes on custom components with no built-in rule).

---

### LOW-03 — Bundle Size CI Check Is Non-Blocking

**File:** `.github/workflows/ci.yml`
**Status:** ✅ Fixed in v1.2.0

Removed `|| echo "::warning::..."` fallback from the Size Limit Check step. `pnpm size` now exits non-zero when any bundle exceeds its limit, failing the CI job immediately.

---

### LOW-04 — API Scope Map Not Validated at Startup

**File:** `apps/api/src/middleware/auth.ts:26`
**Status:** ✅ Fixed in v1.2.0

Added post-construction validation loop that calls `console.warn` for each `API_KEY_SCOPES` entry dropped due to missing colon separator or invalid scope value.

---

### LOW-05 — Offline Cache Has No Quota Warning

**File:** `apps/web/src/lib/offline-cache.ts`, `apps/web/src/App.tsx`
**Status:** ✅ Fixed in v1.3.0

`monitorOfflineStorageQuota()` checks `navigator.storage.estimate()` on app init and every 60 s (skipped during E2E). When `usage/quota > 0.8`, oldest IndexedDB cache rows are evicted (LRU) and a Sonner toast warns the user (`offline.storageQuotaWarning` i18n keys).

---

### LOW-06 — Commitlint Has Unused Scopes

**File:** `commitlint.config.js`, `CONTRIBUTING.md`
**Status:** ✅ Fixed in v1.9.0 prep

Scope guide table added to `CONTRIBUTING.md` mapping each allowed scope to its domain. Unknown scopes remain advisory (`scope-enum` level 1).

---

### LOW-07 — No Font Preload Directives in index.html

**File:** `apps/web/index.html`
**Status:** ✅ Already done (pre-existing in v1.1.0)

All 4 font preloads with SRI hashes are already present in `apps/web/index.html`. No action needed.

---

### LOW-08 — Storybook References Placeholder Components

**File:** `.storybook/main.ts`
**Status:** ✅ Resolved — core high-complexity stories added (SankeyDiagram, Floorplan, AdapterConfigPanel)

Storybook config references component paths that may not have stories written yet.

**Fix:** Add stories for `SankeyDiagram`, `FloorplanEditor`, `AdapterConfigPanel` — the three highest-complexity components with no visual regression tests. **Done 2026-07-03:** `SankeyDiagram.stories.tsx`, `Floorplan.stories.tsx`, `AdapterConfigPanel.stories.tsx`.

---

---

## June 2026 Deep Audit — New & Reclassified Items

> Source: `docs/Audit-Report-2026-06-29.md` · Execution plan: `docs/Perfection-Roadmap.md`

### CRITICAL (new)

### CRIT-04 — Backend ADAPTER_MODE Defaults to `live` (Contradicts Safety Docs)
**File:** `apps/api/src/config/adapter-mode.ts`, `apps/api/src/protocols/index.ts`
**Status:** ✅ Fixed in v1.3.0 (#128)

`ADAPTER_MODE` defaults to `mock`. Live hardware requires `ADAPTER_MODE=live` **and** `ALLOW_LIVE_HARDWARE=true`. `getEffectiveAdapterMode()` drives health checks and adapter startup consistently.

---

### CRIT-05 — Auth Token Read Path Without Write Path (HIGH-05 Incomplete)
**Files:** `apps/web/src/lib/auth-token.ts`, `background-sync.ts`, `sharing.ts`, `CertificateManagement.tsx`
**Status:** ✅ Fixed in v1.3.0 prep

`auth-token.ts` provides `get/set/clear`, `exchangeApiKeyForJwt()`, and `getApiBaseUrl()` (with same-origin fallback). Settings Security tab exposes token exchange via `ApiAuthSettingsSection`. `background-sync.ts`, `sharing.ts`, and `CertificateManagement.tsx` use the read path.

---

### HIGH (new / reclassified)

### HIGH-10 — EEBUS Certificate UI Calls Unauthenticated
**File:** `apps/web/src/components/CertificateManagement.tsx`
**Status:** ✅ Fixed in v1.3.0 prep (#129)

`/api/eebus/trust`, `/api/eebus/trust/:ski`, and `/api/eebus/pair/pin` fetches now attach `Authorization` via `getAuthHeader()` from `auth-token.ts`.

---

### HIGH-11 — WebSocket Scope Authorization Incomplete for Write Commands
**File:** `apps/api/src/ws/ws-scope.ts`, `apps/api/src/ws/energy.ws.ts`
**Status:** ✅ Fixed in v1.3.0 prep

`SCOPE_COMMAND_MAP` covers every `WSCommandTypeSchema` variant; `read` scope cannot execute hardware commands. Vitest matrix in `ws-scope.test.ts`.

---

### HIGH-12 — OCPP Security Profile 3 Not Operational
**File:** `apps/web/src/core/adapters/OCPP21Adapter.ts`, `ocpp-security.ts`, `apps/api/src/ws/ocpp-proxy.ws.ts`
**Status:** ✅ Fixed in v1.10.0 prep

`securityProfile` drives `_connect()`: secure-store credential merge, Basic Auth URL for profiles 1/2, mTLS PEM validation for profile 3. Browser SP3 uses API proxy — `POST /api/ocpp/proxy-session` + `/ws/ocpp` mTLS relay (server holds client cert; mirrors EEBUS `/ws/eebus` pattern). Tauri/desktop may still connect directly.

---

### HIGH-13 — EvccAdapter Has Zero Test Coverage
**File:** `apps/web/src/core/adapters/EvccAdapter.ts`
**Status:** ✅ Fixed in v1.3.0 prep

`apps/web/src/tests/evcc-adapter.test.ts` — interface contract, connect/state mapping, sendCommand REST paths. `_connect()` now sets `connected` status after successful health check.

---

### HIGH-14 — Command Audit Trail (`logCommandAudit`) Untested
**File:** `apps/web/src/core/command-safety.ts:164–191`
**Status:** ✅ Fixed in v1.3.0 prep

`command-safety.test.ts` covers audit writes and 5000-entry cleanup trim.

---

### HIGH-15 — Grype Container Scan Documented But Not in CI
**Files:** `.github/workflows/sbom-scan.yml`, `.github/workflows/container-publish.yml`, `CHANGELOG.md`, `docs/Master-Improvement-Roadmap.md`
**Status:** ✅ Fixed in v1.3.0 prep

`anchore/scan-action@v7` scans frontend/backend images and source SBOM with `fail-build: true` and `severity-cutoff: critical` (no `continue-on-error`). `container-publish.yml` repeats the gate before GHCR push.

---

### HIGH-16 — Cosign Image Signing Documented But Not Implemented
**Files:** `SECURITY.md`, `.github/workflows/container-publish.yml`, `CHANGELOG.md`
**Status:** ✅ Fixed in v1.3.0 prep

`container-publish.yml` keyless-signs `ghcr.io/qnbs/nexus-hems-dash` and `ghcr.io/qnbs/nexus-hems-server` after Grype pass; SLSA provenance attestation pushed to registry.

---

### SEC-08 — Default API Key Max Scope `readwrite` When Scopes Unset
**Files:** `apps/api/src/config/auth-config.ts`, `apps/api/src/middleware/auth.ts`, `apps/api/src/index.ts`
**Status:** ✅ Fixed in v1.3.0

`validateProductionAuthConfig()` throws at startup when `NODE_ENV=production` and `API_KEY_SCOPES` is missing or does not cover every `API_KEYS` entry. Dev mode retains the `readwrite` fallback in `getApiKeyMaxScope()`.

---

### MEDIUM (new)

### MED-12 — Adapter Worker Hook Exists But Has No Consumers
**File:** `apps/web/src/core/useAdapterWorker.ts`, `apps/web/src/core/sunspec-transforms.ts`
**Status:** ✅ Activated — opt-in via `VITE_ADAPTER_WORKER=true` + live hardware ack; SunSpec REST polling off main thread

Modbus/Shelly still poll on the main thread except **Modbus SunSpec** when the worker
flag is enabled. The worker (`adapter-worker.ts`, SSRF hostname allowlist + SunSpec
inverter/battery/meter transforms) and the `useAdapterWorker` hook route poll results
through the **same** `useEnergyStore.mergeData(adapterId, …)` pipeline the in-thread
adapters use.

**Parity (2026-07-03):** scalar SunSpec parsing extracted to shared
`sunspec-transforms.ts` — consumed by both `ModbusSunSpecAdapter` and
`adapter-worker`. Golden fixtures in `sunspec-transform-parity.test.ts` lock the
contract. `mergeSunSpecRegistersToUnified()` shared for worker + adapter poll output.

**Activation (2026-07-03):** `useAdapterBridge()` calls
`useAdapterWorker().startSunSpecPolling()` for enabled `ModbusSunSpecAdapter` entries
when `isAdapterWorkerEnabled()` (`VITE_ADAPTER_WORKER=true` + live hardware build).
Adapter `connect()` / main-thread `pollTimer` skipped via `setDelegatePollingToWorker(true)`.
Commands still route through the adapter on the main thread.

---

### MED-13 — Unthrottled Bridge Side Effects in useAdapterBridge
**File:** `apps/web/src/core/useEnergyStore.ts`
**Status:** ✅ Fixed in v1.3.0 prep

`bridgeToAppStore`, React Query writes, and `persistSnapshot` now run inside `flushBridgeSideEffects()`, invoked once per 250 ms `flushMerge` window alongside the unified model update.

---

### MED-14 — API Test Coverage Not Enforced in CI
**Files:** `.github/workflows/ci.yml`, `apps/api/vitest.config.ts`, `apps/api/package.json`
**Status:** ✅ Fixed in v1.3.0 prep

CI runs `pnpm --filter @nexus-hems/api test:coverage`; the gate has since been raised from the v1.3.0 ~34%-lines baseline to the current **55/46/62/55** (statements/branches/functions/lines) enforced in `apps/api/vitest.config.ts`, with higher targets staged in `docs/Testing-Coverage-Strategy.md`.

---

### MED-15 — In-Memory WS Tickets and Share Store (HA Risk)
**Files:** `apps/api/src/services/ws-ticket-store.ts`, `apps/api/src/services/share-ticket-store.ts`, `apps/api/src/services/redis-client.ts`
**Status:** ✅ Fixed in v1.3.0

When `REDIS_URL` is set, WS tickets and dashboard shares use Redis with TTL (`nexus:ws:ticket:*`, `nexus:share:*`). Single-use ticket consumption uses atomic `GETDEL`. Graceful in-memory fallback when Redis is unavailable.

---

### MED-16 — Settings.tsx Monolith (was ~3,663 Lines)
**File:** `apps/web/src/pages/Settings.tsx`
**Status:** ✅ Resolved — decomposed into `components/settings/*`

Maintainability hotspot. Split into tab submodules per Perfection Roadmap 2.3.

**Outcome (v1.3.x campaign):** **3,663 → 512 LOC (−86%)**. `Settings()` is now just
the tab-nav shell + page header + JSON export/import + a lazy AI route; its
`noExcessiveCognitiveComplexity` suppression was removed (no longer needed). All ten
tabs live under `apps/web/src/components/settings/`: `AppearanceTab`, `SystemTab`,
`EnergyTab`, `ControllersTab`, `SecurityTab`, `StorageTab`, `NotificationsTab`,
`AdvancedTab` (each a self-contained module) plus the shared atoms (`ToggleSwitch`,
`ThemePreviewCard`, `SettingsFeatureBar`), `PWASettingsSection` and shared class
strings (`styles.ts`); `adapters`/`ai` stay one-line delegations to the existing
`AdapterConfigPanel` / `AISettingsPage`. Pattern: each tab reads
`settings`/`updateSettings` (and, for `AppearanceTab`, the theme state; `AdvancedTab`,
`adapterMode`) from the global Zustand store via `useAppStoreShallow` and owns its
local UI state — no prop-drilling or shared form hook. Unit coverage:
`apps/web/src/tests/settings-tabs.test.tsx` (21 tests).

---

### MED-17 — Performance Plan LTTB Scope Table Drift
**File:** `docs/Performance-Optimization-Plan.md` (line 20 vs 156)
**Status:** ✅ Fixed (2026-06-30)

Scope table said "not fully integrated"; P3 section said "Fully Implemented". Code confirms LTTB is wired (`sampleIfNeeded` used in `HistoricalChart.tsx` + `HistoricalAnalyticsPage.tsx`).

**Fix:** Scope table updated to "Implemented & integrated". Also corrected `docs/Testing-Coverage-Strategy.md`, which mis-stated the enforced API coverage thresholds as 55/45/55/55 — at that time (2026-06-30) the actual `apps/api/vitest.config.ts` gate was 33/30/38/33. It has since been raised to **55/46/62/55** (see MED-01).

---

### ARCH-03 — `sendAdapterCommand` Broadcasts to All Adapters
**File:** `apps/web/src/core/useEnergyStore.ts`, `EnergyAdapter.ts`
**Status:** ✅ Fixed in v1.3.0

`AdapterCommand.targetAdapterId` routes hardware commands to a single adapter; omitting it preserves broadcast behavior for legacy callers.

---

### LOW (new)

### LOW-09 — Fuzz Workflow Not in ci-passed Aggregate
**File:** `.github/workflows/fuzz.yml`, `.github/workflows/ci.yml`
**Status:** ✅ Fixed in v1.3.0

`ci.yml` now runs `pnpm test:fuzz` in a dedicated `fuzz-tests` job included in the `ci-passed` aggregate gate. `fuzz.yml` remains for weekly `schedule` and `workflow_dispatch` supplementary runs (avoids duplicate fuzz on every PR).

---

### LOW-10 — A11y E2E Uses 240s waitForSelector
**File:** `apps/web/tests/e2e/accessibility.spec.ts`
**Status:** ✅ Fixed in v1.3.0

`gotoAndWait` uses 15 s navigation / 30 s heading / 15 s theme gates; per-route axe scans use `test.setTimeout(60_000)`. `prefers-reduced-motion: reduce` + animation-settle via `getAnimations().finished` removed the need for 240 s masks.

---

### LOW-11 — ESS Controller Uses Hardcoded Battery Power Limits
**File:** `apps/web/src/core/energy-controllers.ts` (`ESSSymmetricController`, `essLimitW`)
**Status:** ✅ Resolved (2026-07-10)

`ESSSymmetricController` now sources its clamp from the configured battery via
`settings.systemConfig.battery.maxChargeRateKW` / `.maxDischargeRateKW` (kW→W) instead of a
hardcoded ±10 kW. The `essLimitW()` helper **fails safe**: a missing / non-positive /
non-finite rate falls back to the ±10 kW default, and every value is hard-capped at 25 kW
(mirroring the `command-safety.ts` `batteryPowerWatts` bound), so the advisory clamp only ever
narrows per device and never widens past the hardware ceiling. `command-safety.ts` and the
READ_ONLY / rate-limit guards are untouched. Covered by 4 new cases in
`energy-controllers.test.ts` (device-limited, fail-safe fallback, asymmetric, hard-cap).

---

## July 2026 Audit Delta — New Items (2026-07-02)

New items from the 2026-07-02 audit delta (`docs/Audit-Report-2026-07-02.md`). These correct a
proposed "full-scale transformation" brief against verified code (`main` @ e60e7f7): the real
keystone gap was that backend adapter data never reached the UI (HIGH-17, **now resolved** in PR #197), and the "Victron bias"
premise is false — the platform is already vendor-neutral; the genuine gap was UX (MED-19, **resolved** in PR #204; registry now **190 devices**, P2 #212).
Direction recorded in ADR-018 (backend-mediated adapters) and ADR-019 (registry surfacing).

### HIGH-17 — Backend Adapter Data Not Bridged to WebSocket Gateway
**Files:** `apps/api/src/ws/energy.ws.ts`, `apps/api/src/core/EventBus.ts`, `apps/api/src/services/LiveEnergyAggregator.ts`, `apps/api/src/config/adapter-mode.ts`
**Status:** ✅ Resolved — PR #197 (v1.4.0); `LiveEnergyAggregator` bridges EventBus → WebSocket (ADR-018)

**Was:** `energy.ws.ts` never subscribed to EventBus — it broadcast mock data in both mock and live mode.

**Now:** `LiveEnergyAggregator` folds role-tagged datapoints into the `EnergyData` snapshot. In live mode with fresh data the gateway broadcasts real adapter data; otherwise mock fallback is byte-for-byte unchanged.

**Follow-up (2026-07-03, ADR-025):** a verification audit found the frontend consumer `useServerWebSocket` was never mounted (the broadcast had no shipped consumer) and the `ENERGY_UPDATE` wire was unvalidated. Resolved: consumer mounted behind `VITE_BACKEND_WS` (opt-in; static demo unchanged) with a flat→nested `EnergyData → UnifiedEnergyModel` projection, a liveness watchdog, and **Zod validation both ends** (`WSMessageSchema` on receive, `EnergyDataSchema` on send with mock fallback).

---

### MED-18 — No Per-Adapter Prometheus Metrics
**Files:** `apps/api/src/middleware/adapter-metrics.ts`, `apps/api/src/middleware/metrics.ts`, `apps/api/src/protocols/*`, `apps/api/src/routes/metrics.routes.ts`
**Status:** ✅ Resolved — PR #203 (v1.3.x); `adapter-metrics.ts` publishes per-instance gauges/counters to `/metrics` and `/api/metrics/json` (ADR-018)

Backend adapter instances now emit `hems_adapter_connected`, `hems_adapter_latency_seconds`,
`hems_adapter_data_freshness_seconds`, `hems_adapter_data_updates_total`, `hems_adapter_errors_total`,
`hems_adapter_reconnects_total`, and `hems_adapter_dlq_total` with `{ adapter, protocol }` labels.
Wired from `protocols/index.ts` lifecycle, Modbus/MQTT poll hooks, and a 15 s health refresh.
Monitoring page adapter cards consume these via the existing JSON metrics poll.

---

### MED-19 — No Add-Adapter-Instance UI; Hardware Registry Not Surfaced
**Files:** `apps/web/src/core/hardware-registry.ts`, `apps/web/src/pages/HardwareRegistryPage.tsx`, `apps/web/src/components/hardware/AddAdapterWizard.tsx`
**Status:** ✅ Resolved — PR #204; `HardwareRegistryPage` + `AddAdapterWizard` at `/settings/hardware` (ADR-019)

`hardware-registry.ts` holds **190 devices** across ~50 manufacturers with tested query helpers (expanded in P2 #212 from 113).
**`/settings/hardware`** surfaces a searchable, filterable catalog (category, manufacturer,
protocol). **Add-adapter wizard** (`AddAdapterWizard.tsx`): protocol pick or registry pre-fill →
connection params → mock/live connection test → enable adapter + redirect to Settings adapters tab.
Protocol→adapter mapping in `hardware-adapter-map.ts`.

---

### MED-20 — Backend Protocol Parity Gap
**Files:** `apps/api/src/protocols/` (`modbus/`, `mqtt/`, `knx/`, `evcc/`, `openems/`), `FEATURE_STATUS.md`
**Status:** ✅ Resolved (2026-07-02) — OpenEMS backend + OCPP CSMS gateway shipped

**Shipped backend adapters:** Modbus, MQTT, Knx, Evcc, EebusProtocol, HeatPump, OpenEMS, OCPP CSMS (+ ExecService for scripts).

**Remaining:** optional `style-src-attr` tightening (AUD-02 follow-up), multi-user RBAC (ADR-009).

---

## July 2026 Audit Delta II — New Items (2026-07-03)

Surfaced by a code-first verification pass over `main`. The safety command-path and
backend fail-open/SSRF findings were fixed in their own PRs; the items below are
**deferred by design** and tracked here.

### SEC-11 — `NODE_ENV`-unset global auth fail-open
**Files:** `apps/api/src/config/runtime-env.ts`, `apps/api/src/middleware/auth.ts`, `apps/api/src/middleware/security.ts`
**Status:** ✅ Resolved (2026-09-01)

Unset `NODE_ENV` now defaults to **production-hardened** via `isDevRuntime()` (only explicit
`development` or `test` enables auth bypass). `warnIfNodeEnvUnset()` logs at API boot. Covered by
`runtime-env.test.ts` and `auth-config.test.ts`.

### OPS-FREEZE-01 — Post-v1.11.0 operational rot
**Files:** `.github/workflows/*`, Dependabot PRs #323–#327
**Status:** ✅ Resolved (2026-09-01)

Sep 2026 campaign merged supply-chain (#336), CI Action pins (#329), demo chrome honesty (#332), docs truth-sync (#334), E-STOP regression test (#335), and SEC-11 fail-closed auth (#333). Stale Dependabot Action pin PRs #323–#327 were closed (superseded by #329). `main` history deduplicated after an empty squash-merge artifact.

### SEC-12 — BYOK vault passphrase stored at-rest in IndexedDB
**Files:** `apps/web/src/lib/secure-store.ts` (`vault-key-v2`), `apps/web/src/lib/crypto.ts`, `apps/web/src/lib/ai-keys.ts`
**Status:** ✅ Resolved (ADR-026) — non-extractable `CryptoKey` shipped

**Was:** AES-GCM vault passphrase written plaintext to IndexedDB (`vault-passphrase-v1`).

**Now:** A single non-extractable AES-GCM 256-bit master `CryptoKey` is persisted under `vault-key-v2` (`secure-store.ts`). Legacy `vault-passphrase-v1` entries are ignored.

**Residual (accepted):** on-origin XSS can still invoke crypto operations in the browser session — CSP + dependency hygiene remain the real control; do not treat AES-GCM as a substitute for XSS defense.

### DOC-03 — READ_ONLY_MODE requires two flags (deployment footgun)
**Files:** `apps/api/src/config/read-only-mode.ts`, `apps/web/src/lib/adapter-mode.ts`, `docs/Safety-Certification-Notice.md`, `docs/Deployment-Guide.md`
**Status:** ✅ Documented (2026-07-03)

Backend `READ_ONLY_MODE=true` blocks commands at the API/WebSocket layer but does **not** stop
browser-side adapter commands. Certification-grade read-only requires **both** `READ_ONLY_MODE=true`
(backend) **and** build-time `VITE_READ_ONLY_MODE=true` (frontend). Now called out in the Safety notice
and Deployment guide so operators don't assume a single flag is sufficient.

---

## Fixed Items

| ID         | Description                                                                              | Fixed In |
| ---------- | ---------------------------------------------------------------------------------------- | -------- |
| ✅ CRIT-03 | JWT weak-pattern **and** low-entropy secrets throw & abort boot in production            | v1.9.x   |
| ✅ CI-01   | Docker Build jobs removed from CI pipelines                                              | v1.1.1   |
| ✅ CI-02   | Unconfigured scanners (Snyk, Socket, Aikido) removed                                     | v1.1.1   |
| ✅ TEST-01 | normalize-unified.test.ts timeout fixed with beforeAll                                   | v1.1.1   |
| ✅ TEST-02 | supertest installed, API test files added                                                | v1.1.0   |
| ✅ MED-03  | nginx CSP `apk` fix (exit-99 in BuildKit)                                                | v1.1.1   |
| ✅ MED-10  | LTTB sampling wired into HistoricalChart + HistoricalAnalyticsPage                       | v1.2.0   |
| ✅ HIGH-09 | Security/Performance roadmap truth-sync completed                                        | v1.2.0   |
| ✅ SEC-01  | CSP harmonized: worker-src, AI providers, img-src, Express nonce bridge                  | v1.2.0   |
| ✅ SEC-02  | PII sanitization extracted to shared-types; wired at WS egress, store ingress, AI client | v1.2.0   |
| ✅ CI-R1   | Aggregate CI status jobs + size-limit check now fail on any non-success prerequisite     | v1.2.0   |
| ✅ CI-R2   | E2E build artifacts consistently built with VITE_E2E_TESTING=true; turbo.json keyed      | v1.2.0   |
| ✅ CI-R3   | Lighthouse preview server uses --host 0.0.0.0 matching Playwright; IPv6 binding fixed    | v1.2.0   |
| ✅ SAFETY  | Safety-Certification-Notice.md created; mock-vs-live hazards, checklist, updater guide   | v1.2.0   |
| ✅ AUDIT-2026-06 | Full-scale deep audit report + Perfection Roadmap published                          | v1.3.0-prep |
| ✅ SAF-01  | Adapter mode mock default; double opt-in for live hardware (backend + frontend)            | v1.3.0   |
| ✅ PRF-04  | Unified PR feedback summary workflow (`pr-feedback-summary.yml`)                           | v1.3.0   |
| ✅ HIGH-11   | WS `SCOPE_COMMAND_MAP` covers all command types; read scope blocked from writes          | v1.3.0   |
| ✅ HIGH-13   | EvccAdapter unit tests + connected status on successful connect                            | v1.3.0   |
| ✅ HIGH-14   | `logCommandAudit` 5000-entry cleanup covered in command-safety tests                       | v1.3.0   |
| ✅ LOW-11    | ESS controller clamp from `settings.systemConfig.battery` with fail-safe + 25 kW hard cap  | v1.11.0  |
| ✅ SEC-12    | BYOK vault non-extractable `CryptoKey` (`vault-key-v2`, ADR-026)                           | v1.10.0+ |
| ✅ F-01–F-07 | Deep-audit remediation (sanitizer, lint gate, local-LLM deferral, adapter count, ai-core coverage, vitest catalog, Exec threat model) | v1.11.0  |

---

## Dependency Override Rationale

The **authoritative, always-current** set of overrides lives in root `package.json`
under `pnpm.overrides` — that file is the single source of truth. This table
explains *why* each pin exists, grouped by purpose. After adding or changing an
override, run `pnpm audit` and update this table. Do not hand-copy CVE numbers
here (they drift and get mis-attributed); describe the fix class and check the
advisory database for the specific IDs.

### Security hardening — force patched transitive versions

| Override | Purpose |
| -------- | ------- |
| `serialize-javascript >=7.0.5` | Hardened serializer release (XSS in serialized output) |
| `@xmldom/xmldom >=0.9.0` | XML mis-parsing / prototype-pollution fixes |
| `basic-ftp >=5.3.1` | SSRF / connection-handling fixes |
| `cross-spawn >=7.0.6` | ReDoS fix in argument parsing |
| `protobufjs ^7.5.5` | Prototype-pollution fix |
| `undici ^7.28.0` | HTTP client security + correctness fixes |
| `ws @^7 → >=7.5.11` | DoS fix (header / per-message-deflate handling) |
| `dompurify >=3.4.12` | mXSS sanitizer-bypass fix |
| `ip-address >=10.3.1` | SSRF / IP parsing hardening (transitive audit HIGH) |
| `qs >=6.15.2` | Prototype-pollution / resource-exhaustion fix |
| `uuid >=11.1.1` | Consolidate on the hardened ESM-native line |
| `form-data >=4.0.6` | Safe multipart boundary generation |
| `tar >=7.5.16` | Path-traversal / symlink fixes |
| `js-yaml >=4.2.0` | Safer default load behaviour |
| `esbuild >=0.28.1` | Dev-server request-forwarding (SSRF) fix |
| `brace-expansion @^1→1.1.14, @^2→2.1.0, @^5→5.0.7` | ReDoS fix across every range in the tree |
| `picomatch @^2→2.3.2, @^4→4.0.4` | ReDoS fix across both major ranges |
| `yaml @^1→1.10.3, @^2→2.8.3` | Parser hardening across both major ranges |
| `tmp >=0.2.6` (via `@lhci/cli`, `external-editor`) | Arbitrary-write / symlink fix |

### Build determinism & de-duplication (not CVE-driven)

| Override | Purpose |
| -------- | ------- |
| `@rollup/plugin-terser >=0.4.5` | Align the terser plugin across the Rollup/Rolldown tree |
| `flatted 3.4.2` | Force a single resolved version (de-dupe) |
| `handlebars 4.7.9` | Force a single resolved version (de-dupe) |
| `lodash 4.18.1`, `lodash-es 4.18.1` | Pin transitive lodash / lodash-es to one resolution |

> Nested `parent>child` overrides (`npm>brace-expansion`, `npm>picomatch`,
> `@lhci/cli>tmp`, `external-editor>tmp`) scope a pin to a specific dependency
> path; see `package.json` for the exact form.

---

## Release Roadmap

| Version | Scope | Status |
| ------- | ----- | ------ |
| **v1.3.0–v1.7.0** | Perfection Roadmap Phase 0–1 — safety defaults, auth, supply chain, backend bridge, coverage | ✅ Shipped |
| **v1.8.0–v1.9.0** | ADR-025 backend WS consumer, read-only banner, release curation (#236) | ✅ Shipped |
| **v1.10.0+** | Phase 3 — RBAC (ADR-009), API coverage ratchet (MED-01); AUD-02 CSP reduction now shipped (see §AUD-02), only the by-design dev-HMR `style-src-attr` exception remains | ⏳ Planned |

---

_This file is updated after each sprint and before each minor/major release._
