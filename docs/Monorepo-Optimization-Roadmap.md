# Monorepo Optimization Roadmap

**Project:** Nexus-HEMS-Dash
**Status:** In Progress
**Last Updated:** 2026-04-25
**Author:** Engineering / Copilot Agent

---

## Executive Summary

The Turborepo monorepo migration (completed 2026-04-24) established a stable, functional
foundation. A comprehensive post-migration audit (2026-04-25) identified **11 concrete
issues** across three priority tiers — none of which break the current operational state,
but all of which represent correctness gaps, latent failure modes, or missed optimizations
that will surface as the project scales.

Three findings are **critical (P0)** in that they will cause silent failures under
specific conditions (Turbo Remote Cache activation, Docker API deployment, missing CI
artifact cache). The remaining findings are important performance and correctness
improvements.

**All 11 findings have been remediated in commit following this document.**

---

## Audit Findings

### P0 — Critical (addressed immediately)

#### F-01 · `turbo.json` `web#build` missing `env: ["VITE_E2E_TESTING"]`

| Field | Value |
|-------|-------|
| **Severity** | P0 — Latent E2E breaker |
| **File** | `turbo.json` |
| **Status** | ✅ Fixed |

**Root cause:** Turbo computes a cache key for `web#build` using source inputs but
*not* environment variables unless explicitly listed under `env:`. When Turbo Remote
Cache is active (or when a developer has a local cache hit), the E2E job receives a
cached build artifact that was produced *without* `VITE_E2E_TESTING=true`. The
`window.__NEXUS_STORE__` handle is absent in that build, causing the OCPP charging
Sankey E2E test to crash.

**Fix:** Added `"env": ["VITE_E2E_TESTING"]` to the `web#build` task in `turbo.json`.
Turbo now includes the env var value in the cache key — a build with
`VITE_E2E_TESTING=true` and one without are treated as distinct artifacts.

---

#### F-02 · `Dockerfile.server` fundamentally broken for monorepo

| Field | Value |
|-------|-------|
| **Severity** | P0 — Docker API image non-functional |
| **File** | `Dockerfile.server` |
| **Status** | ✅ Fixed |

**Root cause (multiple sub-issues):**

1. **Non-existent tsconfig:** Build stage called `pnpm exec tsc --project tsconfig.server.json`,
   but `tsconfig.server.json` was never created. The file does not exist in the repository.
   Docker build would fail immediately at this step.

2. **Missing workspace manifests:** The build stage only copied root-level `package.json`
   and `pnpm-lock.yaml`. It omitted `pnpm-workspace.yaml`, `apps/api/package.json`, and
   `packages/shared-types/package.json`. `pnpm install` without these files cannot
   resolve workspace packages, causing install to fail.

3. **Wrong compiled output path:** CMD referenced `dist-server/server.js` — a path that
   is never created. `apps/api/tsconfig.json` outputs to `apps/api/dist/` (outDir `dist`,
   rootDir `.`), which means the compiled entry would be at `dist/index.js`. But this
   is moot given issue 4.

4. **Runtime incompatibility with shared-types:** `packages/shared-types` is designed
   with `"noEmit": true` and `"allowImportingTsExtensions": true` — it never compiles to
   JavaScript. Its package.json exports only TypeScript source (`./src/index.ts`).
   A plain `node dist/index.js` would fail at runtime when Node.js encounters
   `import from '@nexus-hems/shared-types'` resolving to a `.ts` file.

**Fix:** Complete rewrite using `pnpm deploy` + `tsx` runtime:
- Build stage copies all workspace manifests, installs deps correctly, uses
  `pnpm deploy --filter @nexus-hems/api --prod /tmp/api-deploy` to create a
  self-contained production bundle with resolved workspace deps.
- `tsx` moved from `devDependencies` to `dependencies` in `apps/api/package.json`
  so it is included in the production deployment.
- `packages/shared-types/src/` is available in the deployed node_modules via pnpm
  workspace resolution — `tsx` handles TypeScript source natively at runtime.
- CMD updated to `["node_modules/.bin/tsx", "index.ts"]`.

---

#### F-03 · `perf-optimized-ci.yml` install job never saves cache

| Field | Value |
|-------|-------|
| **Severity** | P0 — Cache strategy entirely ineffective |
| **File** | `.github/workflows/perf-optimized-ci.yml` |
| **Status** | ✅ Fixed |

