# Master Improvement Roadmap — Nexus-HEMS-Dash

> **Version:** 1.1.x → 1.2.0 path
> **Created:** 2026-04-25
> **Status:** Active — Implementation in progress
> **Owner:** @qnbs

This document is the authoritative, fully enumerated improvement roadmap derived from a comprehensive
discovery audit performed on 2026-04-25 and extended by the CI/documentation remediation pass on
2026-04-26. It covers the original gap inventory plus the active all-green CI recovery program,
including strategic decisions, metrics targets, and verification criteria.

---

## Executive Summary

The Nexus-HEMS-Dash platform is production-grade and feature-complete. The post-migration discovery
audit surfaced **3 critical security gaps**, **2 critical performance gaps**, and **12 medium/low-priority
improvement opportunities**. This roadmap closes all gaps systematically while preserving every existing
strength.

| Phase | Focus | Steps | Effort | Priority |
|-------|-------|-------|--------|----------|
| 0 | Documentation & Roadmap preparation | 9 | ~2 PT | Foundation |
| 1 | CI/Infra Hardening — SBOM, Grype, Distroless, PSS | 6 | ~1.5 PT | CRITICAL |
| 2 | Performance — Downsampling, Ring-Buffer, LTTB | 4 | ~1.5 PT | HIGH |
| 3 | Security — JTI-Redis, PII-Scanning, Cert-Manager | 4 | ~2 PT | HIGH |
| 4 | Testing — Coverage 48→60→75→85%, Chromatic, Fuzz | 3 | ~2 PT | MEDIUM |
| 5 | Features — UPnP, §14a, WCAG AAA | 3 | ~5 PT | MEDIUM |
| 6 | Docs & Community — Log4brains, CLI | 2 | ~1 PT | LOW |
| **P-V2G** | **Protocol Expansion — V2G BPT, OpenADR 3.1.0, VPP, UC 2.6** | **13** | **~8 PT** | **HIGH (v1.2.0)** |
| **Total** | | **44** | **~23 PT** | |

---

## Phase 0R — CI Recovery & Documentation Truth Alignment (2026-04-26)

> **Status:** Active — implementation started
> **Goal:** Restore strict all-green push status across every currently triggered GitHub check and
> align central documentation with the verified repository state.

### Acceptance Criteria

- All current `push` checks pass, not only baseline aggregates.
- Aggregate `✅ CI Passed` jobs fail on any non-successful prerequisite in their workflow.
- Build artifacts used by browser-based checks are produced with consistent env semantics.
- Core docs and agent-instruction files stop contradicting the repository source of truth.

### Current Failing Push Checks (Audit Baseline)

| Check | Cluster | Primary control surface |
|------|---------|-------------------------|
| `CI / Lint & Type Check` | Core pipeline | `.github/workflows/ci.yml` |
| `CI (Optimized) / 🔍 Lint & Type Check` | Core pipeline | `.github/workflows/perf-optimized-ci.yml` |
| `CI (Optimized) / 🧪 Unit Tests` | Core pipeline | `.github/workflows/perf-optimized-ci.yml` |
| `CI (Optimized) / 🏗️ Build` | Build/env parity | `.github/workflows/perf-optimized-ci.yml`, `turbo.json` |
| `Lighthouse CI / lighthouse` | Preview/PWA parity | `apps/web/lighthouserc.json`, `.github/workflows/lighthouse.yml` |
| `Performance Benchmark / 📦 Bundle Size & Analysis` | Build budgets | `.github/workflows/perf-benchmark.yml`, `apps/web/package.json` |
| `Release / release` | Release path | `.github/workflows/release.yml`, `.releaserc.json` |
| `CI / ✅ CI Passed` | Status semantics | `.github/workflows/ci.yml` |
| `CI (Optimized) / ✅ CI Passed` | Status semantics | `.github/workflows/perf-optimized-ci.yml` |

### Phase 0R Implementation Steps

