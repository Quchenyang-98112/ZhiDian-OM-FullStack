# Manual workflow triggers (maintainer)

Cloud agents may not have `actions:write` to dispatch or rerun workflows. Use the GitHub UI or a PAT with workflow scope.

## Release (semantic-release)

Automatic release on `main` push is **disabled** (ADR-015 amended 2026-07-03).

1. **Actions** → **Release** → **Run workflow**
2. Branch: `main`
3. `approveRelease` = `RELEASE`
4. Requires `GH_TOKEN` PAT (or ruleset bypass) for semantic-release to push the release commit + tag — see `docs/Release-GH_TOKEN-Setup.md`

Fully manual tag-based releases (no semantic-release): see ADR-015 Option B.

## Tauri Desktop Build

Triggered automatically when a **GitHub Release is published**, or manually:

1. **Actions** → **Tauri Desktop Build** → **Run workflow**
2. Branch: `main`
3. Version: current root `package.json` version (without leading `v`, e.g. `1.11.0`)
4. Wait for linux + macos + windows matrix jobs

**macOS signing:** CI defaults to **ad-hoc signing** (unsigned `.app`/`.dmg`) so builds succeed without Apple Developer secrets. For signed + notarized macOS artifacts, set repository variable `MACOS_CODESIGN_ENABLED=true` and configure `APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`, `APPLE_SIGNING_IDENTITY`, `APPLE_ID`, `APPLE_PASSWORD`, `APPLE_TEAM_ID` secrets.

## Deploy (GitHub Pages)

Auto-deploys on every push to `main` (post-green-CI). If deploy fails transiently (`Deployment failed, try again later.`):

1. **Actions** → **Deploy** → **Run workflow**
2. Branch: `main`
3. `approveDeploy` = `DEPLOY`

The workflow retries Pages publish once after 45 s and queues concurrent deploys (`concurrency.cancel-in-progress: false`).

## PR Feedback Summary

Fixed in PR #216 — invalid `github-script` SHA. No manual action needed after merge.
