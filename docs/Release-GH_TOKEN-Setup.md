# GH_TOKEN — semantic-release Setup for Protected `main`

**Related:** ADR-015 (`docs/adr/ADR-015-release-automation.md`), `.github/workflows/release.yml`

> **Note (2026-07-03):** Releases are **manual-only**. Run **Actions → Release → Run workflow**
> with `approveRelease=RELEASE`. Automatic release on every `main` push is disabled.

semantic-release must push a `chore(release): … [skip ci]` commit **and** a version tag back to `main`. The default `GITHUB_TOKEN` cannot bypass repository rulesets on `main`, so releases stall without a PAT or ruleset bypass.

## Option A — Classic PAT (simplest, matches ADR-015)

1. GitHub → **Settings** (your user) → **Developer settings** → **Personal access tokens** → **Tokens (classic)** → **Generate new token (classic)**.
2. **Note:** `Nexus-HEMS-Dash semantic-release`
3. **Expiration:** 90 days or custom (set a calendar reminder to rotate).
4. **Scopes** (minimum):
   | Scope | Why |
   |-------|-----|
   | **`repo`** | Push release commits + tags to `main`, read repo metadata |

5. Copy the token (shown once).
6. Repository **qnbs/Nexus-HEMS-Dash** → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**:
   - **Name:** `GH_TOKEN` (exact spelling — `release.yml` uses it only in the semantic-release step for push/tag)
   - **Value:** paste the PAT

   > **Checkout vs push:** `release.yml` fetches the repo with the default `GITHUB_TOKEN`. If `GH_TOKEN` is expired or revoked, checkout still succeeds; only the semantic-release push step fails. Rotate or delete a bad `GH_TOKEN` secret if you see `could not read Username for 'https://github.com'` on an old workflow revision that passed `GH_TOKEN` into checkout.

7. **Ruleset bypass (required if push still fails):**
   - Repo → **Settings** → **Rules** → **Rulesets** → open the `main` ruleset
   - **Bypass list** → add the **GitHub user** that owns the PAT
   - Ensure bypass allows **push**

8. Trigger: **Actions → Release → Run workflow** with `approveRelease=RELEASE` on `main`.

## Option B — Fine-grained PAT (GitHub recommended)

Same as Option A in ADR-015; save as repository secret **`GH_TOKEN`**.

## Option C — Ruleset bypass for `github-actions[bot]` (no PAT)

Add **`github-actions[bot]`** to the ruleset bypass list with push permission.

## Verify

```bash
GH_PAGER=cat PAGER=cat gh workflow run release.yml --ref main -f approveRelease=RELEASE
GH_PAGER=cat PAGER=cat gh run list --workflow=release.yml --limit 3
git fetch --tags origin && git tag --sort=-creatordate | head -3
```

## Security notes

- Never commit the PAT to the repo or log it in CI output.
- Rotate on expiry; revoke immediately if leaked.
- `GH_TOKEN` is only consumed by `release.yml` — other workflows continue using `GITHUB_TOKEN`.
