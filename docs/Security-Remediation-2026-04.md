# Security Remediation 2026-04

## Scope

This document records the current remediation wave for the main-branch security findings and open dependency PRs that were reviewed on 2026-04-13.

The live GitHub code-scanning REST endpoint could not be queried from this environment because the active integration lacks permission for `code-scanning` API access. The remediation below therefore uses:

- the open-alert list supplied in the task request
- the current repository state on `main`
- local dependency audit, TypeScript, unit-test, and build verification

## Remediated In Code

### CodeQL: Remote Property Injection (`OpenEMSAdapter.ts`)

Addressed in [apps/web/src/core/adapters/OpenEMSAdapter.ts](apps/web/src/core/adapters/OpenEMSAdapter.ts).

Changes:

- all write commands now flow through `updateSafeComponentConfig()`
- writable properties are constrained by explicit allowlists per controller/device class
- allowlist resolution now requires discovered component metadata and matching `factoryId`/`factoryPrefix`
- unknown or mismatched controller IDs are rejected before RPC dispatch

Risk reduction:

- prevents broad arbitrary property writes against OpenEMS components
- reduces physical control-path risk for ESS, EVCS, peak shaving, and SG Ready control

Validation:

- [apps/web/src/tests/security-hardening.test.ts](apps/web/src/tests/security-hardening.test.ts)
- [apps/web/src/tests/security-fuzz.test.ts](apps/web/src/tests/security-fuzz.test.ts)

### CodeQL: Client-Side Request Forgery (`adapter-worker.ts`)

Addressed in [apps/web/src/core/adapter-worker.ts](apps/web/src/core/adapter-worker.ts) and [apps/web/src/core/useAdapterWorker.ts](apps/web/src/core/useAdapterWorker.ts).

Changes:

- worker polling now accepts structured `PollTarget` input instead of raw URL strings
- poll URLs are rebuilt via `buildAllowedPollUrl()` and revalidated before fetch
- private/local-network allowlisting remains enforced
- path traversal, invalid query keys, CRLF injection, and dangerous headers are rejected
- polling interval is clamped to safe bounds

Risk reduction:

- narrows the browser worker fetch surface
- blocks header smuggling and malformed path/query injection attempts

Validation:

- [apps/web/src/tests/security-hardening.test.ts](apps/web/src/tests/security-hardening.test.ts)
- [apps/web/src/tests/security-fuzz.test.ts](apps/web/src/tests/security-fuzz.test.ts)

### CodeQL: Useless Conditional (`PageTour.tsx`)

Addressed in [apps/web/src/components/ui/PageTour.tsx](apps/web/src/components/ui/PageTour.tsx).

Changes:

- removed the redundant conditional inside `AnimatePresence`
- preserved the early-return guard for non-visible tours

### Trivy: Restrict Container Images To Trusted Registries

Addressed in:

- [helm/nexus-hems/templates/\_helpers.tpl](helm/nexus-hems/templates/_helpers.tpl)
- [helm/nexus-hems/templates/deployment-frontend.yaml](helm/nexus-hems/templates/deployment-frontend.yaml)
- [helm/nexus-hems/templates/deployment-server.yaml](helm/nexus-hems/templates/deployment-server.yaml)
- [helm/nexus-hems/values.yaml](helm/nexus-hems/values.yaml)
- [helm/nexus-hems/values.schema.json](helm/nexus-hems/values.schema.json)

Changes:

- chart helper now validates image repositories against a trusted registry prefix allowlist
- image references are rendered through a single validated helper
- schema support added for `image.trustedRegistries`

Risk reduction:

- prevents silent chart customization to arbitrary registries without explicit values changes

### Trivy: `brace-expansion` DoS

Addressed in [package.json](package.json) and [pnpm-lock.yaml](pnpm-lock.yaml).

Changes:

- added/expanded overrides for vulnerable transitive branches
- refreshed lockfile and install tree

## Additional Hardening Added

### Dependency Risk Reduction

Updated package and override policy in [package.json](package.json):

- `vite` patched from `^6.2.0` to `^6.4.2`
- override floor for `serialize-javascript` raised to `>=7.0.5`
- transitive overrides added for `@xmldom/xmldom`, `basic-ftp`, `flatted`, `handlebars`, `lodash`, `lodash-es`, `picomatch`, `yaml`, and multiple `brace-expansion` major lines

Result:

- local dependency audit dropped from 15 vulnerabilities to 6 vulnerabilities

### Security Fuzzing Coverage

Added:

- [apps/web/src/tests/security-fuzz.test.ts](apps/web/src/tests/security-fuzz.test.ts)
- [package.json](package.json) script `test:fuzz`
- [.github/workflows/fuzz.yml](.github/workflows/fuzz.yml)

