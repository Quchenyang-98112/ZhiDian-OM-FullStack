# CI Primary Gate Runbook

**Workflow:** `.github/workflows/ci.yml`  
**Aggregate status check:** `✅ CI Passed`

---

## Purpose

The primary merge gate for Nexus-HEMS-Dash. It runs on every push to `main`/`develop` and every pull request to `main`. It verifies lint, type safety, unit tests, production build, E2E tests, security audit, and fuzz tests.

---

## Triggers

- `push` to `main` or `develop`
- `pull_request` to `main`

---

## Job Layout

```
lint-typecheck ──┬── unit-tests
                 ├── helm-chart
                 ├── security
                 └── build ──┬── e2e-tests
                               └── slsa-attest (main push + PRs to main only)

fuzz-tests (standalone)

ci-passed (rollup gate — needs all jobs above)
```

| Job              | What it does                                                                                                  | Typical duration |
| ---------------- | ------------------------------------------------------------------------------------------------------------- | ---------------- |
| `lint-typecheck` | `pnpm lint` + `pnpm lint:all` + `pnpm check:adapters` + `pnpm type-check`                                     | ~3–6 min         |
| `helm-chart`     | `helm lint` on the Kubernetes chart                                                                           | ~1 min           |
| `unit-tests`     | API + web unit tests with coverage baseline                                                                   | ~6–12 min        |
| `build`          | Production build, size-limit, production-bundle smoke test, artifact upload                                   | ~5–10 min        |
| `slsa-attest`    | SLSA Level-3 build-provenance attestation (3 retries); **does not block E2E**                                 | ~2–4 min         |
| `e2e-tests`      | Playwright Chromium against the uploaded build                                                                | ~10–20 min       |
| `security`       | `pnpm audit --audit-level=high --prod` (blocking) + dependency allowlist                                    | ~2 min           |
| `fuzz-tests`     | `pnpm test:fuzz`                                                                                              | ~2 min           |
| `ci-passed`      | Fails if any required prerequisite failed; accepts `slsa-attest` as `success` or `skipped`                    | ~0 min           |

### PR / main parity

SLSA attestation runs on **both** `push` to `main` and `pull_request` targeting `main`. A green PR CI therefore exercises the same SLSA path as a post-merge main push (previously SLSA ran only on `push: main`, so PRs could be green while main failed on a transient GitHub attestations 403).

E2E depends only on `build`, not on `slsa-attest`, so a flaky SLSA API does not skip E2E.

---

## Common Failures & Fixes

### `pnpm lint` fails

```bash
pnpm lint:fix
pnpm lint   # verify zero warnings/errors
```

### `pnpm type-check` fails

```bash
pnpm type-check
# fix reported TypeScript errors; the repo uses strict mode
```

### Unit tests fail

```bash
# API tests
pnpm --filter @nexus-hems/api test:run

# Web tests
pnpm --filter @nexus-hems/web test:run
```

### Size-limit fails

- Check the `bundle-analysis` artifact.
- If a dependency grew the bundle, consider lazy-loading or an alternative package.
- Update budgets only via ADR/PR discussion.

### Smoke test fails

- Ensure `pnpm build` produces a working `apps/web/dist/`.
- Run `pnpm --filter @nexus-hems/web smoke:prod` locally after building.

### E2E tests fail

- Download the `playwright-report` artifact.
- Re-run locally with `VITE_E2E_TESTING=true pnpm test:e2e`.

### SLSA attestation failures {#slsa-attestation-failures}

**Symptom:** `slsa-attest` job fails with `error creating signing certificate — (403) Forbidden`.

**Cause:** Transient GitHub Attestations API outage or rate limiting. Not a code regression — the build artifact itself is fine.

**What CI does:** Three attempts with 45s / 90s backoff in the dedicated `slsa-attest` job.

**Remediation:**

1. Re-run the failed `slsa-attest` job (or the whole workflow) from the Actions UI.
2. If it persists across multiple runs, check [GitHub Status](https://www.githubstatus.com/) for Attestations / Actions incidents.
3. Verify locally after a green build on main:
   ```bash
   gh attestation verify apps/web/dist/assets/index-*.js --repo qnbs/Nexus-HEMS-Dash
   ```

**Historical note:** Before 2026-09-01, SLSA ran inside the `build` job on `push: main` only. A 403 there failed `build`, skipped E2E, and could pass PR CI (no SLSA on PRs). That gap is closed by the separate `slsa-attest` job and PR parity.

---

## How to Extend

1. Add a new job that depends on `build` or `lint-typecheck`.
2. Upload artifacts with `actions/upload-artifact` for debugging.
3. Add the job to the `needs:` list of `ci-passed`.
4. Update this runbook and `docs/PR-FEEDBACK-PLAYBOOK.md`.

---

## Related

- [security-full-gate.md](security-full-gate.md)
- [working-with-coverage.md](working-with-coverage.md)
- [../PR-FEEDBACK-PLAYBOOK.md](../PR-FEEDBACK-PLAYBOOK.md)
- [../../.github/CI-AUDIT.md](../../.github/CI-AUDIT.md)