| Step | Action | Files | Status |
|------|--------|-------|--------|
| 0R.1 | Make aggregate CI success jobs strict for the full workflow scope | `.github/workflows/ci.yml`, `.github/workflows/perf-optimized-ci.yml` | 🔄 |
| 0R.2 | Build browser-test artifacts with consistent `VITE_E2E_TESTING` semantics | `.github/workflows/ci.yml`, `.github/workflows/perf-optimized-ci.yml` | 🔄 |
| 0R.3 | Align Lighthouse preview server with Node 24 IPv4/IPv6 behavior | `apps/web/lighthouserc.json` | 🔄 |
| 0R.4 | Synchronize roadmap, debt register, README, and agent instructions to verified repo truth | `docs/`, `README.md`, `CLAUDE.md`, `.github/copilot-instructions.md` | ⏳ |
| 0R.5 | Verify locally with narrow checks, then rely on GitHub Actions for heavy suites | root scripts + workflow runs | ⏳ |

---

## Phase P-V2G — Protocol Expansion (v1.2.0) — NEW

> **Status:** In progress (Documentation phase complete, code implementation in progress)
> **Scope:** ISO 15118-20 BPT parameters, OpenADR 3.1.0 VEN-client, VPP single-home node, UC 2.6 translator, Matter DEM clusters

### Identified Gaps

| ID | Gap | Severity | File |
|----|-----|----------|------|
| PV-01 | `EnergyAdapter.ts` has no BPT negotiation parameter fields (ISO 15118-20 Annex D) | HIGH | `apps/web/src/core/adapters/EnergyAdapter.ts` |
| PV-02 | `OCPP21Adapter.ts` `sendV2XDischarge()` is a stub — no BPT negotiation, no SOC guardrails | HIGH | `apps/web/src/core/adapters/OCPP21Adapter.ts` |
| PV-03 | No OpenADR 3.1.0 adapter exists anywhere in the codebase | HIGH | — |
| PV-04 | No API proxy for OpenADR VTN OAuth2 communication | HIGH | — |
| PV-05 | `EVSmartChargeController` is charging-only, no V2G discharge slot | MEDIUM | `apps/web/src/core/energy-controllers.ts` |
| PV-06 | MPC `optimizer.ts` Pass 3 is EV load-only, no V2X bidirectional | MEDIUM | `apps/web/src/lib/optimizer.ts` |
| PV-07 | No UC 2.6 translator (OpenADR events → DEM requests → VPP bids) | MEDIUM | — |
| PV-08 | `MatterThreadAdapter.ts` missing DEM (0x98), EPM (0x90), EEM (0x91) clusters | MEDIUM | `apps/web/src/core/adapters/contrib/MatterThreadAdapter.ts` |
| PV-09 | No VPP service — no resource registry, no flex-offer creation | LOW (future) | — |
| PV-10 | i18n: 0 VPP keys, 0 OpenADR keys, 1 V2G help-text key | LOW | `apps/web/src/locales/{en,de}.ts` |

### Phase P-V2G Implementation Steps

| Step | ID | Action | Files | Status |
|------|----|--------|-------|--------|
| PV-0.1 | Docs | Create `docs/HEMS-Protocol-Comparison.md` | — | ✅ Done |
| PV-0.2 | Docs | Create `docs/V2G-Integration-Guide.md` | — | ✅ Done |
| PV-0.3 | Docs | Create `docs/OpenADR-Integration-Guide.md` | — | ✅ Done |
| PV-0.4 | Docs | Create `docs/VPP-FlexMarket-Guide.md` | — | ✅ Done |
| PV-0.5 | Docs | Create `docs/Matter-OpenADR-Interworking-Guide.md` | — | ✅ Done |
| PV-0.6 | Docs | Create `docs/AFIR-Compliance-Checklist.md` | — | ✅ Done |
| PV-0.7 | ADR | Create `docs/adr/ADR-012-openadr-ven-client.md` | — | ✅ Done |
| PV-0.8 | ADR | Create `docs/adr/ADR-013-v2g-bpt-parameters.md` | — | ✅ Done |
| PV-0.9 | ADR | Create `docs/adr/ADR-014-vpp-single-home-node.md` | — | ✅ Done |
| PV-1A | Code | Extend `EnergyAdapter.ts`: `BPTNegotiationParams` + new commands | `EnergyAdapter.ts` | 🔄 |
| PV-1B | Code | Upgrade `OCPP21Adapter.ts`: full BPT negotiation, SOC guardrails | `OCPP21Adapter.ts` | 🔄 |
| PV-1C | Code | Create `OpenADR31Adapter.ts` contrib adapter | contrib/ | 🔄 |
| PV-1D | Code | Create `apps/api/src/routes/openadr.routes.ts` OAuth2 proxy | API routes | 🔄 |
| PV-2A | Code | Add `EVV2GDischargeController` to `energy-controllers.ts` | controllers | 🔄 |
| PV-2B | Code | Upgrade MPC `optimizer.ts` V2X bidirectional + OpenADR | optimizer | 🔄 |
| PV-2C | Code | Create `uc26-translator.ts` UC 2.6.1/2.6.2/2.6.3 | core/ | 🔄 |
| PV-3 | Code | Add DEM/EPM/EEM clusters to `MatterThreadAdapter.ts` | contrib/ | 🔄 |
| PV-4 | Code | Create `vpp-service.ts` single-home VPP node | core/ | 🔄 |
| PV-5E | Code | Add V2G/OpenADR/VPP i18n keys to `en.ts` + `de.ts` | locales/ | 🔄 |

