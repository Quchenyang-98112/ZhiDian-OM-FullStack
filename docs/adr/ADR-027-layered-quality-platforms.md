# ADR-027: Layered Code-Quality Platforms & CI Consolidation

- **Status:** Accepted
- **Date:** 2026-07-03
- **Related:** ADR-001 (Biome-first toolchain), ADR-015 (release chain), PRF-01/PRF-02/PRF-03 (Technical Debt Registry), `DEVOPS.md`, `.deepsource.toml`, `.codecov.yml`, `.coderabbit.yaml`, `.codeant/`, `docs/runbooks/*`

---

## Context

The repository accreted four code-quality platforms over time — DeepSource,
CodeAnt.ai (runbooks + advisory), and a Codecov **badge** — plus a Copilot reviewer,
without a written contract for how they layer or who owns which signal. Concretely:

- **Codecov** was referenced (README badge, docs) but **never wired**: no
  `codecov/codecov-action` in any workflow, only an `upload-artifact`. The badge
  rendered "unknown". `apps/api/vitest.config.ts` emitted no `json-summary`.
- **CodeRabbit** was named as an "alternative" in a runbook but had no config, no runbook.
- **CodeAnt.ai** was documented as dashboard-only ("no config file required").
- **Dependabot and Renovate** were both active for `npm`/`docker`/`github-actions`/`cargo`,
  producing duplicate dependency PRs.
- **CodeQL** was defined **3×** (`security.yml`, `security-scan.yml`, `security-full.yml`),
  **Semgrep** 2×, **OpenSSF Scorecard** 2× — multiplying compute per push/PR with no added coverage.

Without an ownership contract, the platforms risked duplicating each other's findings
(review fatigue) and the coverage story was aspirational rather than enforced.

## Decision

Adopt a **three-layer** quality model (full matrix in `DEVOPS.md`):

1. **Deterministic gates (blocking):** `ci.yml` + `security-full.yml` + Helm lint.
   These alone gate merges.
2. **Structured signals (advisory):** DeepSource + Codecov.
3. **AI contextual review (advisory):** CodeRabbit + CodeAnt.ai.

Concrete changes:

- **Codecov wired** — `.codecov.yml` (advisory/`informational`, monorepo carryforward
  flags `web`+`api`), `codecov/codecov-action@v5` uploads in `ci.yml`, and a
  `json-summary` reporter added to `apps/api/vitest.config.ts`. The **blocking** coverage
  gate remains `scripts/check-coverage-baseline.mjs` (PRF-03); Codecov never blocks.
- **CodeRabbit added** — `.coderabbit.yaml` with domain `path_instructions` (React 19 +
  React Compiler, i18n dual-locale, a11y, safety-critical paths) + a runbook.
- **CodeAnt.ai configured** — `.codeant/configuration.json` (analyzers de-duplicated:
  `secrets`/`sca`/`iac`/`docstring` **disabled** because Gitleaks/DeepSource, pnpm-audit/Grype/Trivy/Renovate,
  Trivy/DeepSource-docker, and DeepSource-doc-coverage already own them) +
  `.codeant/instructions.json` (domain/safety guidance). Advisory posture retained.
- **DeepSource** — no `[[transformers]]` block **by design** (Biome owns formatting;
  DeepSource ships no Biome transformer and prettier is banned by ADR-001). Documented in-file.
- **Dependency bots reconciled** — Renovate owns `npm`/`docker`/`cargo`; Dependabot
  trimmed to `github-actions` only.
- **Security workflows consolidated** — single CodeQL (`security-full.yml:CodeQL`),
  single Semgrep (`security-full.yml:Semgrep OSS`), single Scorecard (`scorecard.yml`).
  `security.yml` and `security-scan.yml` deleted; their schedule-only license/full-audit
  jobs folded into `security-full.yml`.
- **Workflow hygiene** — `concurrency` added to 7 workflows; `timeout-minutes` added to
  `ci.yml` jobs; `pr-feedback-summary.yml` table fixed + Codecov link added; `fuzz.yml`
  dead `cancel-in-progress` condition fixed; `::group::` folding + step summary in `ci.yml`.

## Owner actions (out-of-band, required)

Some steps need repo-owner access and are **not** in this diff:

1. Install the **Codecov**, **CodeRabbit**, and **CodeAnt.ai** GitHub Apps.
2. Add the **`CODECOV_TOKEN`** repository secret.
3. **Update the `main` branch-protection ruleset:** remove the now-deleted required checks
   **`CodeQL Analysis`** (from `security.yml` and `security-scan.yml`) and **`Semgrep SAST`**
   (from `security-scan.yml`); require **`CodeQL`** + **`Semgrep OSS`** from `security-full.yml`
   (or require the aggregate **`Security Gate`** job). Until this is applied, the merge gate
   references check names that will never report.

## Consequences

- **Positive:** Coverage reporting is real (PR comments + per-flag deltas) with the
  baseline as the hard floor. Each signal has one owner — less review fatigue. CodeQL/Semgrep/
  Scorecard compute cut to a single run each. Dependency PRs de-duplicated. Every workflow
  has concurrency + sane timeouts.
- **Negative / risk:** The branch-protection ruleset **must** be updated in lock-step with
  the merge of this change or PRs will block on missing checks (documented above). Three
  advisory reviewers (DeepSource + CodeRabbit + CodeAnt) can still be noisy; the
  de-duplication config mitigates but dashboard tuning may be needed during the 2–4 week
  rollout window.
- **Neutral:** All new third-party actions remain SHA-pinned (repo policy);
  `codecov/codecov-action` pinned to `v5.5.5`.
