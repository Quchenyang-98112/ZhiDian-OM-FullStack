# DevOps & Code-Quality Platform Architecture

This document describes how Nexus-HEMS-Dash's CI/CD and code-quality tooling fit
together. It is the map; the per-tool runbooks in [`docs/runbooks/`](docs/runbooks/)
are the territory. Architectural decision: [ADR-027](docs/adr/ADR-027-layered-quality-platforms.md).

> **Hardware/CI policy:** heavy gates (full test suite, E2E, Lighthouse, image scans,
> CodeQL) are **cloud-first**. The local loop is `type-check → lint → targeted tests`
> only. See the "Hardware Profile & Cloud-First CI Policy" callout in `CLAUDE.md`.

## The three layers

Quality feedback is organized into three layers by **latency and authority**:

| Layer | Tools | Authority | What it catches |
|-------|-------|-----------|-----------------|
| **1. Deterministic gates** (fast, blocking) | `ci.yml` (lint, type-check, unit tests + coverage baseline, build, size-limit, E2E, fuzz), `security-full.yml` (CodeQL, Semgrep, Gitleaks, anti-trojan-source, dep audit), Helm lint | **BLOCKING** — merge is gated on these | Compile errors, lint violations, test failures, coverage-floor drops, known CVEs, secrets, SAST findings, bundle-size regressions |
| **2. Structured quality signals** | **DeepSource** (static analysis, secrets, docker, coverage diff), **Codecov** (coverage %, patch/project delta) | **Advisory** (informational) | Maintainability trends, per-line coverage, complexity hotspots, coverage deltas vs base |
| **3. AI contextual review** | **CodeRabbit** (`.coderabbit.yaml`), **CodeAnt.ai** (`.codeant/`) | **Advisory** | Architecture/logic smells, missing tests for complex logic, error-handling gaps, domain-specific risk the deterministic tools can't model |

**Rule of thumb:** Layer 1 protects `main`. Layers 2–3 inform the human reviewer.
No AI tool auto-merges, auto-approves, or auto-applies fixes to safety-critical paths.

## Ownership matrix (who owns which signal — no duplication)

| Concern | Owner (single source of truth) | Notes |
|---------|-------------------------------|-------|
| Formatting / style | **Biome** (ADR-001) | Prettier is banned; DeepSource has no Biome transformer, so it registers none. |
| Lint (React rules) | ESLint (slim: react-compiler, react-hooks, react-refresh) | Everything else → Biome. |
| Type safety | `tsc --noEmit` (ultra-strict) | |
| Secret detection | **Gitleaks** (blocking) + DeepSource secrets | CodeAnt `secrets_analysis` **disabled** to avoid triple-report. |
| SAST | **CodeQL** + **Semgrep** (single defs in `security-full.yml`) + DeepSource | CodeAnt `sast_analysis` kept (AI SAST complements). |
| Dependency vulns (SCA) | **pnpm audit** (blocking) + Grype/Trivy + Renovate alerts | CodeAnt `sca_analysis` **disabled**. |
| IaC / container | **Trivy** (Helm) + DeepSource docker analyzer | CodeAnt `iac_analysis` **disabled**. |
| Coverage floor | **`scripts/check-coverage-baseline.mjs`** (blocking, PRF-03) | The one hard coverage gate. |
| Coverage %/trend | **Codecov** (advisory) + DeepSource test-coverage | Codecov status is `informational: true`. |
| Doc coverage | DeepSource (`skip_doc_coverage` tuned) | CodeAnt `docstring_analysis` **disabled**. |
| Supply-chain score | **OpenSSF Scorecard** (`scorecard.yml`, single source) | Removed the duplicate job from `security-full.yml`. |
| Dependency updates | **Renovate** (`.renovaterc.json`) for npm/docker/cargo; **Dependabot** for github-actions only | ADR-027 reconciliation — was duplicated. |

## Dependency-bot split (ADR-027)

Running Dependabot **and** Renovate on the same ecosystems produced duplicate PRs.
Resolution:
- **Renovate** owns `npm`, `docker`, `cargo/Tauri` (rich grouping, automerge, dashboard).
- **Dependabot** owns **`github-actions` only** (first-party SHA-pin bumps for all workflows).

## CodeQL / Semgrep / Scorecard consolidation (ADR-027)

Previously CodeQL was defined **3×** (`security.yml`, `security-scan.yml`,
`security-full.yml`), Semgrep 2×, Scorecard 2× — tripling/doubling compute per push.
Now:
- **CodeQL** → single job in `security-full.yml` (richest: `security-and-quality`
  queries + explicit category). Check name: **`CodeQL`**.
- **Semgrep** → single job in `security-full.yml`. Check name: **`Semgrep OSS`**.
- **Scorecard** → single job in `scorecard.yml`.
- `security.yml` and `security-scan.yml` **deleted**; their schedule-only license +
  full-audit jobs moved into `security-full.yml`.

> **Branch-protection ruleset update required** (owner action): remove the old required
> checks `CodeQL Analysis` (×2) and `Semgrep SAST`; require `CodeQL` + `Semgrep OSS`
> (or the aggregate `Security Gate`). See the owner checklist below.

## Owner setup checklist (one-time, requires repo-owner access)

- [x] **Codecov** GitHub App — `codecov/patch` reports on open PRs (e.g. #344–#346); uploads work via `codecov/codecov-action` in `ci.yml`.
- [x] **CodeRabbit** GitHub App — `.coderabbit.yaml` + `coderabbit-rereview.yml`; reviews queue on PR push.
- [ ] **CodeAnt.ai** GitHub App — repo config in `.codeant/` is committed; **`CodeAnt AI` check does not yet appear on PRs** → install the app at https://codeant.ai and grant access to `qnbs/Nexus-HEMS-Dash` (see `docs/runbooks/codeant-ai-integration.md`).
- [x] DeepSource — Docker/Rust/Shell analyzers report on PRs (advisory).
- [ ] Rotate **`GH_TOKEN`** if release checkout/push fails — PAT used only by `release.yml` semantic-release push (see `docs/Release-GH_TOKEN-Setup.md`). Checkout uses `GITHUB_TOKEN`; an expired PAT must not block fetch after `release.yml` fix (2026-09-01).
- [ ] Update the `main` branch-protection ruleset per the consolidation note above (if old `CodeQL Analysis` / `Semgrep SAST` names are still required).
- [ ] Confirm **`RENOVATE_TOKEN`** is present (Renovate is the sole dep bot for npm/docker/cargo).
- [ ] (Optional) In each AI dashboard, confirm advisory (non-blocking) posture.

## Runbooks

- [`docs/runbooks/ci-primary-gate.md`](docs/runbooks/ci-primary-gate.md)
- [`docs/runbooks/security-full-gate.md`](docs/runbooks/security-full-gate.md)
- [`docs/runbooks/working-with-coverage.md`](docs/runbooks/working-with-coverage.md)
- [`docs/runbooks/deepsource-integration.md`](docs/runbooks/deepsource-integration.md)
- [`docs/runbooks/codeant-ai-integration.md`](docs/runbooks/codeant-ai-integration.md)
- [`docs/runbooks/coderabbit-integration.md`](docs/runbooks/coderabbit-integration.md)
- [`docs/runbooks/pr-status-checks.md`](docs/runbooks/pr-status-checks.md)
- [`docs/PR-FEEDBACK-PLAYBOOK.md`](docs/PR-FEEDBACK-PLAYBOOK.md) — the PR correction loop.
