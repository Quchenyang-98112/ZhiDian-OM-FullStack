# Working with Coverage Runbook

**Tools:** Vitest (v8 provider), DeepSource test-coverage analyzer  
**Artifacts:** `coverage-report` (from `ci.yml`)

---

## Purpose

Track test coverage for the web app (`apps/web`) and eventually the API (`apps/api`). Coverage is uploaded as an artifact in CI and consumed by DeepSource for PR diff coverage.

---

## Local Coverage

```bash
# Web coverage
pnpm test:coverage

# API coverage (run directly because it is not yet part of root coverage script)
pnpm --filter @nexus-hems/api exec vitest run --coverage
```

Reports are written to:

- `apps/web/coverage/`
- `apps/api/coverage/`

---

## Coverage Thresholds

Current Phase-1 ratchet (from `vitest.config.ts`):

| Package | Statements | Branches | Functions | Lines |
| ------- | ---------- | -------- | --------- | ----- |
| API     | 56%        | 46%      | 56%       | 56%   |
| Web     | 55%        | 45%      | 55%       | 56%   |

Target (tracked in `docs/Testing-Coverage-Strategy.md`): 70%+ all metrics.

---

## Coverage in CI

- `ci.yml` `unit-tests` job runs `pnpm test:coverage`.
- The `coverage-report` artifact is uploaded for inspection.
- DeepSource reads the coverage data and adds a coverage report card to PRs.

---

## How to Improve Coverage Safely

1. Write tests for new code as you add it.
2. Prioritize branch coverage in:
   - Adapter connection/disconnect/error paths
   - Circuit-breaker state transitions
   - JWT key rotation paths
   - Command-safety validation and rate limiting
3. Do not exclude control-logic files from coverage to game metrics.
4. If a path is genuinely hard to test, document the reason in the PR and consider a targeted integration test.

---

## Coverage Diff Enforcement

During the advisory period, DeepSource coverage comments are informational. After tuning, the goal is:

- PR diff coverage should not fall more than 5 percentage points below the project average.
- New code in adapters, auth, and command-safety paths should have tests.

If DeepSource’s built-in gate is insufficient, a custom step can be added to `unit-tests` that compares the new coverage JSON against `main`.

---

## Common Issues

### Coverage report artifact is empty

- Verify `apps/web/coverage/` exists after `pnpm test:coverage`.
- Check the upload path in `ci.yml`.

### Coverage dropped unexpectedly

- Look at the `coverage-report` artifact.
- Check if a large, untested file was added.
- Run `pnpm test:coverage` locally to reproduce.

---

## Related

- [ci-primary-gate.md](ci-primary-gate.md)
- [deepsource-integration.md](deepsource-integration.md)
- [../Testing-Coverage-Strategy.md](../Testing-Coverage-Strategy.md)
- [../PR-FEEDBACK-PLAYBOOK.md](../PR-FEEDBACK-PLAYBOOK.md)
