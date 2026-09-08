> **Supersession (2026-07-02):** Bundle gate is now **1120 kB** gzip (P1 i18n); HIGH-17/MED-18/MED-19 resolved; registry **190 devices**. Historical baseline for v1.2.0→1.3.0 transition.

# Nexus-HEMS-Dash — Full-Scale Deep Audit Report

**Version:** 2026-06-29 (Maximal Optimized v2.0)  
**Repository baseline:** `main` @ `f919f08` (2026-06)  
**Shipped release line:** 1.2.0  
**Active work line:** 1.3.0 (Unreleased in `CHANGELOG.md`)  
**Auditor:** Cursor Cloud Agent (automated deep-scan + evidence verification)  
**Standards referenced:** OWASP Top 10 2021, CWE, NIST SP 800-53 (selected controls), WCAG 2.2 AA, React 19 Compiler guidance, Turborepo CI patterns, VDE-AR-E 2829-6 / ISO 15118-20 (domain context)

> **Post-audit amendments (2026-06-29, after `main` @ `b91a5f7`):**
> - **SAF-01 / CRIT-04 resolved** — #128 shipped `adapter-mode.ts` mock default + `ALLOW_LIVE_HARDWARE` double opt-in.
> - **HIGH-10 resolved** — #129 wires `getAuthHeader()` into EEBUS Certificate UI fetches.
> - **CRIT-05 partially resolved** — `auth-token.ts` exists; Settings UI for token exchange still open.
> - **DOC-01 / SEC-06 / SUPPLY-01** — docs truth-sync in #129; Grype/cosign CI step still backlog.
> - **Semgrep** — `ShipHandshakeService.ts` path guard refactored (0 findings locally).
> - **SEC-08 resolved** — production startup requires explicit `API_KEY_SCOPES` for every `API_KEYS` entry (`auth-config.ts`).
> - **Perfection Roadmap 0.1** — live mode + non-empty `device-map.json` emits startup safety warning.
> - **Roadmap 0.2 / LOW-09** — auth integration tests for `background-sync` + `sharing`; fuzz gate wired into `ci-passed`.
> - **MED-15 / LOW-10** — Redis-backed WS ticket + share stores when `REDIS_URL` set; A11y E2E timeouts reduced to 60 s per test.

---

## Executive Summary

Nexus-HEMS-Dash is a **mature, production-oriented HEMS monorepo** with exemplary post-audit security hardening (April 2026 adversarial remediation), a well-structured adapter architecture, strong CI gates, and comprehensive documentation. The codebase is **not certification-ready** for safety-critical electrical deployment without independent assessment.

### Overall posture