Purpose:

- property-based fuzz coverage for worker header sanitization
- property-based fuzz coverage for structured poll-target rejection
- property-based fuzz coverage for malformed OpenEMS component IDs

This improves practical fuzzing posture even though the next OpenSSF Scorecard run is still needed to confirm whether the repository-level `Fuzzing` finding changes.

## Runtime / UI Verification Already Completed In This Wave

Addressed separately but part of the same branch:

- [apps/api/index.ts](apps/api/index.ts): dev-only CSP/HSTS boot fix to stop unwanted HTTPS upgrades on the local HTTP server
- [apps/web/tests/e2e/command-hub-energy-flow.spec.ts](apps/web/tests/e2e/command-hub-energy-flow.spec.ts): resilient page-heading and Sankey assertions
- [apps/web/tests/e2e/settings-navigation.spec.ts](apps/web/tests/e2e/settings-navigation.spec.ts): resilient page-heading assertions
- [apps/web/src/pages/CommandHub.tsx](apps/web/src/pages/CommandHub.tsx): stable mini-Sankey container height for mobile Safari

## Residual Risk After This Wave

Local dependency audit still reports 6 vulnerabilities.

Remaining paths:

1. `node_modules/npm/node_modules/brace-expansion`
2. `node_modules/npm/node_modules/picomatch`
3. `node_modules/external-editor/node_modules/tmp`

Assessment:

- these are currently confined to dev/release tooling, not the shipped browser runtime
- the `npm`-nested findings come through bundled dependencies under `@semantic-release/npm`
- the `tmp` finding comes through `@lhci/cli -> inquirer -> external-editor`
- no low-risk semver-compatible fix was achievable from the current toolchain without replacing or major-upgrading those tool dependencies

Recommended next step:

- track newer releases of `@semantic-release/npm` / `semantic-release`
- evaluate replacing or isolating `@lhci/cli` if a fixed release does not arrive

## Scorecard / Repo-Settings Findings

The following findings are not fully solvable from repository code alone and require admin or process changes:

- `Branch-Protection`
- `Code-Review`
- `Maintained`
- parts of `Vulnerabilities`
- `CII-Best-Practices`

Repository-side recommendations:

1. Require status checks before merge
2. Disallow direct pushes to `main`
3. Require linear history or merge queue
4. In single-maintainer mode, keep approvals optional and enforce merge quality via CI/Security gates
5. Review stale Dependabot PRs and close superseded ones
6. Keep weekly Scorecard, Security, and Fuzz workflows enabled

## Open PR Triage Recommendations

Based on the current `main` branch state:

### Close As Stale / Already Effectively Applied

- PR #18 `actions/upload-artifact` — current workflows already use `v7.0.0`
- PR #20 `github/codeql-action` — current workflows already use `v4.33.0`
- PR #19 `actions/configure-pages` — current `deploy.yml` already uses `v5`
- PR #21 `actions/upload-pages-artifact` — current `deploy.yml` already uses `v4`

### Rebase / Recreate After This Branch

- PR #27 `deps-dev` group — likely package-lock conflict with this security wave
- PR #28 `production-deps` group — large blast radius and likely package-lock conflict

### Defer For Dedicated Review

- PR #14 `vite 8` — ✅ COMPLETED: migrated to Vite 8.0.8 with Rolldown bundler
- PR #15 `@vitejs/plugin-react 6` — ✅ COMPLETED: migrated to v6.0.1 with `reactCompilerPreset`
- PR #12 `eslint 10` — ✅ SUPERSEDED: Biome-first toolchain migration completed (2026-04-20); ESLint retained only as slim React-only config; typescript-eslint, @eslint/js, Prettier and all bridges removed
- PR #13 `jsdom 29` — low urgency, but should be validated against Vitest DOM behavior
- PR #3 `node:25-alpine` — defer; project baseline is now Node 24 LTS (v1.2.0+), with newer Node majors revisited only as opt-in canary

### Likely Safe Candidate After Image Scan

- PR #2 `nginx:1.29-alpine` — small, container-focused surface; validate with image scan and deployment smoke test

## Verification Completed

Executed locally:

- `npx tsc --noEmit`
- `pnpm lint` (biome check + slim eslint) on changed source and test files
- `npx vitest run apps/web/src/tests/security-hardening.test.ts`
- `pnpm test:fuzz`
- `pnpm build`

Not executed locally:

- real `helm lint` / `helm template` because `helm` is not installed in this environment
- full Playwright matrix in this security wave
- live GitHub code-scanning alert fetch due API permission denial from the active integration