### Verification Criteria (P-V2G)

- `time pnpm type-check` — 0 errors
- `pnpm lint` — 0 errors, 0 warnings
- `pnpm test:run` — coverage thresholds maintained (≥48% statements)
- OpenADR31Adapter connects to test VTN mock and receives `LOAD_CONTROL` event
- OCPP21Adapter `sendV2GBPTParams()` passes Zod validation with valid BPT schema
- `EVV2GDischargeController` produces discharge W ≤ `bptParams.evMaximumDischargePower`
- SOC guardrail: discharge blocked when `evSocPercent < 15`
- MPC optimizer produces negative EV slots when `gridPrice ≥ dischargeThreshold`

---

## Discovery Findings — Strengths (Baseline)

The following capabilities were fully confirmed during discovery. They must never be degraded.

| Area | Capability | Files |
|------|-----------|-------|
| CI/CD | 16 GitHub Workflows active | `.github/workflows/` |
| JWT | Dual-key rotation + entropy validation | `apps/api/src/jwt-utils.ts` |
| Helm | non-root, read_only, seccomp, NetworkPolicy, PDB, HPA | `helm/nexus-hems/` |
| State | Zustand 250 ms throttle + 1k Ring-Buffer + stableMerge | `apps/web/src/core/useEnergyStore.ts` |
| Adapters | Per-adapter Circuit Breaker (configurable) | `apps/web/src/core/circuit-breaker.ts` |
| Persistence | Dexie v10 compound index `[resolution+bucketTs]` | `apps/web/src/lib/db.ts` |
| Tariffs | §14a EnWG — 5 providers, off-peak/peak/dynamic fields | `apps/web/src/lib/tariff-providers.ts` |
| i18n | 100% DE/EN parity — 260+ keys | `apps/web/src/locales/` |
| AI Security | AES-GCM 256-bit encrypted AI key vault | `apps/web/src/lib/ai-keys.ts` |
| Toolchain | Biome 2.5.2 + react-compiler (error level) | `biome.json`, `eslint.config.js` |
| Testing | 37 test files covering adapters, DB, store, UI | `apps/web/src/tests/` |
| Storybook | v10 + a11y addon | `apps/web/.storybook/` |
| Pages | 7 unified sections fully implemented | `apps/web/src/pages/` |
| Docs | 14 architecture/security/toolchain docs | `docs/` |

---

## Discovery Findings — Gaps (Prioritized)

### Critical Gaps (must resolve)

| ID | Gap | Impact | File(s) |
|----|-----|--------|---------|
| G-01 | JTI Revocation **in-memory only** — lost on server restart | Security | `apps/api/src/jwt-utils.ts` |
| G-02 | ~~**Grype/cosign not in CI**~~ — resolved via `sbom-scan.yml` + `container-publish.yml` | Security/CI | `.github/workflows/sbom-scan.yml`, `.github/workflows/container-publish.yml` |
| G-03 | **Distroless missing** — Alpine in production stage | Security | `Dockerfile`, `Dockerfile.server` |
| G-04 | **Dexie Downsampling: schema ready, no auto-trigger** | Performance | `apps/web/src/lib/db.ts` |
| G-05 | **Test coverage 48–49%** — target is 85% | Quality | `apps/web/vitest.config.ts` |

