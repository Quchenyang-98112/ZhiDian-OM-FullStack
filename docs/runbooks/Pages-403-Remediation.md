# GitHub Pages 403 Remediation Runbook

**Symptom:** `https://qnbs.github.io/Nexus-HEMS-Dash/` returns **HTTP 403** (not 404) while the Deploy workflow reports success.

**Last verified healthy:** 2026-07-04 — root URL returned HTTP 200 after Deploy run [#28698466590](https://github.com/qnbs/Nexus-HEMS-Dash/actions/runs/28698466590) (`build_type: workflow`).

---

## Quick diagnosis

```bash
# 1. HTTP status from outside GitHub
curl -sI "https://qnbs.github.io/Nexus-HEMS-Dash/" | head -5

# 2. Latest Deploy workflow
GH_PAGER=cat PAGER=cat gh run list --workflow=deploy.yml --limit 3

# 3. Pages configuration (expect build_type=workflow, public=true)
GH_PAGER=cat PAGER=cat gh api repos/qnbs/Nexus-HEMS-Dash/pages

# 4. github-pages environment protection rules
GH_PAGER=cat PAGER=cat gh api repos/qnbs/Nexus-HEMS-Dash/environments/github-pages
```

| HTTP code | Typical cause |
|-----------|---------------|
| **403** | Pages source misconfigured, environment protection blocking deploy, or stale/broken `github-pages` deployment |
| **404** | Artifact missing / wrong `base` path — check `apps/web/vite.config.ts` `base: '/Nexus-HEMS-Dash/'` |
| **200** | Healthy |

A **403 on the site root** with a **green Deploy workflow** almost always points to **repository settings** or **environment protection**, not application code.

---

## Maintainer checklist (copy-paste order)

### A. Pages build source

1. GitHub → **Settings** → **Pages**
2. **Build and deployment → Source** must be **GitHub Actions** (not “Deploy from a branch”).
3. Confirm the site URL shows `https://qnbs.github.io/Nexus-HEMS-Dash/`.

### B. `github-pages` environment

1. GitHub → **Settings** → **Environments** → **github-pages**
2. Review **Deployment branches and tags** — must allow deployments from `main` (or disable overly strict custom policies).
3. Review **Required reviewers** — if enabled, a pending approval blocks publish even when the workflow is green.
4. Check **Deployment protection rules** — remove or relax rules that stall successive publishes.

### C. Re-run deployment

```bash
# Manual deploy (requires typing DEPLOY in the dispatch form)
GH_PAGER=cat PAGER=cat gh workflow run deploy.yml -f approveDeploy=DEPLOY

# Or push an empty commit to main after settings are fixed (only if branch rules allow)
```

### D. Prune stale deployments (if environment is wedged)

The Deploy workflow’s `prune-deployments` job keeps the newest 10 `github-pages` deployments. If pruning fails repeatedly:

```bash
REPO=qnbs/Nexus-HEMS-Dash
ENV=github-pages
GH_PAGER=cat PAGER=cat gh api --paginate "repos/${REPO}/deployments?environment=${ENV}&per_page=100" --jq '.[].id' | head
# Mark old IDs inactive, then delete via API (see deploy.yml prune step)
```

### E. Repository visibility

- **Public** repos: Pages is free at `*.github.io`.
- **Private** repos: GitHub Pages for private repos requires a paid plan; misconfiguration can surface as access errors.

---

## What the workflow already does

`.github/workflows/deploy.yml`:

- Builds `apps/web/dist` with `pnpm build` (`NODE_ENV=production`)
- Uploads via `actions/upload-pages-artifact@v5`
- Deploys with `actions/deploy-pages@v4` to environment `github-pages`
- Prunes stale deployments **before** publish (keeps newest 10)
- **Waits for idle** in a dedicated `wait-for-pages-idle` job (no `environment:` — avoids self-deadlock) via `wait-for-github-pages-idle.sh`; skips when the active deployment is for the current `GITHUB_SHA`; 180 s cooldown + 3 min stale threshold
- Retries up to **three** times with idle-wait between attempts (`reporting_interval: 15s`)
- **`deploy-recovery.yml`** auto-reruns failed Deploy jobs once after a 10 min cooldown when no newer Deploy run exists (`run_attempt < 2`)
- Prunes again after deploy (keeps newest 10)
- Job-level `permissions: pages: write, id-token: write, deployments: read`

No change to `vite.config.ts` `base` is needed when only the root 403s — the Vite base path is already `/Nexus-HEMS-Dash/`.

---

## When to escalate vs fix in code

| Fix in settings | Fix in code |
|-----------------|-------------|
| Source = GitHub Actions | Wrong `base` path (404, not 403) |
| Environment approval/rules | Missing `permissions` on deploy job |
| Stale deployment list | Build artifact path incorrect |
| Repo visibility / org policy | Broken PWA `index.html` (usually 200 with broken assets) |

If all checklist items pass and 403 persists for >30 minutes after a successful deploy, open a GitHub Support ticket with the deployment ID from the `github-pages` environment activity log.

---

## Post-deploy verification (CI)

The Deploy workflow includes a `verify-pages` job that curls the public URL after publish. A failing verify step means the workflow succeeded but the site is not yet publicly reachable — start with sections A–C above.
