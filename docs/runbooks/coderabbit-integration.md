# CodeRabbit Integration Runbook

**GitHub App:** CodeRabbit
**Config file:** `.coderabbit.yaml` (repo root)
**Mode:** Advisory

---

## Purpose

CodeRabbit provides AI-powered, contextual pull-request review. In the layered
quality model ([DEVOPS.md](../../DEVOPS.md), [ADR-027](../adr/ADR-027-layered-quality-platforms.md))
it sits in **Layer 3 (AI contextual review)** alongside CodeAnt.ai. It complements —
never duplicates — the deterministic gates (Biome, tsc, CodeQL, Semgrep) and the
structured signals (DeepSource, Codecov). It is **advisory**: it comments and
summarizes but is not a required merge gate.

---

## Installation

> These steps require repository-owner access to GitHub.

1. Go to https://coderabbit.ai and sign in with the `qnbs` GitHub account.
2. Install the CodeRabbit GitHub App and select `qnbs/Nexus-HEMS-Dash`.
3. Grant the requested repository permissions.
4. CodeRabbit reads `.coderabbit.yaml` from the repo root — no dashboard setup needed
   for the baseline configuration.

---

## Configuration (`.coderabbit.yaml`)

Key choices already encoded in the repo config:

- **`reviews.profile: assertive`** + `tone_instructions` — specific, `file:line`-cited
  feedback that prioritizes correctness/safety over style nits Biome already owns.
- **`reviews.auto_review`** on `main` / `develop`, drafts excluded.
- **`path_filters`** — skip `node_modules`, `dist`, lockfiles, generated files,
  `coverage`, `storybook-static`, `src-tauri/target`, snapshots, minified bundles.
- **`path_instructions`** — domain rules so reviews match repo conventions:
  - `apps/web/src/**` — React 19 + React Compiler (no manual memoization), i18n
    dual-locale, WCAG 2.2 AA, no Redux/MobX, no Tailwind v3 syntax.
  - `apps/web/src/core/**` — **safety-critical**: surface risks, never suggest silent
    edits to control logic / commands / rate limits / guardrails.
  - `apps/api/src/**` — Zod validation, auth/mTLS require human review.
  - `packages/shared-types/**` — cross-package breaking-change awareness.

### Overlap avoidance

CodeRabbit is instructed to defer:
- **Formatting/style** → Biome (ADR-001).
- **Secrets/SAST/SCA** → Gitleaks / CodeQL / Semgrep / DeepSource.
- **Coverage** → Codecov + the baseline gate.

Focus areas: logic correctness, architecture fit, readability, missing tests, and
domain (energy/safety) risk.

---

## How to Read CodeRabbit Comments

1. CodeRabbit posts a high-level summary + inline comments on the PR diff.
2. Read the suggestion and its reasoning.
3. If correct and safe, apply it manually (or accept the suggestion) and reply.
4. If incorrect or unsafe, reply explaining why and resolve the thread.
5. Use `@coderabbitai` chat for follow-up questions or to request a re-review.

### Automated re-review (preferred)

`.github/workflows/coderabbit-rereview.yml` posts `@coderabbitai review` when:

- A non-draft PR receives new commits (`synchronize`, `opened`, `ready_for_review`, …), or
- **CI** completes successfully on a PR branch,

and the head SHA has no CodeRabbit review yet (one request per SHA, marker
`<!-- coderabbit-review-request:<sha> -->`).

**Cursor Cloud agents** cannot post PR comments (`gh pr comment` → 403). Push commits
instead; the workflow handles re-review. Maintainers may also run:

```bash
./scripts/request-coderabbit-review.sh <pr-number>
# or
gh workflow run coderabbit-rereview.yml -f pr_number=<num> -f force=false
```

Manual comment (maintainer `gh` session only):

```bash
gh pr comment <num> --body "@coderabbitai review"
```

### Outside-diff comments

Some findings cannot be posted inline (*"outside the diff range"*). They appear only
in PR **review bodies** under `⚠️ Outside diff range comments`. Fetch them with:

```bash
./scripts/fetch-coderabbit-outside-diff.sh <pr-number>
```

Treat them with the same fix-or-decline discipline as inline threads. Full workflow:
[pr-review-correction-loop.md](pr-review-correction-loop.md) §6.1.

---

## Safety Rules

- **Never auto-apply** CodeRabbit suggestions to control logic, auth, rate limits, or
  safety guardrails (mirrors the CodeAnt + DeepSource rule).
- **Never** let CodeRabbit auto-approve or auto-merge (`request_changes_workflow: false`,
  `auto_resolve_threads: false`).
- Files under `apps/web/src/core/adapters/**`, `apps/web/src/core/command-safety.ts`,
  `apps/api/src/middleware/**`, and auth/proxy routes require explicit human review
  regardless of CodeRabbit's suggestion.

---

## Reducing Noise

If CodeRabbit becomes noisy:

1. Tighten `path_filters` in `.coderabbit.yaml`.
2. Add or refine `path_instructions` to tell it what to skip.
3. Lower scope via `reviews.auto_review.base_branches`.
4. Keep `profile: assertive` (fewer, higher-signal comments than `chill`).

---

## Related

- [pr-review-correction-loop.md](pr-review-correction-loop.md) — mandatory correction-loop checklist
- [codeant-ai-integration.md](codeant-ai-integration.md)
- [deepsource-integration.md](deepsource-integration.md)
- [working-with-coverage.md](working-with-coverage.md)
- [../PR-FEEDBACK-PLAYBOOK.md](../PR-FEEDBACK-PLAYBOOK.md)
- [../../DEVOPS.md](../../DEVOPS.md)