### Medium Gaps

| ID | Gap | Impact | File(s) |
|----|-----|--------|---------|
| G-06 | **Chromatic not gated in CI** — visual regression unblocked | Quality | `.github/workflows/chromatic.yml` |
| G-07 | **PII scanning missing** in `sanitizeForPrompt()` | Security/AI | `apps/web/src/core/aiClient.ts` |
| G-08 | **Helm PSS Labels missing** — PodSecurityPolicy deprecated K8s 1.25+ | Infra | `helm/nexus-hems/templates/` |
| G-09 | **Ring-Buffer fixed 1k** — not configurable per adapter type | Performance | `apps/web/src/core/useEnergyStore.ts` |
| G-10 | Recharts no data sampling — slow with >500 points | Performance | `apps/web/src/pages/Analytics.tsx` |

### Low-Priority Gaps

| ID | Gap | Impact | File(s) |
|----|-----|--------|---------|
| G-11 | OpenSSF Scorecard badge missing in README | Visibility | `README.md` |
| G-12 | UPnP Discovery not implemented (only mDNS) | Features | `apps/api/src/protocols/` |
| G-13 | §14a Sperrzeiten-Vorhersage missing (no grid-operator API) | Features | `apps/web/src/lib/tariff-providers.ts` |
| G-14 | WCAG AAA tests missing (only AA + axe-core) | A11y | `apps/web/tests/e2e/` |
| G-15 | No ADR tooling (Log4brains) | DX/Docs | Root |
| G-16 | `create-nexus-adapter` CLI missing | DX | `scripts/` |
| G-17 | `.renovaterc.json` possibly not committed | Tooling | Root |

---

## Architecture Decision Records (Full Set)

All detailed ADRs are in `docs/adr/`. This table provides a summary.

| ADR | Title | Decision | Status |
|-----|-------|----------|--------|
| ADR-001 | Biome-First Toolchain | Biome 2.5.2 replaces Prettier + typescript-eslint | Accepted |
| ADR-002 | Zustand Dual-Store Pattern | `useAppStore` (UI/persist) + `useEnergyStore` (real-time) | Accepted |
| ADR-003 | JTI Revocation — Redis Fallback | Optional `ioredis` via `REDIS_URL` + graceful fallback on in-memory | Accepted |
| ADR-004 | Distroless Docker Production | Production stage → distroless; dev/build stage remains Alpine | Accepted |
| ADR-005 | Dexie Tiered Downsampling | Background service: raw → 1 min → 15 min → 1 h buckets | Accepted |
| ADR-006 | Ring-Buffer Per-Adapter Sizing | `RING_BUFFER_SIZES` map: EV=500, Victron=200, default=100 | Accepted |
| ADR-007 | Chromatic Visual Regression Gate | `failOnChanges: true` in CI; Interaction Tests via Playwright-CT | Accepted |
| ADR-008 | PII Sanitization + AI Output Filter | Regex PII masking + heuristic output filter in `aiClient.ts` | Accepted |
| ADR-009 | Multi-User RBAC (Future) | Architecture pre-design only; code implementation deferred to v1.2.0 | Deferred |

---

## Phase 0 — Documentation & Roadmap Preparation

> First step before any code change. All planning artifacts created/updated.

| Step | Action | File | Status |
|------|--------|------|--------|
| 0.1 | Create Master-Improvement-Roadmap.md | `docs/Master-Improvement-Roadmap.md` | ✅ Done |
| 0.2 | Create 9 ADR files in `docs/adr/` | `docs/adr/ADR-00*.md` | ✅ Done |
| 0.3 | Create Security-Roadmap-2026.md | `docs/Security-Roadmap-2026.md` | ✅ Done |
| 0.4 | Create Performance-Optimization-Plan.md | `docs/Performance-Optimization-Plan.md` | ✅ Done |
| 0.5 | Create Testing-Coverage-Strategy.md | `docs/Testing-Coverage-Strategy.md` | ✅ Done |
| 0.6 | Create Accessibility-Testing-Guide.md | `docs/Accessibility-Testing-Guide.md` | ✅ Done |
| 0.7 | Update Architecture-Roadmap.md | `docs/Architecture-Roadmap.md` | ✅ Done |
| 0.8 | Add OpenSSF badge to README + update CHANGELOG | `README.md`, `CHANGELOG.md` | ✅ Done |

