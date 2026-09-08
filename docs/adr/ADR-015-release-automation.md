# ADR-015: Release automation, version sourcing & the release trigger chain

- **Status:** Accepted (amended 2026-07-03 — manual release dispatch)
- **Date:** 2026-06-30
- **Deciders:** Maintainer

## Context

Releases had stalled: the latest GitHub Release was `v1.1.0` while the code was at
`1.2.0`, and the accumulated post-1.2.0 work was never tagged. Investigation showed
the release pipeline is **semantic-release** (`pnpm release`, config in
`.releaserc.json`) running from `release.yml`. It had been **silently failing** when
triggered automatically on every `main` push:

1. **Branch-protection blocker.** `main` is governed by GitHub **rulesets**
   (`required_signatures`, strict status checks, etc.). semantic-release needs to push
   a `chore(release): … [skip ci]` commit + tag back to `main`. The default
   `GITHUB_TOKEN` cannot satisfy the rulesets, so the push is rejected.
2. **False-green.** The Semantic Release step is `continue-on-error: true`, so the
   `Release` workflow reported **success** while actually doing nothing — masking the
   failure for months.
3. **Broken desktop build.** Independently, `tauri-build.yml` (triggered on
   `release: published`) failed on **every** release because `tauri.conf.json` had an
   invalid `app.title` property (Tauri v2 only allows the title per-window), so no
   desktop binaries were ever attached.
4. **Unwanted auto-releases.** Automatic `push → main` releases created version churn
   (`chore(release): … [skip ci]` commits) without maintainer intent.

## Decision

1. **semantic-release remains available but is manual-only.** `release.yml` triggers
   on `workflow_dispatch` with `approveRelease=RELEASE`. No push-to-`main` trigger.
   Optional **`GH_TOKEN` PAT** (classic `repo` scope or fine-grained Contents
   read/write + ruleset bypass) is still required for semantic-release to push past
   `main` rulesets. Step-by-step: **`docs/Release-GH_TOKEN-Setup.md`**.
2. **Honest reporting.** `release.yml` writes an explicit release-status line to the
   job summary so a no-op run is no longer indistinguishable from a successful release.
3. **Desktop builds** are owned solely by `tauri-build.yml` (on `release: published`
   or manual dispatch). The duplicate `tauri-release` job was removed from `release.yml`.
4. **Version sourcing.** The canonical version is the root `package.json`. Workspace
   packages (`apps/api`, `apps/web`, `packages/shared-types`) and `tauri.conf.json`
   / `Cargo.toml` are kept **in sync** via `.releaserc.json` `@semantic-release/git`
   assets on each release.

## The release trigger chain

```
Actions → Release → approveRelease=RELEASE
        └──► release.yml (semantic-release: bump + CHANGELOG + tag + GitHub Release)
                    │
GitHub Release published ──► tauri-build.yml      (signed desktop binaries → release assets)
tag v* pushed            ──► container-publish.yml (GHCR images + Grype gate + cosign sign)
push to main             ──► deploy.yml              (live demo to GitHub Pages + prune old deployments)
```

`container-publish.yml` and `deploy.yml` are healthy. `release.yml` is **manual**;
`tauri-build.yml` runs when a GitHub Release is published.

## Manual release procedure

### Option A — semantic-release (workflow dispatch)

1. **Actions** → **Release** → **Run workflow** on `main`
2. `approveRelease` = `RELEASE`
3. Ensure `GH_TOKEN` PAT is configured (see `docs/Release-GH_TOKEN-Setup.md`)
4. On success: tag + GitHub Release drive `tauri-build.yml` and `container-publish.yml`

### Option B — fully manual (no semantic-release)

1. `git switch -c chore/release-X.Y.Z origin/main`
2. Bump `version` in root + `apps/{api,web}` + `packages/shared-types` `package.json`
   and `apps/web/src-tauri/tauri.conf.json` + `Cargo.toml`.
3. `CHANGELOG.md`: move `[Unreleased]` → `[X.Y.Z] - <date>`, open a fresh `[Unreleased]`.
4. Open PR, get CI green, squash-merge.
5. `git tag -a vX.Y.Z <merge-sha> -m "…" && git push origin vX.Y.Z`
6. `gh release create vX.Y.Z --notes-file <changelog-section> --verify-tag`
7. Tag + release drive `container-publish.yml` and `tauri-build.yml` automatically.

## Consequences

- No surprise version bumps on every `main` merge.
- Maintainer controls when releases ship via workflow dispatch or manual tags.
- `GH_TOKEN` remains optional for Option A; Option B needs no PAT.
- A future enhancement is a dedicated **Capacitor mobile build-check** workflow
  (`capacitor.config.ts` exists but has no CI); tracked separately.