| Dimension | Grade | Summary |
|-----------|-------|---------|
| **Safety & regulatory** | B- | Strong software controls; mock default shipped (#128); no VDE/IEC/CE certification |
| **Security** | B+ | JWT/WS/CORS/command-safety mature; industrial protocol gaps (OCPP Profile 3, EEBUS frontend path); doc/CI drift on Grype/cosign |
| **Reliability & tests** | B | ~53 web + 11 API unit tests, 46 E2E; enforced coverage ~52–55% vs 85% roadmap; evcc/audit gaps |
| **Performance** | B | Throttle, LTTB, workers, downsampling implemented; adapter worker unwired; 100+ device scale not ready |
| **Maintainability** | B+ | Strict TS, Biome 2.4, ADRs, dual-store pattern; Settings monolith (~3.5k lines) |
| **UX / a11y / i18n** | A- | WCAG ~88%; DE/EN parity enforced; 11 P3 a11y items remain |
| **Documentation & DX** | A | 56 docs, devcontainer, adapter guides; some roadmap overclaims vs code |
| **DevOps / supply chain** | B | SLSA L3 attestations, CodeQL, Semgrep, Syft SBOM; Grype/cosign documented but not in workflows |

### Finding counts

| Severity | Count | Top themes |
|----------|-------|------------|
| **Critical** | 2 | `ADAPTER_MODE=live` default; auth token never persisted (`nexus-hems-auth-token`) |
| **High** | 12 | OCPP Profile 3, EEBUS SPA auth, WS scope gaps, evcc untested, coverage thresholds not enforced in CI, supply-chain scan drift |
| **Medium** | 18 | mTLS lifecycle, HA state, CSP harmonization, perf bridge unthrottled, Settings complexity |
| **Low** | 14 | Demo share fallback, Scorecard non-blocking, Storybook gaps, commitlint scopes |

### Immediate actions (Phase 0) — updated 2026-06-29

1. ~~Change `ADAPTER_MODE` default to `mock`~~ ✅ Done (#128).
2. Wire JWT into all EEBUS UI fetches ✅ (#129); expose token exchange in Settings UI ⏳.
3. Add Grype scan to `sbom-scan.yml` or keep docs aligned (truth-sync ✅ #129; CI step ⏳ SUPPLY-01).
4. Add `EvccAdapter` tests and `logCommandAudit` coverage (safety-critical path).

---

## 1. Discovery Methodology

### 1.1 Repository exploration

| Area | Files reviewed |
|------|----------------|
| Root | `README.md`, `CHANGELOG.md`, `SECURITY.md`, `CONTRIBUTING.md`, `DESIGN-SYSTEM.md`, `package.json`, `turbo.json`, `biome.json` |
| Apps | `apps/api/`, `apps/web/` (core, adapters, pages, tests, workers) |
| Packages | `packages/shared-types/` |
| CI/CD | `.github/workflows/` (ci, security-full, sbom-scan, deploy, lighthouse, fuzz) |
| Docs | All 56 files in `docs/` including ADRs, roadmaps, security audits |
| Recent history | Last 20 commits on `main`; active Dependabot branches |

### 1.2 Live deployment

- **GitHub Pages demo:** https://qnbs.github.io/Nexus-HEMS-Dash/
- Static SPA with meta-CSP; API calls require separate backend or mock adapters
- E2E `baseURL`: `http://127.0.0.1:4173/Nexus-HEMS-Dash/`

### 1.3 Evidence standards

Every finding includes: **ID**, **Category**, **Severity**, **Impact**, **Effort**, **Evidence (file:line)**, **Recommended fix**, **Risk if unfixed**, **Phase**.

---

## 2. Multi-Dimensional Audit

### A. Safety, Regulatory & Compliance

#### Strengths

- **`docs/Safety-Certification-Notice.md`** — comprehensive hazard table, mock-vs-live delta, pre-deployment checklist, command-safety architecture diagram.
- **Command Safety Layer** — Zod validation, 30 cmd/min rate limit, 25 kW cap, IndexedDB audit trail (`apps/web/src/core/command-safety.ts`).
- **Circuit breaker FSM** — exponential backoff + jitter (`apps/web/src/core/circuit-breaker.ts`).
- **Mock mode for WS data** — `mock-data.ts` defaults `ADAPTER_MODE` to `mock` (line 12).

#### Findings

| ID | Finding | Sev | Impact | Effort | Evidence | Fix | Risk |
|----|---------|-----|--------|--------|----------|-----|------|
| **SAF-01** | Backend `ADAPTER_MODE` defaults to `live` | **CRIT** | Unintended Modbus polling of `device-map.json` hosts on startup | S | `protocols/index.ts:29` vs `Safety-Certification-Notice.md:53` (claims mock default) | Default to `mock`; require explicit opt-in for live | Property damage, grid violations on misconfigured deploy |
| **SAF-02** | Shipped `device-map.json` contains 3 live IP targets | **HIGH** | `192.168.1.100–102` polled when live | S | `apps/api/src/data/device-map.json` | Ship empty map or example-only with comment | Unintended LAN traffic |
| **SAF-03** | No regulatory certification (VDE, IEC, CE) | **INFO** | Cannot claim compliance for live hardware | XL | `Safety-Certification-Notice.md:26–35` | Engage TÜV/DEKRA for EEBUS; CharIN for ISO 15118 | Legal/regulatory liability |
| **SAF-04** | Command audit trail untested | **HIGH** | Audit log integrity unverified under load | M | `command-safety.ts:164–191`; no test coverage | Add Vitest for `logCommandAudit` + 5000-entry cleanup | Forensic gap after incident |
| **SAF-05** | `requiresConfirmation` / `EmergencyStop` untested | **MED** | UI safety interlocks unverified | M | `command-safety.ts`; no test refs | Unit + E2E tests | Accidental high-power commands |
| **SAF-06** | GDPR Art. 25 partial — no formal DPIA | **MED** | Privacy compliance documentation gap | L | `Safety-Certification-Notice.md:35` | Conduct DPIA for AI/tariff data flows | Regulatory exposure (EU) |

#### Certification readiness recommendations

1. Hazard analysis (FMEA) per adapter domain with traceability matrix (requirement → test → code).
2. Read-only deployment mode flag blocking all `sendCommand` paths until operator enables writes.
3. Structured command audit export API for incident investigation.
4. Independent SIL assessment before any "certified" marketing claims.

---

### B. Security

#### Strengths (post April 2026 remediation)

| Control | Maturity | Evidence |
|---------|----------|----------|
| JWT dual-key rotation | HIGH | `jwt-utils.ts`, `POST /api/auth/rotate-key` |
| API key scope clamping | HIGH | `clampScope()` in `auth.ts` |
| WS ticket system (no JWT in URL) | HIGH | `auth.routes.ts` ws-ticket |
| AES-GCM AI key vault | HIGH | `ai-keys.ts`, PBKDF2 600k iterations |
| Helmet CSP + nonce bridge | HIGH | `security.ts`, `index.ts` nonce extraction |
| PII sanitization pipeline | HIGH | `@nexus-hems/shared-types/sanitize-text.ts`, ADR-008 |
| SSRF-hardened adapter worker | HIGH | `adapter-worker.ts` allowlist + redirect block |
| Tiered rate limiting | HIGH | Global 100/min, auth 5/min, control 5/min |
| CodeQL + Semgrep + Gitleaks | HIGH | `security-full.yml` |

#### Remaining gaps

| ID | Finding | Sev | Impact | Effort | Evidence | Fix | Risk |
|----|---------|-----|--------|--------|----------|-----|------|
| **SEC-01** | Auth token read but never written | **CRIT** | EEBUS pairing, background sync, shares fail in production | M | `background-sync.ts:166`, `sharing.ts:87`; **no `setItem('nexus-hems-auth-token')` anywhere** | Persist JWT after `/api/auth/token`; central `auth-store.ts` | Broken admin features in prod |
| **SEC-02** | EEBUS/Cert UI calls lack `Authorization` | **HIGH** | All `/api/eebus/*` fail with 401 in production | S | `CertificateManagement.tsx`; `eebus.routes.ts:13–14` | Attach Bearer from auth store | EEBUS pairing unusable |
| **SEC-03** | EEBUS frontend: plain WS, auto-PIN | **HIGH** | Bypasses SHIP mTLS/SKI server controls | L | `EEBUSAdapter.ts` | Route through API proxy or require PIN UI | Unauthorized device pairing |
| **SEC-04** | OCPP Security Profile 3 not operational | **HIGH** | No client cert, CRL/OCSP for CSMS | L | `OCPP21Adapter.ts:110–111, 179–231` | Implement TLS creds from `secure-store` | Man-in-the-middle on OCPP |
| **SEC-05** | WS scope check incomplete | **HIGH** | `read` scope can send write commands | M | `energy.ws.ts:17–20` vs `WSCommandTypeSchema` | Map all write types to `readwrite`/`admin` | Privilege escalation when live |
| **SEC-06** | Grype documented but not in CI | **HIGH** | Container CVEs undetected | M | `sbom-scan.yml` (Syft only); `CHANGELOG.md:180` claims Grype | Add `anchore/scan-action` step | Supply-chain vulnerability |
| **SEC-07** | Cosign documented but not in deploy | **HIGH** | No image signature verification | M | `deploy.yml` (GitHub Pages only); `SECURITY.md:98–115` | Add cosign to container publish workflow | Tampered images |
| **SEC-08** | Default API key max scope `readwrite` | **HIGH** | Privilege escalation if scopes unset | S | `auth.ts:63–64` | Fail startup if `API_KEY_SCOPES` unset in prod | Over-privileged tokens |
| **SEC-09** | In-memory WS tickets / share store | **MED** | HA split-brain | M | `auth.routes.ts:13`, `shares.routes.ts:25` | Redis backing like JTI | Session inconsistency |
| **SEC-10** | JWT in localStorage (XSS vector) | **MED** | Token exfiltration on XSS | L | `background-sync.ts:166` | HttpOnly cookie or short-lived tokens | Account compromise |
| **SEC-11** | CSP surface inconsistencies | **MED** | XSS mitigation variance | M | `index.html` vs `nginx.conf` vs `security.ts` | Harmonize `img-src`, `connect-src` | Policy bypass per surface |
| **SEC-12** | Command rate limit per-type not per-principal | **MED** | 30×N commands via type rotation | S | `command-safety.ts:94–107` | Key by session/adapter ID | Command flooding |

#### Adversarial audit delta (April 2026 → June 2026)

| Original ID | April status | June 2026 status |
|-------------|--------------|------------------|
| CRIT-01–04 | Fixed | ✅ Verified |
| HIGH-01–09 | Fixed | ✅ Mostly verified; **HIGH-05 incomplete** (token persistence) |
| HIGH-06 EEBUS trust | Partial | 🔄 Backend done; frontend auth broken |
| MED-06 shares | Mitigated | 🔄 Server-backed when JWT present; offline demo fallback remains |
| G-02 Grype | "Done" in roadmap | ❌ **Doc drift** — not in `sbom-scan.yml` |

---

### C. Code Quality, Architecture & Maintainability

#### Strengths

- **Dual Zustand store** with `useAdapterBridge()` — clear separation of UI vs real-time energy (`ADR-002`).
- **Adapter registry** — static + dynamic contrib loading, OSGi-style lifecycle.
- **BaseAdapter template** — circuit breaker, Zod, reconnect, metrics for free.
- **Strict TypeScript** — `noExplicitAny` enforced; zero `any` in `apps/web/src`.
- **React Compiler** — no manual `useMemo`/`useCallback` pollution.
- **14 ADRs** documenting major decisions.
- **Structured API logging** — `apps/api/src/core/logger.ts` (NDJSON).

#### Findings

| ID | Finding | Sev | Impact | Effort | Evidence | Fix |
|----|---------|-----|--------|--------|----------|-----|
| **ARCH-01** | `Settings.tsx` monolith ~3,526 lines | **MED** | Maintainability, review burden | L | `apps/web/src/pages/Settings.tsx` | Split into tab submodules |
| **ARCH-02** | Triple state sync on every adapter tick | **MED** | Redundant work, bug surface | M | `useEnergyStore.ts:443–457` | Batch bridge + query updates with merge throttle |
| **ARCH-03** | `sendAdapterCommand` broadcasts to all adapters | **MED** | Unintended multi-adapter commands | M | `useEnergyStore.ts:380–390` | Add `targetAdapterId` routing |
| **ARCH-04** | Evcc/OpenEMS exist but not in builtin registry | **MED** | Discovery confusion | S | `adapter-registry.ts:280–317` | Register or document manual-only |
| **ARCH-05** | Optimizer logic duplicated (main + ai-worker) | **LOW** | Drift risk | M | `optimizer.ts` vs `ai-worker.ts:31–60` | Single source in worker |
| **ARCH-06** | `energy-controllers.ts` ~900 lines, boilerplate | **LOW** | DRY violation | M | `energy-controllers.ts:70–774` | Extract shared controller base |

---

### D. Performance & Scalability

#### Implemented (verified)

| Optimization | Evidence |
|--------------|----------|
| 250 ms `mergeData()` throttle | `useEnergyStore.ts:147–203` |
| Adaptive ring buffers (~80% memory reduction) | `RING_BUFFER_SIZES` in `useEnergyStore.ts` |
| Dexie tiered downsampling | `downsampling-service.ts`, started in `main.tsx` |
| LTTB chart sampling | `chart-sampling.ts`, `HistoricalChart.tsx` |
| Sankey Web Worker | `sankey-worker.ts` |
| REST adapter worker (exists) | `adapter-worker.ts` |
| Bundle size gates (1100 kB JS gzip) | `package.json` size-limit, `ci.yml` |
| Lighthouse CI (perf ≥85%) | `lighthouserc.json` |

#### Pending / gaps

| ID | Finding | Sev | Impact | Effort | Evidence | Fix |
|----|---------|-----|--------|--------|----------|-----|
| **PERF-01** | Adapter worker not wired to consumers | **HIGH** | Modbus/Shelly poll on main thread | M | `useAdapterWorker.ts` — zero imports | Wire into Modbus/Shelly adapters |
| **PERF-02** | Unthrottled bridge side effects | **HIGH** | Dexie + React Query at adapter rate | M | `useEnergyStore.ts:443–457` | Throttle to 250 ms window |
| **PERF-03** | MPC optimizer on main thread | **MED** | UI jank during LP solve | M | `OptimizationAI.tsx:119` | Move to `ai-worker.ts` |
| **PERF-04** | No runtime perf probes | **MED** | Cannot verify <50 ms merge target | M | `Performance-Optimization-Plan.md:269–274` | Prometheus histograms |
| **PERF-05** | 100+ devices: aggregate-only model | **HIGH** | No per-device store scaling | L | `UnifiedEnergyModel` design | `useDeviceStore` or device registry |
| **PERF-06** | Shelly sequential polling | **MED** | N×HTTP per interval | M | `shelly-rest.ts:187–190` | Parallel batch + worker |
| **PERF-07** | EventBus 1000-point cap | **MED** | Data loss at high ingest | S | `EventBus.ts:18–19` | Configurable cap + metrics |
| **PERF-08** | Performance plan doc drift (LTTB) | **LOW** | Confusing roadmap | S | `Performance-Optimization-Plan.md:20 vs 156` | Truth-sync scope table |

#### Bundle budgets (configured, not measured this audit)

| Chunk | Budget (gzip) |
|-------|---------------|
| Total JS | 1100 kB |
| Total CSS | 25 kB |
| Framework | 85 kB |
| Recharts vendor | 110 kB |

---

### E. Testing & Quality Gates

#### Current state

| Metric | Web | API | Roadmap target |
|--------|-----|-----|----------------|
| Statements | 52% | 55% | 85% |
| Branches | 42% | 45% | 85% |
| Functions | 53% | 55% | 85% |
| Lines | 53% | 55% | 85% |

**Test inventory:** 53 web unit files, 11 API tests (+2 protocol), 46 E2E Playwright tests, 3 fuzz tests.

#### CI gates

| Gate | Blocking in `ci-passed`? |
|------|--------------------------|
| Lint + type-check | ✅ |
| Web coverage | ✅ |
| API tests (no coverage) | ✅ |
| Build + size-limit | ✅ |
| E2E (Chromium + Firefox) | ✅ |
| Prod `pnpm audit` (high+) | ✅ |
| Fuzz (`security-fuzz.test.ts`) | ❌ Separate workflow |
| Lighthouse | ❌ Separate workflow |
| CodeQL / Semgrep | ❌ `security-full.yml` |

#### Critical test gaps

| ID | Gap | Sev | Evidence |
|----|-----|-----|----------|
| **TEST-01** | `EvccAdapter` — zero tests | **CRIT** | No matches in `apps/web/src/tests/` |
| **TEST-02** | `logCommandAudit` untested | **HIGH** | `command-safety.ts:164–191` |
| **TEST-03** | New command types untested in `validateCommand` | **HIGH** | OpenADR/VPP/V2G types in schema |
| **TEST-04** | API coverage not enforced in CI | **HIGH** | `ci.yml:54–55` vs `vitest.config.ts` thresholds |
| **TEST-05** | API WebSocket integration — 1 test only | **HIGH** | `energy-ws.test.ts` |
| **TEST-06** | `SankeyDiagram` / `CommandHub` — E2E only | **MED** | Strategy doc Priority 2 |
| **TEST-07** | `hardware-registry`, `grid-operator-api` — missing | **MED** | `Testing-Coverage-Strategy.md` |
| **TEST-08** | Fuzz scope mismatch (3 tests vs doc promise) | **MED** | `test:fuzz` script |
| **TEST-09** | A11y E2E 240s waits — flake masking | **LOW** | `accessibility.spec.ts:26` |

---

### F. Documentation, Onboarding & DX

#### Strengths

- 56 markdown docs including protocol guides, ADRs, deployment checklist.
- Devcontainer with Node 24 + Rust + Playwright extensions.
- `scripts/check-i18n.sh` + Vitest `i18n-sync.test.ts`.
- Graphify knowledge graph integration (per `CLAUDE.md`).
- Cloud-first CI policy documented for RAM-constrained maintainers.

#### Gaps

| ID | Finding | Sev | Evidence |
|----|-----|-----|----------|
| **DOC-01** | Grype/cosign claimed implemented — not in workflows | **HIGH** | `CHANGELOG.md`, `Master-Improvement-Roadmap.md` vs `sbom-scan.yml` |
| **DOC-02** | `ADAPTER_MODE` default contradicts safety notice | **HIGH** | `Safety-Certification-Notice.md:53` vs `protocols/index.ts:29` |
| **DOC-03** | Performance plan LTTB status inconsistent | **LOW** | `Performance-Optimization-Plan.md` |
| **DOC-04** | No `ARCHITECTURE.md` top-level (scattered in README/ADRs) | **LOW** | — |
| **DOC-05** | Storybook missing stories for Sankey/Floorplan | **LOW** | `Technical-Debt-Registry.md` LOW-08 |

---

### G. Dependencies, Tooling & DevOps

#### Strengths

- pnpm 10 + Turborepo with `--concurrency=1` policy for constrained hardware.
- Renovate + Dependabot active; security overrides documented in debt registry.
- SLSA Level 3 build provenance on `main` builds.
- Distroless backend image (`Dockerfile.server`).
- `step-security/harden-runner` on release/deploy/security workflows.
- Pinning GitHub Actions to SHAs.

#### Gaps

| ID | Finding | Sev | Evidence |
|----|-----|-----|----------|
| **DEV-01** | Grype missing from SBOM workflow | **HIGH** | `sbom-scan.yml` |
| **DEV-02** | Tauri mobile CI incomplete | **MED** | `tauri.conf.json` empty iOS/Android |
| **DEV-03** | Capacitor 7→8 migration in progress | **MED** | Recent dependabot commits |
| **DEV-04** | OpenSSF Scorecard non-blocking | **LOW** | `security-full.yml` `continue-on-error` |
| **DEV-05** | Snyk optional/unconfigured | **LOW** | `SECURITY.md:266` |
| **DEV-06** | `fuzz.yml` not in `ci-passed` aggregate | **MED** | Parallel gate only |

---

### H. UX, Accessibility, i18n & Theming

#### Strengths (from `docs/WCAG-2.2-Audit.md`, verified 2026-04-29)

- Overall WCAG 2.2 AA: **~88%**; P1/P2 critical issues resolved.
- Skip link, focus-visible, forced-colors, reduced-motion support.
- Full DE/EN i18n with automated parity tests.
- 5 themes with CSS custom properties (Tailwind v4 `@theme`).
- 13 a11y E2E tests across 8 routes.

#### Remaining (P3)

| ID | Finding | Sev | WCAG SC |
|----|---------|-----|---------|
| **A11Y-01** | Chart axis tick contrast < 3:1 | **MED** | 1.4.11 |
| **A11Y-02** | Live ticker cannot be paused | **MED** | 2.2.2 |
| **A11Y-03** | Some icon buttons 32×32 (below 44×44 recommended) | **LOW** | 2.5.8 |
| **A11Y-04** | 11 P3 items in WCAG audit | **LOW** | Various |

---

## 3. Prioritization Matrix

| ID | Category | Finding | Severity | Impact | Effort | Recommended Action | Phase |
|----|----------|---------|----------|--------|--------|-------------------|-------|
| SAF-01 | Safety | `ADAPTER_MODE=live` default | Critical | Hardware polling | S | Default `mock` | 0 |
| SEC-01 | Security | Auth token never persisted | Critical | Broken prod auth | M | Auth store + setItem | 0 |
| SEC-02 | Security | EEBUS UI unauthenticated | High | Pairing broken | S | Bearer header | 0 |
| SEC-05 | Security | WS scope incomplete | High | Privilege escalation | M | Extend scope map | 0 |
| SEC-06 | Security | Grype not in CI | High | Supply chain | M | Add scan step | 0 |
| TEST-01 | Testing | EvccAdapter untested | Critical | EV safety | M | Full adapter test suite | 1 |
| TEST-02 | Testing | Command audit untested | High | Forensics | S | Unit tests | 1 |
| PERF-01 | Performance | Adapter worker unwired | High | Main-thread load | M | Wire consumers | 1 |
| PERF-02 | Performance | Unthrottled bridge | High | Scale limit | M | Batch throttle | 1 |
| SEC-04 | Security | OCPP Profile 3 | High | MITM risk | L | TLS + cert lifecycle | 1 |
| SEC-03 | Security | EEBUS frontend mTLS | High | Pairing bypass | L | API proxy path | 2 |
| PERF-05 | Performance | 100+ device model | High | Scale | L | Device registry store | 2 |
| ARCH-01 | Architecture | Settings monolith | Medium | Maintainability | L | Split modules | 2 |
| SAF-03 | Safety | No certification | Info | Legal | XL | External audit | 3 |
| SEC-10 | Security | Multi-user RBAC | Medium | Shared access | L | ADR-009 implementation | 3 |

*(Full matrix: 46 findings catalogued; see `docs/Technical-Debt-Registry.md` for tracked items.)*

---

## 4. Security Delta Report (April 2026 → June 2026)

### Improvements since last audit

| Area | Delta |
|------|-------|
| JWT rotation | `POST /api/auth/rotate-key`, dual-key verify, Prometheus counters |
| Trust proxy | `TRUST_PROXY` env, documented multi-hop |
| Server-backed shares | `shares.routes.ts`, Zod contracts, timing-safe redeem |
| EEBUS HA trust | Redis backend option (`eebus-trust-redis.ts`) |
| Security metrics | `security-metrics.ts` for JWT/EEBUS observability |
| Tauri updater | **Removed** — reduces supply-chain attack surface |
| CVE remediation | `ws`, `protobufjs` high-severity fixes (commit `099360b`) |

### Regressions / new findings

| Area | Delta |
|------|-------|
| Auth token persistence | HIGH-05 fix incomplete — read path exists, write path missing |
| Doc/CI drift | Grype/cosign marked done but not in active workflows |
| `ADAPTER_MODE` | Safety doc says mock default; code still defaults live |

### Security score estimate

| Metric | April 2026 | June 2026 |
|--------|------------|-----------|
| Adversarial CRIT open | 0 | 0 |
| Adversarial HIGH open | ~2 partial | ~6 (auth wiring, OCPP, Grype, scopes) |
| CI SAST coverage | High | High (unchanged) |
| Container scan | Claimed | **Not verified in CI** |

---

## 5. Performance Delta Report (April 2026 → June 2026)

### Implemented since last plan update

| Item | Status |
|------|--------|
| LTTB in HistoricalChart + HistoricalAnalyticsPage | ✅ Verified wired |
| Lighthouse `uses-rel-preconnect` fix | ✅ PR #102 |
| `.perf/` artifact staging | ✅ In lighthouse + perf-benchmark workflows |

### Still pending

| Item | Status |
|------|--------|
| Adapter worker integration | ❌ Hook exists, no consumers |
| Runtime Prometheus probes | ❌ Not implemented |
| Merge latency measurement | ❌ Unmeasured |
| MPC in worker | ❌ Main thread |
| Canvas/WebGL Sankey fallback | ❌ Deferred (correct) |

### Estimated performance headroom

Without local `pnpm size` / Lighthouse run (cloud-first policy), budgets remain **configured and CI-gated**. No evidence of budget regression in recent commits.

---

## 6. Praise — What Is Already Excellent

1. **Post-adversarial security culture** — systematic remediation with ADRs, metrics, and test coverage for JWT/WS paths.
2. **Adapter plugin architecture** — extensible, well-documented, with circuit breaker and command safety built in.
3. **CI depth** — SLSA L3, dual-browser E2E, size-limit as real gate, security-full parallel pipeline.
4. **Documentation volume and quality** — rare for a homelab-scale project; protocol comparison matrices, migration guides, safety notice.
5. **Accessibility investment** — automated axe E2E on 8 routes, WCAG audit with remediation tracking.
6. **Strict toolchain** — Biome 2.4 single formatter/linter, React Compiler, zero `any`.
7. **Energy domain depth** — OCPP 2.1 BPT, OpenADR 3.1, VPP skeleton, UC 2.6 translator, §14a EnWG — ambitious and well-structured.

---

## 7. Rollback Strategies

| Change type | Rollback |
|-------------|----------|
| `ADAPTER_MODE` default → mock | Env var `ADAPTER_MODE=live` restores current behavior |
| Auth token persistence | Feature flag `VITE_AUTH_PERSIST=false` during rollout |
| Grype CI gate | `continue-on-error: true` initially, tighten after baseline scan |
| WS scope expansion | Deploy with logging-only mode before enforcing disconnect |
| Perf throttle changes | Env `VITE_BRIDGE_THROTTLE_MS=0` to disable batching |

---

## 8. Related Documents

| Document | Purpose |
|----------|---------|
| `docs/Perfection-Roadmap.md` | Phased execution plan (this audit's action items) |
| `docs/Technical-Debt-Registry.md` | Canonical debt tracker (updated 2026-06-29) |
| `docs/Security-Roadmap-2026.md` | Security planning (needs Grype truth-sync) |
| `docs/Performance-Optimization-Plan.md` | Performance planning (needs LTTB truth-sync) |
| `docs/Safety-Certification-Notice.md` | Safety pre-deployment checklist |

---

*This report should be re-run quarterly or before each minor release. Next scheduled review: 2026-09-29.*