**Root cause:** The `install` job runs `pnpm install --frozen-lockfile` but has no
`actions/cache/save` step. The workflow header comment claims a "25-40s savings per job
× 4 jobs" from node_modules caching, but the cache is *never written*. All downstream
jobs (lint, test, build, e2e) hit `actions/cache/restore` with a guaranteed MISS every
run, then re-install from scratch. The entire caching optimization described in the
file header is rendered a no-op.

**Fix:** Added `actions/cache/save` step at the end of the `install` job with the
same key used by all downstream `cache/restore` calls:
`deps-${{ runner.os }}-node${{ env.NODE_VERSION }}-${{ hashFiles('pnpm-lock.yaml') }}`.

---

### P1 — Important (addressed in this batch)

#### F-04 · `pnpm-workspace.yaml` missing 2026 best-practice config

| Field | Value |
|-------|-------|
| **Severity** | P1 — Suboptimal monorepo tooling |
| **File** | `pnpm-workspace.yaml` |
| **Status** | ✅ Fixed |

**Root cause:** `pnpm-workspace.yaml` contained only the `packages:` list (2 lines).
Missing: `catalog:` section for centralized dependency version management,
`sharedWorkspaceLockfile: true` for consistency, and `preferWorkspacePackages: true`
for correct workspace resolution.

**Fix:** Extended with full `catalog:` section (8 shared dependencies: `react`,
`react-dom`, `zod`, `typescript`, `jose`, `mqtt`, `tsx`, `@types/node`) plus
workspace behavior flags. All three `package.json` files migrated to use
`"catalog:"` protocol for catalog-managed deps.

---

#### F-05 · `.npmrc` missing monorepo-specific flags

| Field | Value |
|-------|-------|
| **Severity** | P1 — Missing performance/correctness config |
| **File** | `.npmrc` |
| **Status** | ✅ Fixed |

**Root cause:** `.npmrc` was configured for general project settings but lacked
workspace-specific flags: `prefer-workspace-packages=true` (resolves workspace
packages before registry), `hoist-pattern=*` and `public-hoist-pattern=*` (ensures
cross-workspace hoisting works correctly with native addons and binaries).

**Fix:** Added three flags under a new "Monorepo Performance & Correctness" section.

---

#### F-06 · `package.json` root `format:check` script incorrect

| Field | Value |
|-------|-------|
| **Severity** | P1 — CI check has wrong semantics |
| **File** | `package.json` (root) |
| **Status** | ✅ Fixed |

**Root cause:** The previous root `format:check` script used `biome format --write=false`,
but Biome 2.5 rejects that flag/value combination with the message
`false is not expected in this context`. In this repo version, `biome format apps/ packages/` is the compatible
read-only formatter invocation.

**Fix:** Changed to `"biome format apps/ packages/"`.

---

#### F-07 · Turbo Remote Cache not configured

| Field | Value |
|-------|-------|
| **Severity** | P1 — Largest single CI speed improvement not utilized |
| **File** | `.github/workflows/perf-optimized-ci.yml`, `ci.yml` |
| **Status** | ✅ Fixed |

**Root cause:** Neither workflow passes `TURBO_TOKEN` or `TURBO_TEAM` environment
variables to jobs that invoke Turbo. Without these, Turbo only uses local per-job
filesystem cache (no cross-job or cross-run sharing). Remote Cache (Vercel/Turbo Cloud,
free for open-source) would share compiled outputs across all CI runners and runs.

**Fix:** Added optional `TURBO_TOKEN` and `TURBO_TEAM` env vars from GitHub Secrets
to all Turbo-invoking jobs in both workflows. These are gracefully ignored when secrets
are not configured. To activate: set `TURBO_TOKEN` and `TURBO_TEAM` secrets in
GitHub → Settings → Secrets (run `pnpm turbo login && pnpm turbo link` once locally).

---

#### F-08 · `ci.yml` duplicate type-check steps

| Field | Value |
|-------|-------|
| **Severity** | P1 — Wastes ~4 min CI time |
| **File** | `.github/workflows/ci.yml` |
| **Status** | ✅ Fixed |

**Root cause:** The `lint-typecheck` job ran both `pnpm typecheck` (alias) and
`pnpm type-check` (same alias, both delegate to `turbo type-check`), adding ~4 minutes
of redundant type-checking. The comment "tsgo — primary gate" referenced a future tool
(`@typescript/native-preview` tsgo) not yet integrated as the primary gate.

**Fix:** Removed the duplicate step. Single `pnpm type-check` remains with a
clarifying comment about the upcoming tsgo integration path.

---

### P2 — Maintenance (addressed in this batch)

#### F-09 · `Dockerfile` builds entire monorepo instead of frontend only

