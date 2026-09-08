# Security Full Gate Runbook

**Workflow:** `.github/workflows/security-full.yml`  
**Aggregate status check:** `Security Gate`

---

## Purpose

Comprehensive SAST, secret detection, supply-chain, and repository-hardening gate. It runs on every push/PR to `main` and weekly on Monday mornings.

---

## Triggers

- `push` to `main`
- `pull_request` to `main`
- Weekly schedule: Monday 05:00 UTC
- `workflow_dispatch`

---

## Jobs

| Job                          | Tool                           | Purpose                                                     |
| ---------------------------- | ------------------------------ | ----------------------------------------------------------- |
| `codeql`                     | GitHub CodeQL                  | JavaScript/TypeScript SAST (`security-and-quality` queries) |
| `gitleaks`                   | Gitleaks                       | Secret/credential detection                                 |
| `semgrep`                    | Semgrep OSS                    | SAST with `--config auto`                                   |
| `anti-trojan-source`         | `anti-trojan-source` + Biome   | Unicode bidi attack detection                               |
| `dependency-check`           | `pnpm audit` + license checker | Dependency vulnerabilities and license compliance           |
| `scorecard`                  | OpenSSF Scorecard              | Supply-chain security score (non-PR)                        |
| `branch-protection-reminder` | Shell checklist                | Prints branch-protection checklist to job summary           |
| `security-gate`              | Shell rollup                   | Fails if any critical job failed                            |

---

## Common Failures & Fixes

### CodeQL reports a new alert

- Open the alert in the GitHub Security tab.
- If it is a true positive, fix it and add a regression test when possible.
- If it is a false positive, use the GitHub UI to dismiss it with a reason.

### Gitleaks reports a secret

- **Do not commit real secrets.**
- Rotate the exposed credential immediately.
- If the match is a false positive (e.g., a test fixture), add an allowlist entry in `.gitleaks.toml` and document it.

### Semgrep reports an issue

- Review the SARIF output uploaded to GitHub Security tab.
- Fix true positives; suppress false positives via inline `nosemgrep` comments:
  ```ts
  // nosemgrep: typescript.react.security.audit.raw-dangerous-set-innerhtml
  ```

### Dependency audit fails

- `dependency-check` fails only on **critical** vulnerabilities.
- If a HIGH vulnerability is reported, open a dedicated remediation issue/PR.
- The separate `pnpm audit` step in `ci.yml` is currently report-only for HIGH CVEs until remediation.

### License compliance fails

- `license-checker` fails on `GPL-3.0` / `AGPL-3.0` in production.
- If a dependency has an incompatible license, find an alternative or obtain legal review.

---

## How to Extend

- Add a new job before the `security-gate` rollup.
- Include its result in the `security-gate` evaluation script.
- Update this runbook and `docs/PR-FEEDBACK-PLAYBOOK.md`.

---

## Related

- [ci-primary-gate.md](ci-primary-gate.md)
- [../PR-FEEDBACK-PLAYBOOK.md](../PR-FEEDBACK-PLAYBOOK.md)
