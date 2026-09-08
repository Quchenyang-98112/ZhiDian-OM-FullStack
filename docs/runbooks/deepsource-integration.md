# DeepSource Integration Runbook

**Config file:** `.deepsource.toml`  
**Dashboard:** https://deepsource.io/gh/qnbs/Nexus-HEMS-Dash  
**Status checks:** `DeepSource: Secrets`, `DeepSource: Test coverage` (the `DeepSource: JavaScript` analyzer is **disabled** — see below)

> **⚠️ JavaScript analyzer disabled (2026-07-07).** Its default-branch check stayed
> permanently red from rule-fit false positives (mainly `JS-0067`, ~213×) that can only be
> muted from the dashboard — and team-wide muting is a paid feature on this tier. The check
> was never a required merge gate, so it was pure red-X noise. Lint/style/hygiene are owned
> by Biome + ESLint (zero-warning `ci.yml` gate); PR code review is covered by CodeRabbit +
> CodeAnt. **Re-enable** by flipping `enabled = true` in `.deepsource.toml` once the dominant
> rules are muted repo-scoped from the dashboard (or the team moves to a muting-capable tier).

---

## Purpose

DeepSource provides deterministic static analysis, secrets detection, Docker analysis, and coverage diffing. It posts a report card and inline comments on pull requests.

---

## Current Configuration

The repository uses `.deepsource.toml` with:

- **JavaScript analyzer** — **disabled** (see the note at the top). Its config block is retained (commented rationale + `enabled = false`) so re-enabling is a one-line flip.
- **Secrets analyzer** — Detects committed credentials.
- **Docker analyzer** — Scans Dockerfiles.
- **Test-coverage analyzer** — Reads coverage reports and computes diff coverage.

Monorepo manifests are explicitly declared:

- `apps/api/package.json`
- `apps/web/package.json`
- `packages/shared-types/package.json`

---

## Rollout Mode

**Advisory-first.** DeepSource comments on PRs but is not a required merge gate. The
`DeepSource: JavaScript` analyzer is now disabled (rule-fit noise, un-muteable on this
tier — see the note at the top), so the only candidate to eventually make required is:

- `DeepSource: Secrets`

The JavaScript analyzer would only be reconsidered as a gate after it is re-enabled and its
rule-fit false positives are muted repo-scoped from the dashboard.

---

## How to Read Findings

1. Open the PR checks tab.
2. Click `DeepSource: JavaScript` or `DeepSource: Secrets`.
3. Read the report card.
4. Inline annotations appear directly on the diff.

---

## How to Fix Issues

1. Start with the highest-severity findings (`critical`, `major`).
2. For `style`/`minor` issues, run `pnpm lint:fix` first; many are already caught by Biome.
3. For `security` or `bug-risk` issues, understand the root cause before changing code.
4. If a finding is on generated or third-party code, exclude the path in `.deepsource.toml`.

---

## Suppressing Issues

Use explicit `skipcq` comments:

```ts
// skipcq: JS-0323 — reason why this exception is safe
const value = JSON.parse(unsafeInput);
```

Do **not** use bare `// skipcq` because it silences every rule on that line.

For repository-wide suppressions, update `.deepsource.toml` or use the DeepSource dashboard ignore rules, and document the rationale in the PR.

### Muting a whole rule (repo-scoped, dashboard)

For rule-fit noise — a rule that structurally does not apply to this codebase, where
per-line `skipcq` would be needed on hundreds of lines — mute the rule for the
repository from the dashboard:

1. Open the [repository dashboard](https://deepsource.io/gh/qnbs/Nexus-HEMS-Dash).
2. Go to the issue (e.g. from the **Issues** tab or a PR annotation) and open the
   issue-code page (e.g. `JS-0067`).
3. Use **Ignore issue → Ignore for the repository** (repo-scoped; available on all
   account tiers). Add the rationale in the note field.

> **API note:** the GraphQL `suppressIssueForTeam` mutation (team-default policy that
> silences a rule across *every* repo under the account) returns
> `Operation not allowed on this account type` on the current (non-paid) tier — it is
> a paid feature. Use the repo-scoped dashboard path above instead. Per-occurrence
> muting (`suppressIssueOccurrence`) is available but does not scale to rule-fit noise.

**Currently recommended repo-scoped mutes (rule-fit noise, not real defects):**

| Rule | Count | Why it is noise here |
|---|---|---|
| `JS-0067` (no global scope) | ~213 | Fires on top-level statements in ES modules; every file in an ESM/Vite codebase has module-scope code by design. |
| `JS-0833` | ~7 | Idiom mismatch; the flagged pattern is intentional and Biome-clean. |

Mute both **for the repository** (not team-wide) with the rationale above. Everything
else in the DeepSource backlog is either a real fix (landed in the code) or an accepted
strict-mode idiom (`JS-0339` non-null under `noUncheckedIndexedAccess`, `JS-0116`,
`JS-0437` already `biome-ignore`d, `JS-0002` dev-guarded) — do **not** add codebase
suppressions for those.

---

## Autofix Policy

Autofix is configured from the DeepSource dashboard, not from `.deepsource.toml`.

- Enable only for low-risk categories: formatting, unused imports, dead code.
- Never auto-apply fixes to control-logic paths:
  - `apps/api/src/middleware/security.ts`
  - `apps/api/src/routes/auth*.ts`
  - `apps/api/src/protocols/**`
  - `apps/web/src/core/adapters/**`
  - `apps/web/src/core/command-safety.ts`
  - `apps/web/src/core/energy-controllers.ts`
- Prefer the “create a new PR” Autofix path over “commit to PR branch”.

---

## Coverage Gate

DeepSource reads the coverage artifact uploaded by `ci.yml`. The coverage gate is advisory until tuning is complete. The eventual goal is:

- Diff coverage should not fall significantly below the project average.
- New code in adapters, auth, and command-safety paths should have tests.

---

## How to Update This Configuration

1. Edit `.deepsource.toml`.
2. Open a PR; DeepSource will validate the config.
3. Update this runbook if the change affects contributors.

---

## Related

- [codeant-ai-integration.md](codeant-ai-integration.md)
- [working-with-coverage.md](working-with-coverage.md)
- [../PR-FEEDBACK-PLAYBOOK.md](../PR-FEEDBACK-PLAYBOOK.md)
