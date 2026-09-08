# CodeAnt.ai Integration Runbook

**GitHub App:** CodeAnt AI  
**Status check:** `CodeAnt AI`  
**Mode:** Advisory

---

## Purpose

CodeAnt.ai provides AI-powered code review comments on pull requests. It complements deterministic tools (Biome, DeepSource) with higher-level feedback on architecture, maintainability, and security smells.

---

## Installation

> These steps require repository-owner access to GitHub.

1. Go to https://codeant.ai and sign in with the `qnbs` GitHub account.
2. Install the CodeAnt AI GitHub App.
3. Select `qnbs/Nexus-HEMS-Dash`.
4. Grant the requested repository permissions.

CodeAnt reads repo-level config from the **`.codeant/`** directory (docs:
https://docs.codeant.ai/pull_request/customize/global_repo_config). The dashboard is
still used for App install, org-wide defaults, and severity, but the analyzer scoping
and review guidance below are version-controlled in the repo.

---

## Configuration

### Repo config files (`.codeant/`)

| File | Purpose |
|------|---------|
| `.codeant/configuration.json` | Which analyzers run + file include/exclude filters |
| `.codeant/instructions.json` | Domain/safety guidance that shapes review comments |

**`.codeant/configuration.json` — analyzer de-duplication.** Analyzers already owned by
the deterministic stack are **disabled** so CodeAnt adds signal, not noise (see
[DEVOPS.md](../../DEVOPS.md) ownership matrix / [ADR-027](../adr/ADR-027-layered-quality-platforms.md)):

- `secrets_analysis` → **disabled** (Gitleaks + DeepSource own secrets)
- `sca_analysis` → **disabled** (pnpm audit + Grype/Trivy + Renovate)
- `iac_analysis` → **disabled** (Trivy Helm + DeepSource docker)
- `docstring_analysis` → **disabled** (DeepSource doc-coverage)
- **Kept:** `sast_analysis` (AI SAST complements CodeQL/Semgrep), `deadcode`,
  `duplicatecode`, `antipatterns` (architecture), `complex_function`.

**`.codeant/instructions.json`** encodes React 19 + React Compiler, i18n dual-locale,
a11y, safety-critical control paths, Zod/auth, and shared-types breaking-change rules —
the same guidance as `.coderabbit.yaml`'s `path_instructions`.

### Dashboard settings

1. **Severity.** Keep inline comments at `warning` or higher; reserve `error` for clear security issues.
2. **Blocking policy.** Keep CodeAnt **advisory** (non-blocking) indefinitely — no
   `.codeant/quality_gates_conditions.json` is committed, so CodeAnt does not gate merges.
   It informs human reviewers, not replaces them.

---

## How to Read CodeAnt Comments

1. CodeAnt posts a summary comment and inline comments on the PR diff.
2. Read the suggestion and the reasoning.
3. If the suggestion is correct and safe, apply it manually or reply `+1`.
4. If the suggestion is incorrect or unsafe, reply explaining why and resolve the thread.

---

## Safety Rules

- **Never auto-apply** CodeAnt suggestions to control logic, auth, rate limits, or safety guardrails.
- **Never** let CodeAnt auto-approve or auto-merge a PR.
- For files under:
  - `apps/api/src/middleware/security.ts`
  - `apps/api/src/routes/auth*.ts`
  - `apps/api/src/protocols/**`
  - `apps/web/src/core/adapters/**`
  - `apps/web/src/core/command-safety.ts`
  - `apps/web/src/core/energy-controllers.ts`
    require explicit human review regardless of CodeAnt’s suggestion.

---

## When to Trust AI Suggestions

| Suggestion type                  | Trust level                       | Action                                       |
| -------------------------------- | --------------------------------- | -------------------------------------------- |
| Rename variable / improve naming | High                              | Apply if it improves clarity                 |
| Extract helper function          | Medium                            | Apply if it reduces complexity and has tests |
| Error-handling improvement       | Medium                            | Apply only with regression tests             |
| Security refactor                | Low                               | Always have a human reviewer verify          |
| Control-logic change             | Do not apply without human review | Require maintainer approval                  |

---

## Reducing Noise

If CodeAnt becomes noisy:

1. Lower the inline-comment threshold in the dashboard.
2. Disable more overlapping rules.
3. Add ignore patterns for generated/test fixtures.
4. Open an issue to tune the configuration.

---

## Alternative Tools

If CodeAnt.ai is unavailable or does not meet the project’s needs, alternatives are:

- **CodeRabbit** — fast, configurable AI review (`.coderabbit.yaml`).
- **Qodo Merge / PR-Agent** — open-source, self-hostable, model-agnostic.
- **GitHub Copilot Code Review** — native if Copilot Business/Enterprise is already active.

Update this runbook if an alternative is chosen.

---

## Related

- [pr-review-correction-loop.md](pr-review-correction-loop.md) — mandatory correction-loop checklist
- [deepsource-integration.md](deepsource-integration.md)
- [../PR-FEEDBACK-PLAYBOOK.md](../PR-FEEDBACK-PLAYBOOK.md)
