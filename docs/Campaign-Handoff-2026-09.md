# Campaign Handoff — Post-v1.11.0 Freeze (Sep 2026)

> **Status:** Phase 1–4 complete on `main`; Stream F protocol depth shipped (#355–#356); release line deferred (HEAD ahead of tag)  
> **Snapshot:** `main` @ `c4e7939` — tag `v1.11.1` @ `1716a42` (2026-09-01)  
> **Purpose:** Closeout record for the Sep 2026 operational campaign after a 53-day product freeze, plus the post-freeze master-prompt remediation and CI/offline-sync/protocol-depth waves.

---

## Context

Between **2026-07-10** (v1.11.0 ship) and **2026-09-01**, no product commits landed on `main`.
Operational rot accumulated: stale Dependabot Action pin PRs, demo chrome misreporting mock mode as
"connected", docs drift from enforced CI gates, missing E-STOP regression coverage, unset-`NODE_ENV`
auth fail-open, and high-severity dependency/CVE findings.

---

## Phase 1 — Sep campaign PRs (merged 2026-09-01)

| PR | Branch | Scope |
| --- | --- | --- |
| [#336](https://github.com/qnbs/Nexus-HEMS-Dash/pull/336) | `cursor/deps-audit-high-cve-sep2026-988d` | Production deps audit + Docker CVE remediation |
| [#329](https://github.com/qnbs/Nexus-HEMS-Dash/pull/329) | `cursor/ci-bump-github-actions-sep2026-988d` | GitHub Actions pin alignment (supersedes #323–#327) |
| [#332](https://github.com/qnbs/Nexus-HEMS-Dash/pull/332) | `cursor/fix-pages-demo-chrome-988d` | Demo chrome honesty (`resolveConnectionPresentation`) |
| [#334](https://github.com/qnbs/Nexus-HEMS-Dash/pull/334) | `cursor/docs-truth-sync-sep2026-988d` | Docs / debt registry truth-sync |
| [#335](https://github.com/qnbs/Nexus-HEMS-Dash/pull/335) | `cursor/p1-emergency-stop-test-988d` | EmergencyStop async test stabilization |
| [#333](https://github.com/qnbs/Nexus-HEMS-Dash/pull/333) | `cursor/sec-11-node-env-fail-closed-3e8d` | SEC-11 `NODE_ENV` fail-closed auth |
| [#337](https://github.com/qnbs/Nexus-HEMS-Dash/pull/337) | — | Campaign closeout docs + OPS-FREEZE-01 resolved |

---

## Phase 2 — Master-prompt remediation (merged 2026-09-01, in tag `v1.11.1`)

| PR | Scope |
| --- | --- |
| [#338](https://github.com/qnbs/Nexus-HEMS-Dash/pull/338) | `v1.11.1` version sync across manifests + CHANGELOG |
| [#339](https://github.com/qnbs/Nexus-HEMS-Dash/pull/339) | Post-release docs truth-sync (Perfection-Roadmap, Offline-Sync status) |
| [#340](https://github.com/qnbs/Nexus-HEMS-Dash/pull/340) | Command Hub i18n completion + single Simulation badge + header price pill |
| [#341](https://github.com/qnbs/Nexus-HEMS-Dash/pull/341) | Offline command idempotency slice 1 (Modbus write + mock WS dedupe) |

**Release:** [`v1.11.1`](https://github.com/qnbs/Nexus-HEMS-Dash/releases/tag/v1.11.1) tagged at `1716a42` (2026-09-01).

---

## Phase 3 — Post-tag work on `main` (unreleased as of 2026-09-02)

| PR | Scope |
| --- | --- |
| [#342](https://github.com/qnbs/Nexus-HEMS-Dash/pull/342) | Post-v1.11.1 campaign closeout docs |
| [#343](https://github.com/qnbs/Nexus-HEMS-Dash/pull/343) | Node 24 Actions runner on remaining workflows + coverage restore |
| [#344](https://github.com/qnbs/Nexus-HEMS-Dash/pull/344) | Offline sync slice 2 — `/api/sync/version`, JWT/TTL replay guards |
| [#345](https://github.com/qnbs/Nexus-HEMS-Dash/pull/345) | Tests: CO2 PDF export + ai-keys error paths |
| [#346](https://github.com/qnbs/Nexus-HEMS-Dash/pull/346) | Offline sync slice 3 — conflict banner + resolution UI |
| [#347](https://github.com/qnbs/Nexus-HEMS-Dash/pull/347) | Release checkout uses `GITHUB_TOKEN`; CodeAnt still pending |
| [#348](https://github.com/qnbs/Nexus-HEMS-Dash/pull/348) | Mandatory PR review quiescence policy |
| [#349](https://github.com/qnbs/Nexus-HEMS-Dash/pull/349) | Offline sync slice 4 — `/api/sync/diff`, settings PUT, server-wins + E2E |
| [#350](https://github.com/qnbs/Nexus-HEMS-Dash/pull/350) | Isolate SLSA attestation; PR/main parity; retry 403s |
| [#351](https://github.com/qnbs/Nexus-HEMS-Dash/pull/351) | Scorecard job must not define `env` when `publish_results` is on |

**HEAD:** `c4e7939` — **15 commits ahead of `v1.11.1`**. Do not claim `v1.11.1 == main`.

---

## Phase 4 — Protocol depth Stream F (merged 2026-09-02)

| PR | Scope |
| --- | --- |
| [#355](https://github.com/qnbs/Nexus-HEMS-Dash/pull/355) | SG Ready closed loop, OpenADR DR→hardware, Matter/Zigbee/HA/HeatPump backend commands, E2E specs |
| [#356](https://github.com/qnbs/Nexus-HEMS-Dash/pull/356) | Review follow-ups: HA `handled:false`, Matter node guard, Zigbee finite checks, OpenADR timeout + aggregate dispatch |

**Deferred (tracked in debt registry):** OpenADR limit release after event expiry; external VTN webhook auth for production VTN push; HeatPump Modbus write serialization vs polling.

---

## Housekeeping

- **History dedup:** Direct push (`0006a56`) preceded an empty PR squash commit (`e49b0c0`); force-pushed `main` to keep the substantive commit only.
- **Dependabot:** PRs #323–#327 closed (superseded by #329).
- **Stale remote branches:** Merged `cursor/*-988d` campaign branches deleted on merge.
- **Docs:** `FEATURE_STATUS.md`, `Technical-Debt-Registry.md` (OPS-FREEZE-01 → resolved), `CHANGELOG.md` `[1.11.1]`.

---

## Verification

CI on `main` after Phase 4: lint, type-check, unit tests (coverage ≥72% branches), build + size-limit, smoke-prod, SLSA attestation (isolated job), E2E (18 specs), fuzz, Scorecard publish — all green on `c4e7939`.

---

## What remains (not in Phases 1–4)

- **SUPPLY-02** — Grype exception review due **2026-09-29**.
- **PRF-02 / PRF-06** — CodeAnt GitHub App install + `GH_TOKEN` rotation (maintainer-only).
- **OpenADR production residuals** — DR limit release on event expiry; external VTN webhook authentication model.
- **Matter/Zigbee/HA backend** — move from ⚠️ Phase 2 to full parity (device discovery, write ack, multi-device routing).
