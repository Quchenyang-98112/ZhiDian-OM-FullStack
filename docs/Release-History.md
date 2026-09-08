# Release History — Nexus-HEMS-Dash

**Last curated:** 2026-09-02  
**Current release (tag):** `v1.11.1` @ `1716a42`  
**`main` HEAD (unreleased):** `c4e7939` — 15 commits ahead of the tag; see `CHANGELOG.md` `[Unreleased]`  
**Policy:** Manual-only semantic-release (ADR-015 amended 2026-07-03)

This document records the **canonical release timeline**, known anomalies from the automatic-release period, and how to cut future releases correctly.

---

## Canonical tag timeline

| Tag | Date (UTC) | Head commit | Highlights |
|-----|------------|-------------|------------|
| `v1.11.1` | 2026-09-01 | `1716a42` | Post-freeze campaign + master-prompt remediation: SEC-11, deps/CVE, demo chrome, E-STOP tests, CI pins, Command Hub i18n, offline idempotency slice 1 (#329–#341) |
| `v1.11.0` | 2026-07-10 | `—` | Command Palette registry (ADR-028), Settings/Help perfection, page modularization, deep-audit remediation (F-01–F-07, ADR-029 local-LLM deferral), toolchain + Pages-deploy hardening (#270–#313) |
| `v1.10.0` | 2026-07-04 | `7469389` | Post-audit phases 1–8, WS schema hardening, Helm `WS_ORIGINS`, Pages deploy prune, security wave (#236–#268, #269) |
| `v1.9.0` | 2026-07-02 | `4138235` | Read-only banner, `ControlPanel` removal, `ENERGY_UPDATE` Zod validation |
| `v1.8.0` | 2026-07-02 | `1407ad5` | ADR-025 backend WS consumer (`VITE_BACKEND_WS`) |
| `v1.7.0` | 2026-07-02 | `c963a5d` | OpenEMS + OCPP CSMS backend, coverage 78/72/70/80, GH_TOKEN release docs |
| `v1.6.1` | 2026-07-02 | — | Hardware registry 190 devices, HeatPumpAdapter, help/settings audit |
| `v1.6.0` | 2026-07-02 | — | P1 MQTT/Zigbee/Shelly/OCPP adapter enhancements |
| `v1.5.0` | 2026-07-02 | — | EEBUS backend, HA native, ExecAdapter |
| `v1.4.0` | 2026-07-02 | — | LiveEnergyAggregator bridge (HIGH-17), hardware registry UI |
| `v1.3.0` | 2026-06-30 | — | Safety defaults, read-only mode, supply-chain gates |
| `v1.2.0` | 2026-06-30 | — | CI hardening, safety documentation |
| `v1.1.0` | 2026-04-25 | — | Mobile, tariffs, toolchain |
| `v1.0.0` | — | — | Initial public release |

### Unreleased on `main` (post-tag, 2026-09-02)

Commits after `v1.11.1` through `c4e7939` are documented in `CHANGELOG.md` `[Unreleased]`:

- Post-v1.11.1 campaign closeout docs (#342)
- Offline sync slices 2–4 + Stream C Redis (#344, #346, #349, #354)
- Demo i18n + tariff formatter (#353)
- Protocol depth Stream F (#355–#356)
- CI: Node 24 job-level env (#343), SLSA isolation + PR parity (#350), Scorecard publish fix (#351)
- Review quiescence policy (#348), release checkout fix (#347), test coverage (#345)

Cut **`v1.11.2`** (or next patch) only when the maintainer dispatches `release.yml` or tags manually.

---

## 2026-07-02 automatic-release incident (resolved)

Between `v1.7.0` and `v1.9.0`, semantic-release ran on **every `main` push** after `GH_TOKEN` was configured. Effects:

| Problem | Impact | Resolution (2026-07-03) |
|---------|--------|-------------------------|
| Rapid version bumps | Three releases in one evening (`1.7.0` → `1.9.0`) | `release.yml` trigger changed to **manual dispatch only** |
| Empty GitHub Release bodies | `v1.8.0` and `v1.9.0` published with header-only notes | Bodies curated from `CHANGELOG.md`; file structure fixed |
| Malformed `CHANGELOG.md` | semantic-release prepended version blocks **above** `# Changelog` | Restored Keep a Changelog order (header → Unreleased → versions) |
| Version drift | Root `package.json` at `1.9.0` while workspace/Tauri stayed at `1.6.1` | All version fields synced to `1.9.0`; `.releaserc.json` git assets extended |
| Duplicate Tauri CI | `release.yml#tauri-release` + `tauri-build.yml` on `release: published` | `tauri-release` job removed; desktop builds owned by `tauri-build.yml` |
| `chore(release): … [skip ci]` commits | Skipped CI on version bumps | Acceptable for release commits; feature work still gated by PR CI |

---

## 2026-07-03 GitHub Pages 403 (transient, resolved)

An audit observed `https://qnbs.github.io/Nexus-HEMS-Dash/` returning HTTP 403 (101-byte body). Investigation found **no code or configuration fault**: `vite.config.ts` `base` is `/Nexus-HEMS-Dash/`, `.nojekyll` is present at the repo root and in `apps/web/public/` (copied into `dist/`), the Pages source is **GitHub Actions** (`build_type: workflow`, source `main:/`), HTTPS is enforced, and every recent `deploy.yml` run on `main` succeeded. Re-probing returned **HTTP 200** serving the SPA shell. Root cause: the transient "try again later" Pages state after rapid `main` pushes — already mitigated by PR #232's `concurrency` queue + sleep/retry and the `prune-deployments` job. No action required; monitor via `deploy.yml`.

---

## 2026-09-01 release dispatch failure (resolved in workflow)

Manual **Release** dispatch (`workflow_dispatch`, run `33544392686`) failed at **Checkout** with `fatal: could not read Username for 'https://github.com'`. Root cause: `release.yml` passed `secrets.GH_TOKEN || secrets.GITHUB_TOKEN` into `actions/checkout` with `persist-credentials: false`; an **expired or revoked `GH_TOKEN` PAT** prevented the initial fetch even though read-only checkout only needs `GITHUB_TOKEN`.

**Fix:** checkout uses the default `GITHUB_TOKEN`; `GH_TOKEN` is consumed only in the semantic-release push step. **Owner:** rotate or delete a bad `GH_TOKEN` secret, then re-dispatch **Actions → Release** with `approveRelease=RELEASE`. Commits on `main` since `v1.11.1` (`#342`, `#343`) are release-worthy once the workflow succeeds.

---

## How to cut a release (going forward)

### Preferred — manual workflow dispatch

1. Ensure `CHANGELOG.md` `[Unreleased]` is accurate.
2. **Actions → Release → Run workflow** on `main`, `approveRelease=RELEASE`.
3. Verify: new tag, GitHub Release with non-empty body, workspace versions in sync.
4. Downstream: `tauri-build.yml` + `container-publish.yml` trigger on the published release.

> **Note (2026-09-01):** `v1.11.1` was cut via the fully manual tag procedure (`git tag` + `gh release create`) because Cloud Agent tokens cannot dispatch workflows (`403`) and semantic-release would not re-cut an already-bumped `1.11.1` manifest. Use workflow dispatch for the **next** patch when `[Unreleased]` warrants it, or bump to `1.11.2` manually first.

### Fallback — fully manual tags

See **ADR-015 Option B** — bump versions, PR, tag, `gh release create`.

### Pre-release checklist

- [ ] `[Unreleased]` section complete in `CHANGELOG.md`
- [ ] `FEATURE_STATUS.md` / `README.md` version line updated if user-facing claims changed
- [ ] Root + `apps/{api,web}` + `packages/shared-types` + `tauri.conf.json` + `Cargo.toml` versions match
- [ ] No duplicate Tauri build workflows triggered unintentionally
- [ ] `GH_TOKEN` PAT valid (if using semantic-release dispatch)

---

## Related docs

- `docs/adr/ADR-015-release-automation.md` — trigger chain and policy
- `docs/Release-GH_TOKEN-Setup.md` — PAT setup (optional for manual tags)
- `docs/Manual-Workflow-Triggers.md` — workflow dispatch steps
- `CHANGELOG.md` — full per-version notes
