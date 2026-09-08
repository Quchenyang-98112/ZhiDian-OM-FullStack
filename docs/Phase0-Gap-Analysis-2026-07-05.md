# Phase 0 Gap Analysis — Nexus-HEMS-Dash Post-Audit Perfection

**Date:** 2026-07-05  
**Baseline:** `main` @ `4748342` (after syncing `origin/main`)  
**Scope:** Preparation & verification only; no production code changes.  
**Next decision:** Approve Phase 1 implementation (security patches + stabilization).

---

## 1. Phase 0 Verification Results

All baseline checks passed on the current `main` tip.

| Check | Command | Result | Time |
|-------|---------|--------|------|
| Type-check | `pnpm type-check` | ✅ Pass, 0 errors across shared-types, api, web | 3 m 53 s |
| Lint | `pnpm lint` | ✅ Pass, 0 Biome/ESLint issues | 3 m 34 s |
| Command Palette unit tests | 5 targeted web test files | ✅ 33/33 passed | 1 m 08 s |
| Settings / Help unit tests | 6 targeted web test files | ✅ 38/38 passed | 49 s |
| Adapter / command safety tests | 2 targeted web test files | ✅ 50/50 passed | 21 s |
| Security / crypto tests | 2 targeted web test files | ✅ 21/21 passed | 29 s |
| API protocol / auth / WS tests | 3 targeted api test files | ✅ 58/58 passed | 10 s |
| Web production build | `pnpm --filter @nexus-hems/web build` | ✅ Success; no Rollup errors | 2 m 45 s |

**CI-deferred heavy gates:** `pnpm test:run`, `pnpm test:e2e`, `pnpm test:a11y`, `pnpm lighthouse`, `pnpm size`, security scans. These remain cloud-first per `CLAUDE.md` Hardware Profile & Cloud-First CI Policy.

**Working tree:** Clean after staging baseline documentation updates (`AGENTS.md`, `CLAUDE.md` Biome version sync).

---

## 2. Gap Analysis vs. Master Prompt

### 2.1 Security — Highest Priority

| ID | Finding | Severity | Evidence |
|----|---------|----------|----------|
| SEC-01 | `READ_ONLY_MODE` not enforced on EEBUS mutating routes | **Critical** | `POST /api/eebus/pair`, `POST /api/eebus/pair/pin`, `POST /api/eebus/discover/register`, `DELETE /api/eebus/trust/:ski`, `PUT /api/eebus/tls/revocation` use `requireScope('admin')` but never call `isReadOnlyMode()` |
| SEC-02 | `READ_ONLY_MODE` not enforced on OCPP proxy-session issuance | **Critical** | `POST /api/ocpp/proxy-session` issues a mutating session without read-only guard |
| SEC-03 | `READ_ONLY_MODE` not enforced on OpenADR mutating routes | **Critical** | `POST /api/openadr/events/:eventId/acknowledge`, `POST /api/openadr/reports` lack read-only guard |
| SEC-04 | Command Palette auth scope is hardcoded to `readwrite` | High | `apps/web/src/core/commands/command-context.ts:21` returns `'readwrite'` unconditionally; admin-scope commands are not enforced |
| SEC-05 | Production auth/rate-limit bypass depends entirely on `NODE_ENV` | Medium | `requireJWT` and `requireScope` are no-ops when `NODE_ENV !== 'production'`; no runtime guard against misconfigured prod deployments |

**Root cause:** Read-only enforcement was added iteratively to WebSocket commands, Modbus routes, and proxy WebSockets, but several newer REST routes (EEBUS pairing, OCPP proxy setup, OpenADR reporting) were missed.

### 2.2 Command Palette

| ID | Finding | Severity | Evidence |
|----|---------|----------|----------|
| PAL-01 | No Home/End/PageUp/PageDown keyboard navigation | Low | `useCommandPaletteController.ts` handles arrow keys only |
| PAL-02 | Disabled commands do not surface a reason | Low | `CommandPaletteItem.tsx` applies opacity/cursor but no visible explanation |
| PAL-03 | `system.toggleFavorite` is a dead placeholder | Low | Registered with `when: () => false`; favorites feature not wired |
| PAL-04 | Doc drift: N3 marked partial despite Phase 5a shipped | Medium | `docs/Settings-Help-Perfection-Plan-2026-07-05.md` line 86 still says "in progress" |

**Note:** The exploration summary initially flagged "silent error swallowing" in `invokeAsyncCommand`. Verification showed `command-executor.ts:55` does catch and toast errors, so this specific risk is already mitigated. The remaining concern is whether async command rejections propagate correctly from `BaseAdapter.sendCommand` through the registry — targeted tests pass, but a dedicated palette E2E for hardware confirmation is still absent.

### 2.3 Settings & Help System

| ID | Finding | Severity | Evidence |
|----|---------|----------|----------|
| SET-01 | Decentralized read-only enforcement | Medium | Each tab self-checks `useReadOnlyModeActive`; no higher-order wrapper guarantees new tabs are gated |
| SET-02 | German inline fallback strings in `AdvancedTab.tsx` | Low | `t('settings.shortcutsReference', 'Tastaturkürzel-Referenz')`, `t('help.shortcutCmdK', 'Befehlspalette öffnen')` violate AGENTS.md language policy (English inline fallbacks only) |
| SET-03 | Adapter panel shows no inline field-level validation | Medium | `adapter-config-panel-save.ts` validates and toasts on failure, but fields do not display per-field errors |
| SET-04 | Settings/Help perfection plan baseline is stale | Medium | Document references `e1ecd19` and "Phase 4 merged"; current `main` is `4748342` with Phase 5a shipped |

