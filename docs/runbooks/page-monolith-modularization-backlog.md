# Runbook: Page Monolith Modularization Backlog

## Purpose

Several page components in `apps/web/src/pages/` have grown into monoliths that exceed maintainability thresholds and trigger DeepSource hygiene / complexity warnings when touched. This runbook tracks the planned modularization work and links to dedicated per-page runbooks.

## Current backlog

| Page | File | Lines | Status | Runbook |
|------|------|-------|--------|---------|
| MonitoringPage | `apps/web/src/pages/MonitoringPage.tsx` | ~1,030 | ✅ Modularized in PR #297; tests pending | [monitoring-page-modularization-followup.md](./monitoring-page-modularization-followup.md) |
| TariffsPage | `apps/web/src/pages/TariffsPage.tsx` | ~1,251 → 106 | ✅ Modularized (page 106 lines; largest module 208) | [tariffs-page-modularization-plan.md](./tariffs-page-modularization-plan.md) |
| DevicesAutomation | `apps/web/src/pages/DevicesAutomation.tsx` | ~1,167 → 80 | ✅ Modularized (page 80 lines; largest module 99) | [devices-automation-modularization-plan.md](./devices-automation-modularization-plan.md) |
| HistoricalAnalyticsPage | `apps/web/src/pages/HistoricalAnalyticsPage.tsx` | ~777 → 101 | ✅ Modularized (page 101 lines; largest module 184) | [historical-analytics-page-modularization-plan.md](./historical-analytics-page-modularization-plan.md) |
| LiveEnergyFlow | `apps/web/src/pages/LiveEnergyFlow.tsx` | ~922 → 72 | ✅ Modularized + mobile bottom-sheet layout (page 72 lines) | [live-energy-flow-modularization-plan.md](./live-energy-flow-modularization-plan.md) |

## Common approach

For every page the same pattern applies:

1. Extract shared types to `components/<page-scope>/types.ts`.
2. Extract static data and helpers to `components/<page-scope>/data/` and `utils.ts`.
3. Extract small presentational components to `components/<page-scope>/`.
4. Extract section components and chart wrappers.
5. Introduce a dedicated data/state hook (`use<XxxData>`) so the page component stays an orchestrator.
6. Add unit / smoke tests for the page and extracted helpers.
7. Run `pnpm lint`, `pnpm type-check`, and `pnpm test:run`.
8. Verify DeepSource JavaScript report improves (hygiene, complexity, no new issues).

## Common acceptance criteria

- Page file under 150 lines after refactor.
- No new component file exceeds 250 lines (ideally under 200).
- Public page export API unchanged.
- All existing behavior preserved.
- New test file added with meaningful coverage.
- Lint, type-check, and unit tests pass.

## When to schedule

These refactors are intentionally **not** part of feature PRs. Schedule them in dedicated `refactor/ui` branches to avoid scope creep and keep reviews focused.

## Related

- `docs/runbooks/pr-review-correction-loop.md`
- `docs/runbooks/deepsource-integration.md`
- `docs/Technical-Debt-Registry.md`