---

## Phase 1 — Stability Hardening & CI Completion

> Critical priority. Closes G-02, G-03, G-08, G-11.

| Step | Action | File | Closes | Status |
|------|--------|------|--------|--------|
| 1.1 | Create `sbom-scan.yml` — syft SBOM + pnpm audit | `.github/workflows/sbom-scan.yml` | G-02 (partial) | ✅ Done |
| 1.2 | Add Grype to `sbom-scan.yml` + cosign on GHCR push | `.github/workflows/sbom-scan.yml`, `.github/workflows/container-publish.yml` | G-02 | ✅ Done |
| 1.3 | Distroless production stage — frontend | `Dockerfile` | G-03 | ✅ Done |
| 1.4 | Distroless production stage — backend | `Dockerfile.server` | G-03 | ✅ Done |
| 1.5 | Create `.renovaterc.json` + complete `security.yml` Snyk step | `.renovaterc.json`, `.github/workflows/security.yml` | G-17 | ✅ Done |
| 1.6 | Helm PSS Namespace Labels | `helm/nexus-hems/templates/namespace.yaml` | G-08 | ✅ Done |

**Verification:** `pnpm docker:build && pnpm docker:up` green; `pnpm audit --audit-level=high` and syft SBOM jobs pass in CI

---

## Phase 2 — Performance & Scalability

> Closes G-04, G-09, G-10.

| Step | Action | File | Closes | Status |
|------|--------|------|--------|--------|
| 2.1 | Dexie downsampling background service | `apps/web/src/lib/downsampling-service.ts` | G-04 | ✅ Done |
| 2.2 | Integrate downsampling service at app startup | `apps/web/src/main.tsx` | G-04 | ✅ Done |
| 2.3 | Ring-Buffer adaptive sizing per adapter | `apps/web/src/core/useEnergyStore.ts` | G-09 | ✅ Done |
| 2.4 | LTTB chart-sampling utility | `apps/web/src/lib/chart-sampling.ts` | G-10 | ✅ Done |

**Verification:** Dexie `energyAggregates` table populated after 15 min of runtime; chart perf <16 ms/frame

---

## Phase 3 — Security & Compliance

> Closes G-01, G-07.

| Step | Action | File | Closes | Status |
|------|--------|------|--------|--------|
| 3.1 | Optional Redis backend for JTI revocation | `apps/api/src/jwt-utils.ts` | G-01 | ✅ Done |
| 3.2 | JWT key-rotation shell script | `scripts/rotate-jwt-key.sh` | G-01 | ✅ Done |
| 3.3 | Dexie v11 — `revokedJTIs` client-side tracking | `apps/web/src/lib/db.ts` | G-01 | ✅ Done |
| 3.4 | PII scanning + AI output filter | `apps/web/src/core/aiClient.ts` | G-07 | ✅ Done |
| 3.5 | Certificate Management UI (EEBUS/OCPP pairing) | `apps/web/src/components/CertificateManagement.tsx` | — | ✅ Done |
| 3.6 | cert-manager Helm template (optional, off by default) | `helm/nexus-hems/templates/cert-manager-issuer.yaml` | — | ✅ Done |

**Verification:** `curl -X POST /api/auth/revoke`; restart server; `curl -H "Authorization: Bearer <revoked>"` → 401

---

## Phase 4 — Testing & Quality

> Closes G-05, G-06. Staged coverage: 48% → 60% → 75% → 85%.

| Step | Action | File | Closes | Status |
|------|--------|------|--------|--------|
| 4.1 | New test files (+9 files, 37→46) | `apps/web/src/tests/` | G-05 | ✅ Done |
| 4.2 | Raise vitest thresholds to 60% | `apps/web/vitest.config.ts` | G-05 | ✅ Done |
| 4.3 | fast-check property-based Zod schema tests | `apps/web/src/tests/fuzz/` | G-05 | ✅ Done |
| 4.4 | Chromatic `failOnChanges: true` + Interaction Tests | `.storybook/`, `.github/workflows/chromatic.yml` | G-06 | ✅ Done |