### 2.4 Adapter System

| ID | Finding | Severity | Evidence |
|----|---------|----------|----------|
| ADP-01 | Several contrib backends are MVP/read-only | Medium | Matter, Zigbee2MQTT, Home Assistant MQTT, OpenADR are partial per `FEATURE_STATUS.md` |
| ADP-02 | No centralized backend adapter lifecycle supervisor | Medium | Adapters are started once; failures are caught but not centrally restarted |
| ADP-03 | `energy-controllers.ts:107` hardcodes `maxChargePower = 10000` | Low | `// TODO: from device registry` remains |

### 2.5 Documentation Drift

| Document | Issue |
|----------|-------|
| `docs/Settings-Help-Perfection-Plan-2026-07-05.md` | Baseline commit `e1ecd19` and "Phase 4 merged" are outdated; N3 should be ✅ shipped |
| `docs/Security-Architecture.md` | Does not document `READ_ONLY_MODE` application-level safety feature (only mentions read-only filesystem in Docker context) |
| `.env.example` | Missing `READ_ONLY_MODE`, `EXEC_SCRIPTS_CONFIG`, `MATTER_BRIDGE_HOST`, `Z2M_BROKER_URL`, `OPENEMS_EVCS_CTRL_ID`, `OPENEMS_ESS_CTRL_ID`, `OPENEMS_PEAK_SHAVING_CTRL_ID`, `OPENEMS_HP_SGREADY_CTRL_ID` |
| `FEATURE_STATUS.md` | Backend statuses for HA MQTT, Matter, Zigbee2MQTT, OpenADR are accurate as ⚠️ Partial; no change needed |

---

## 3. Risk Register

| ID | Risk | Likelihood | Impact | Proposed Owner |
|----|------|------------|--------|----------------|
| R1 | READ_ONLY_MODE bypass allows hardware control in read-only deployments | High | **Critical** | Phase 1.1 (first PR) |
| R2 | Admin-scope commands executed by readwrite users via palette | High | High | Phase 1.2 |
| R3 | New settings tab forgets read-only gating | Medium | High | Phase 1.3 (centralize) |
| R4 | Docs misrepresent shipped features | High | Medium | Phase 1.4 |
| R5 | Adapter save failure leaves user without actionable feedback | Medium | Medium | Phase 1.3 |
| R6 | German fallback strings violate project language policy | Certain | Low | Phase 1.3 |

---

## 4. Proposed Phase 1 Scope

Phase 1 is limited to **critical stabilization and security re-verification** only. It deliberately defers adapter backend completion (Phase 2), coverage expansion (Phase 3), and strategic enhancements (Phase 5).

### 4.1 Phase 1.1 — Security patches (merge first)

- Add `READ_ONLY_MODE` guards to all unguarded mutating routes:
  - EEBUS: `pair`, `pair/pin`, `discover/register`, `trust/:ski`, `tls/revocation`
  - OCPP: `proxy-session`
  - OpenADR: `events/:eventId/acknowledge`, `reports`
- Add unit tests mirroring `tests/modbus.routes.test.ts` and `tests/proxy-readonly-guard.test.ts` patterns.
- Add production-shaped env warning when auth/rate-limit bypass is active.

### 4.2 Phase 1.2 — Command Palette hardening

- Wire real auth scope resolution in `command-context.ts` (read from JWT/decode when available; keep `readwrite` fallback for anonymous dev).
- Add Home/End/PageUp/PageDown keyboard handlers.
- Surface disabled reason for `aria-disabled` palette items.
- Remove or wire `system.toggleFavorite` placeholder.
- Update N3 status in `docs/Settings-Help-Perfection-Plan-2026-07-05.md`.

### 4.3 Phase 1.3 — Settings / Help polish

- Introduce `withReadOnlyGate` HOC or hook wrapper for settings controls.
- Replace German inline fallbacks in `AdvancedTab.tsx` with English fallbacks.
- Add inline field-level error display in adapter config save pipeline.

### 4.4 Phase 1.4 — Documentation truth-sync

- Update `docs/Settings-Help-Perfection-Plan-2026-07-05.md` baseline and N3.
- Add `READ_ONLY_MODE` section to `docs/Security-Architecture.md`.
- Update `.env.example` with missing variables.
- Update `CHANGELOG.md` and `docs/Technical-Debt-Registry.md`.

### 4.5 Phase 1.5 — Verification

- `pnpm type-check` → `pnpm lint` → targeted tests.
- Push branch, open PR, monitor CI for full `test:run`, E2E, security scans.

---

## 5. Go / No-Go Recommendation

**Recommendation: GO for Phase 1.**

Rationale:
- Baseline verification is green.
- The highest-risk finding (R1) is a clear, bounded set of route-level guard additions with existing test patterns to follow.
- All Phase 1 items are small, reviewable diffs that align with the master prompt's "incremental, reviewable changes" rule.

**Required human decision:** Approve Phase 1.1 as the first implementation PR, or reprioritize items.