| Field | Value |
|-------|-------|
| **Severity** | P2 — Unnecessary build surface in frontend image |
| **File** | `Dockerfile` |
| **Status** | ✅ Fixed |

**Root cause:** `RUN pnpm build` invokes `turbo build` which compiles all packages
including `apps/api`. The frontend Docker image only needs `apps/web/dist/`. Building
the API in the frontend image wastes ~20-30s of build time and increases attack surface.

**Fix:** Changed to `RUN pnpm --filter @nexus-hems/web build` (Turbo still resolves
the `shared-types#build` dependency transitively via `dependsOn: ["^build"]`).

---

#### F-10 · Pnpm catalog not utilized (shared dep versions scattered)

| Field | Value |
|-------|-------|
| **Severity** | P2 — Maintenance overhead for version bumps |
| **File** | `pnpm-workspace.yaml`, all `package.json` files |
| **Status** | ✅ Fixed |

**Root cause:** `zod` appears in 3 packages, `typescript` in 3, `jose` in 2, `mqtt`
in 2, `tsx` in 2, `@types/node` in 2, `react`/`react-dom` in 1 (but cross-cutting).
Without a catalog, version upgrades require editing N files instead of 1.

**Fix:** 8 entries added to the default `catalog:` in `pnpm-workspace.yaml`. All
occurrences in package.json files replaced with `"catalog:"` protocol. Single source
of truth for shared dependency versions.

---

#### F-11 · `docker-compose.yml` service label version mismatch

| Field | Value |
|-------|-------|
| **Severity** | P2 — Minor operational confusion |
| **File** | `docker-compose.yml` |
| **Status** | ✅ Fixed |

**Root cause:** `com.nexus-hems.version=4.2.0` label on the `nexus-hems` service
was a leftover from pre-migration versioning. Current `package.json` version is
`1.1.0`.

**Fix:** Updated label to `version=1.1.0`.

---

## Dependency Architecture Decision

### Why `tsx` as API Production Runtime

`packages/shared-types` uses `"noEmit": true` + `"allowImportingTsExtensions": true`
in its TypeScript config. It exports only TypeScript source (no compiled JS artifacts).
This is intentional — the frontend (Vite) and test runners (Vitest/Playwright) consume
it natively. For the API however, this creates a runtime incompatibility with `tsc`-
compiled output: `node dist/index.js` would fail when Node.js encounters the
`import from '@nexus-hems/shared-types'` resolving to `.ts` source.

Options evaluated:

| Option | Pros | Cons | Decision |
|--------|------|------|----------|
| Compile shared-types to JS | Clean production binary | Requires arch change to shared-types; loses unified TS-source pattern | Rejected |
| Use `node --experimental-strip-types` | No extra dep; Node 24 native | Experimental flag; limited syntax support (no decorators, no transforms) | Rejected |
| Bundle API with esbuild/tsup | Single-file, optimized | New tooling dep; added complexity | Future option |
| **tsx runtime** | Simple; handles TS natively; already a devDep | Slightly larger image; tsx startup overhead ~50ms | **Selected** |

**Rationale:** `tsx` provides a clean, stable production runtime for TypeScript. Used
by hundreds of production Node.js services. Adding 1 production dependency is a
reasonable tradeoff vs. changing the shared-types architecture (which impacts all
consumers). When this project grows and API performance becomes critical, migrating
to a bundled approach (tsup/esbuild) is the natural next step.

---

## pnpm Catalog Migration

### Catalog Entries (pnpm-workspace.yaml)

```yaml
catalog:
  react: ^19.0.0
  react-dom: ^19.0.0
  zod: ^4.3.6
  typescript: ~5.8.2
  jose: ^6.2.1
  mqtt: ^5.12.2
  tsx: ^4.21.0
  "@types/node": ^24.0.0
```

### Migration Map

| Dependency | `apps/web` | `apps/api` | `shared-types` |
|-----------|-----------|-----------|----------------|
| `react` | deps ✅ | — | — |
| `react-dom` | deps ✅ | — | — |
| `zod` | deps ✅ | deps ✅ | deps ✅ |
| `typescript` | devDeps ✅ | devDeps ✅ | devDeps ✅ |
| `jose` | deps ✅ | deps ✅ | — |
| `mqtt` | deps ✅ | deps ✅ | — |
| `tsx` | devDeps ✅ | **deps** ✅ (moved from devDeps) | — |
| `@types/node` | devDeps ✅ | devDeps ✅ | — |

---

## Turbo Remote Cache Setup Guide

