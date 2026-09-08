# PR Status Checks Runbook

**Purpose:** Document the required and optional status checks for pull requests to `main`, and how to update them.

---

## Required Checks (intended branch-protection configuration)

These checks should be configured in **Settings → Branches → main → Require status checks to pass before merging**:

| Check                    | Workflow                              | Notes                                                  |
| ------------------------ | ------------------------------------- | ------------------------------------------------------ |
| `✅ CI Passed`           | `.github/workflows/ci.yml`            | Primary merge rollup gate                              |
| `Security Gate`          | `.github/workflows/security-full.yml` | Security rollup gate                                   |
| `DeepSource: JavaScript` | DeepSource GitHub App                 | Advisory initially; will become required after tuning  |
| `DeepSource: Secrets`    | DeepSource GitHub App                 | Advisory initially; will become required after tuning  |
| `Lighthouse CI`          | `.github/workflows/lighthouse.yml`    | Performance / a11y budgets                             |
| `chromatic`              | `.github/workflows/chromatic.yml`     | Visual regression (requires `CHROMATIC_PROJECT_TOKEN`) |
| `Security Fuzz Tests`    | `.github/workflows/ci.yml` (`fuzz-tests` job) | Required via `ci-passed` rollup; `fuzz.yml` is weekly supplement |

> `CodeAnt AI` is intentionally **not required** because it is advisory.

---

## Optional / Informational Checks

| Check                          | Workflow                               | Notes                              |
| ------------------------------ | -------------------------------------- | ---------------------------------- |
| `DeepSource: Test coverage`    | DeepSource GitHub App                  | Coverage diff (advisory initially) |
| `CodeAnt AI`                   | CodeAnt.ai GitHub App                  | AI review summary                  |
| `OpenSSF Scorecard`            | `.github/workflows/scorecard.yml`      | Supply-chain score                 |
| `📊 Benchmark Report`          | `.github/workflows/perf-benchmark.yml` | Bundle/dependency/lint timing      |
| `SBOM — Source & Dependencies` | `.github/workflows/sbom-scan.yml`      | Software bill of materials         |

---

## How to Update Branch Protection

1. Go to **Settings → Branches → main**.
2. Enable **Require status checks to pass before merging**.
3. Enable **Require branches to be up to date before merging**.
4. Add each required check name from the table above.
5. Enable **Restrict who can push to matching branches** and **Restrict pushes that create files larger than 100 MB** if not already set.
6. Save.

---

## How to Add a New Required Check

1. Add the job/workflow to the repository.
2. Run it on a PR so GitHub learns the check name.
3. Update this runbook and `docs/PR-FEEDBACK-PLAYBOOK.md`.
4. Add the check name to branch protection.

---

## Related

- [ci-primary-gate.md](ci-primary-gate.md)
- [security-full-gate.md](security-full-gate.md)
- [../PR-FEEDBACK-PLAYBOOK.md](../PR-FEEDBACK-PLAYBOOK.md)