**Verification:** `pnpm test:coverage` ≥ 60% all metrics; Chromatic PR check blocks on visual changes

---

## Phase 5 — Feature Extensions

> Closes G-12, G-13, G-14.

| Step | Action | File | Closes | Status |
|------|--------|------|--------|--------|
| 5.1 | UPnP/SSDP discovery backend service | `apps/api/src/protocols/upnp-discovery.ts` | G-12 | ✅ Done |
| 5.2 | Extend `/api/devices/discover` endpoint | `apps/api/src/routes/` | G-12 | ✅ Done |
| 5.3 | §14a Sperrzeiten grid-operator API | `apps/web/src/lib/grid-operator-api.ts` | G-13 | ✅ Done |
| 5.4 | WCAG AAA accessibility E2E spec | `apps/web/tests/e2e/accessibility.spec.ts` (AA gate; AAA tags optional locally) | G-14 | ✅ Done |

---

## Phase 6 — Documentation & Community

> Closes G-15, G-16.

| Step | Action | File | Closes | Status |
|------|--------|------|--------|--------|
| 6.1 | Log4brains ADR tooling + scripts | `log4brains.yml`, `package.json` | G-15 | ✅ Done |
| 6.2 | `create-adapter.mjs` interactive CLI | `scripts/create-adapter.mjs` | G-16 | ✅ Done |

---

## Deferred (v1.2.0)

### Multi-User RBAC (Maßnahme 5.3 — 5 PT)

This feature fundamentally changes the auth architecture and is deferred to v1.2.0:

- Backend: Tenant table (PostgreSQL/SQLite) + Clerk Auth SDK integration
- Frontend: Shared dashboard configurations, per-user settings scoping
- RBAC: role-based access per adapter and controller
- See `docs/adr/ADR-009-multi-user-rbac-future.md` for the architectural pre-design

**Trigger criteria:** User demand + dedicated v1.2.0 planning sprint.

---

## Metrics & Targets

| Metric | Current | Target | Phase |
|--------|---------|--------|-------|
| Container CVEs (CRITICAL/HIGH) | unknown | 0 | 1 |
| JTI revocation persistence | restarts lost | Redis + fallback | 3 |
| Test coverage (statements) | 48% | 60% → 75% → 85% | 4 |
| Test coverage (branches) | 40% | 55% → 70% → 85% | 4 |
| Dexie aggregate latency (7d query) | unoptimized | <200 ms | 2 |
| Ring-buffer memory (EV adapter) | 1 000 items | 500 items | 2 |
| Chart render time (1000 pts) | slow | <16 ms frame | 2 |
| PII leak probability in AI prompts | unmitigated | masked | 3 |
| Chromatic visual regression | unblocked | gated in PR | 4 |
| OpenSSF Scorecard score | unknown | ≥7.0/10 | 1 |

---

## CI/CD Gate Summary

| Gate | Workflow | Mandatory | Blocks Deploy |
|------|----------|-----------|---------------|
| Type check + Lint | `ci.yml` | Yes | Yes |
| Unit tests (coverage ≥60%) | `ci.yml` | Yes | Yes |
| E2E (Chromium + Firefox) | `ci.yml` | Yes | Yes |
| SBOM generation (syft) | `sbom-scan.yml` | Yes | Yes |
| pnpm dependency audit | `sbom-scan.yml` | Yes | Yes (`--audit-level=high`) |
| Grype vulnerability scan | `sbom-scan.yml`, `container-publish.yml` | Yes | Yes (critical, blocking, `.grype.yaml`) |
| Cosign image signing | `container-publish.yml` | Yes (main/tags) | Yes (keyless + SLSA provenance) |
| Lighthouse (Perf ≥85%) | `lighthouse.yml` | Yes | PR comment |
| Chromatic visual regression | `chromatic.yml` | Yes (after token) | PR |
| Security (CodeQL + Semgrep) | `security-full.yml` | Yes | No (SARIF upload) |
| OpenSSF Scorecard | `scorecard.yml` | Weekly | No |

---

## Changelog Reference

All changes from this roadmap are tracked under `[Unreleased]` in `CHANGELOG.md`.
Once the implementation is complete, semantic-release will cut a new version.

---

*This document is auto-curated. Last implementation run: 2026-04-25.*