Turbo Remote Cache (free for open-source via Vercel) caches compilation outputs
across CI runs and developers. Expected impact: 40-70% faster CI after first run.

### One-time Setup

```bash
# 1. Login to Vercel/Turbo (creates ~/.turbo/config.json)
pnpm turbo login

# 2. Link this repository to a Turbo team/org
pnpm turbo link

# 3. Add secrets to GitHub
#    GitHub → Repository → Settings → Secrets and variables → Actions
#    Add: TURBO_TOKEN  (from ~/.turbo/config.json or Vercel dashboard)
#    Add: TURBO_TEAM   (your Vercel org slug, e.g. "my-team")
```

### How it works

Once the secrets are set, all CI jobs in both `ci.yml` and `perf-optimized-ci.yml`
pass `TURBO_TOKEN` and `TURBO_TEAM` automatically. Turbo uploads task outputs to the
remote cache after completion and downloads them on cache hits. The `web#build` task
with `env: ["VITE_E2E_TESTING"]` ensures E2E builds (with `VITE_E2E_TESTING=true`)
and regular builds (without) are cached separately.

---

## Future Roadmap

### Near-term (next sprint)

- **`packages/adapters/*`:** Extract the 13 protocol adapters from `apps/web/src/core/adapters/`
  into a dedicated workspace package. This enables:
  - Independent versioning and testing of each adapter
  - Potential open-source publishing of contrib adapters
  - Cleaner import paths: `@nexus-hems/adapters/victron-mqtt`

- **API bundling (tsup):** Replace `tsx` runtime with a `tsup`-bundled single-file
  output. Eliminates the tsx startup overhead and produces a self-contained binary
  with no TypeScript resolution at runtime. Requires updating shared-types exports
  or inlining shared-types source.

### Medium-term

- **Turbo Remote Cache + Vercel deployment:** Once Turbo Remote Cache is active,
  consider deploying the API to Vercel serverless functions alongside the SPA.

- **Docker image registry (GHCR):** Push versioned Docker images to GitHub Container
  Registry via release workflow. Multi-arch images (linux/amd64 + linux/arm64).

- **Helm values auto-update:** Use semantic-release to update `helm/nexus-hems/Chart.yaml`
  `appVersion` on each release.

### Long-term

- **`packages/shared-types` JS exports:** If the API needs a compiled binary (no tsx),
  add a proper `build` step to shared-types that emits JS alongside TS source, with
  conditional exports (`"import": "./dist/index.js"`, `"types": "./src/index.ts"`).

- **Turborepo workspace boundary enforcement:** Add `boundary:strict` to turbo.json
  once Turborepo stabilizes the workspace boundary feature — prevents accidental
  cross-package imports that bypass the public API.

---

## CI Architecture Overview

```
ci.yml (primary — sequential gate)
  lint-typecheck → unit-tests → build → e2e-tests → docker-build
  └─ ci-passed depends on: [lint-typecheck, unit-tests, build]
     (e2e is informational in ci.yml, not a hard gate for ci-passed)

perf-optimized-ci.yml (optimized — parallel fan-out)
  install
    ├── lint        ─┐
    ├── test         ├── build ─┬── e2e
    └── security    ─┘         └── docker
                                        └─ ci-passed (gates on ALL: lint, test, build, e2e, docker, security)
```

**Critical difference:** `perf-optimized-ci.yml`'s `ci-passed` is a hard gate on E2E.
When E2E fails there, the `✅ CI Passed` check for branch protection also fails.
This is why F-03 (cache save bug) causing slower E2E directly delayed CI feedback.

---

## Files Changed in This Optimization Batch

| File | Change Type | Finding(s) |
|------|-------------|-----------|
| `turbo.json` | Modified | F-01 |
| `pnpm-workspace.yaml` | Extended | F-04, F-10 |
| `.npmrc` | Extended | F-05 |
| `package.json` (root) | Modified | F-06 |
| `apps/web/package.json` | Modified | F-10 |
| `apps/api/package.json` | Modified | F-02 (tsx→dep), F-10 |
| `packages/shared-types/package.json` | Modified | F-10 |
| `Dockerfile` | Modified | F-09 |
| `Dockerfile.server` | Rewritten | F-02 |
| `docker-compose.yml` | Modified | F-11 |
| `.github/workflows/ci.yml` | Modified | F-07, F-08 |
| `.github/workflows/perf-optimized-ci.yml` | Modified | F-03, F-07 |
| `docs/Monorepo-Optimization-Roadmap.md` | Created | — |
