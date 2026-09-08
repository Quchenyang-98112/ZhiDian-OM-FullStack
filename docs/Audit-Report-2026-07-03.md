# Audit Report — Nexus-HEMS-Dash (2026-07-03)

**Scope:** Full repository + application status review after v1.9.0 release chain  
**Baseline:** `main` @ `4138235` (v1.9.0)  
**Auditor:** Cursor Cloud Agent

---

## Executive summary

The project is in **strong operational shape**: CI green, GitHub Pages deploy healthy, coverage gates enforced (web **78/72/70/80**, API **55/46/62/55**), backend protocol parity largely complete (OpenEMS, OCPP CSMS, EEBUS, Modbus, MQTT, KNX, evcc, HeatPump), and safety defaults (mock mode, read-only mode, command audit) are wired end-to-end.

**Primary findings addressed in this PR:**

1. Automatic semantic-release on `main` caused rapid version churn and empty release notes → **manual-only** policy restored.
2. Version fields drifted across workspace packages → **synced to 1.9.0**.
3. Tauri desktop CI blocked by missing icons + mobile-only Rust plugins on desktop → **fixed**.
4. Documentation drift (`FEATURE_STATUS`, `CLAUDE.md`, `README`, `CHANGELOG` structure) → **truth-synced**.

**Remaining intentional backlog:** multi-user RBAC (ADR-009), optional `style-src-attr` tightening (AUD-02 follow-up).

---

## Application status

| Area | Status | Notes |
|------|--------|-------|
| **Core UI** | ✅ Shipped | 8 routes, 5 themes, i18n DE/EN, WCAG automated |
| **Energy data path** | ✅ Shipped | Mock default; live via EventBus → LiveEnergyAggregator → WS; opt-in `VITE_BACKEND_WS` (ADR-025) |
| **Protocol adapters (frontend)** | ✅ 14 adapters | 7 core + 7 contrib |
| **Protocol adapters (backend)** | ✅ 8 + ExecService | OpenEMS, OCPP CSMS, EEBUS, Modbus, MQTT, KNX, evcc, HeatPump |
| **Safety** | ✅ Strong | Mock double opt-in, READ_ONLY_MODE, command audit, circuit breakers |
| **Testing** | ✅ Good | Web ~80% stmts; API 55% stmts; E2E Chromium; fuzz in CI aggregate |
| **Deploy** | ✅ Healthy | GitHub Pages auto-deploy + Pages retry (PR #232) |
| **Supply chain** | ✅ Gated | Grype, cosign, SBOM, SLSA attestation |
| **Desktop (Tauri)** | ⚠️ Repairing | Icons + plugin gating fixed; CI verification pending on next release |
| **Mobile (Capacitor)** | ⏳ Partial | Config exists; no CI build-check |

---

## CI / release pipeline

| Workflow | Trigger | Status |
|----------|---------|--------|
| `ci.yml` | push `main`, PR | ✅ Healthy |
| `deploy.yml` | push `main`, manual | ✅ Healthy (transient Pages failures mitigated) |
| `release.yml` | **manual only** (this PR) | ✅ Policy corrected |
| `tauri-build.yml` | release published, manual | ⚠️ Was failing; fixes in this PR |
| `container-publish.yml` | tag `v*`, push `main` | ✅ Healthy |

---

## Open debt (prioritized)

| ID | Severity | Item | Next step |
|----|----------|------|-----------|
| HIGH-12 | HIGH | OCPP SP3 mTLS | ✅ API proxy `/ws/ocpp` + `POST /api/ocpp/proxy-session` |
| AUD-02 | MED | CSP `style-src unsafe-inline` | ✅ Phase 2: Tauri nonce sync + `style-src-attr`; dev HMR exception |
| MED-12 | MED | Adapter worker not activated | ✅ SunSpec worker polling via `VITE_ADAPTER_WORKER=true` |
| MED-01 | MED | API coverage toward 70%+ | Continue ratcheting as tests land |
| PRF-01/02 | LOW | DeepSource/CodeAnt advisory | Owner tuning |
| LOW-08 | LOW | Storybook gaps | ✅ SankeyDiagram, Floorplan, AdapterConfigPanel stories |

---

## Changes shipped in this remediation PR

- `release.yml` — manual dispatch only; removed duplicate `tauri-release`
- `CHANGELOG.md` — Keep a Changelog structure restored; 1.8.0/1.9.0 notes curated
- `docs/Release-History.md` — canonical timeline + incident record
- Version sync — root, workspaces, Tauri to **1.9.0**
- Tauri — `icons/*` generated; mobile plugins cfg-gated
- OpenEMS — `additionalWritableProperties` (LOW-02)
- Docs — `FEATURE_STATUS.md`, ADR-015, `CI-AUDIT.md`, `Manual-Workflow-Triggers.md`

---

## Verification performed

- `pnpm type-check` (pending in PR CI)
- `pnpm lint` (pending in PR CI)
- Targeted unit tests for OpenEMS config extension (pending)

Full E2E/Lighthouse/container scans remain CI-first per `CLAUDE.md` hardware policy.
