# Runbook: MonitoringPage Modularization Follow-up

## Status

Completed in PR #297 (`perf/lint-typecheck-speed`). The monolithic `apps/web/src/pages/MonitoringPage.tsx` was split into `apps/web/src/components/monitoring/` and review feedback was addressed.

## What was done

- Extracted presentational components:
  - `StatusPill`, `ResourceGauge`, `VirtualEventLog`, `AdapterRow`, `MetricCard`, `AlertRuleItem`
- Extracted section components:
  - `SystemHealthBanner`, `MetricCardsGrid`, `LoadChartSection`, `ResourceSection`, `AdapterHealthSection`, `AlertRulesSection`, `EventLogSection`, `GrafanaSection`, `PageActions`
- Extracted shared types into `types.ts`
- Extracted shared helpers into `utils.ts`
- Introduced `useMonitoringData()` hook to keep the page component focused on orchestration
- Combined multiple `useAppStoreShallow` subscriptions into one selector
- Fixed DeepSource hygiene issues:
  - Removed non-null assertion (`events[i]!`)
  - Replaced `ok={true}` with `ok`
  - Renamed short variable names (`h`, `d`, `m`, `lat`, `s`)
  - Reduced cyclomatic complexity by splitting the render tree
- Fixed accessibility gaps:
  - Added `aria-hidden="true"` to decorative icons in `AdapterRow`, `VirtualEventLog` and `ResourceSection`
  - Added screen-reader-only active/inactive labels to `AlertRuleItem`
- Fixed i18n gaps:
  - Localized hardcoded strings in `AdapterRow`, `AlertRuleItem`, `GrafanaSection`, `LoadChartSection`, `ResourceSection`, `SystemHealthBanner`
  - Added new `monitoring.*` keys to `en.ts` and `de.ts`
- Added unit tests for helpers in `utils.test.ts`

## Remaining optional improvements

### 1. Page-level smoke test

A full page smoke test (`apps/web/src/tests/monitoring-page.test.tsx`) is still recommended but was kept out of the refactor PR to limit scope. It should:

- Mock `react-i18next`, `../store`, `../core/useMetrics`, `motion/react`, `recharts`, `PageHeader`, `PageCrossLinks`
- Verify the page title renders
- Verify system health banner shows healthy/degraded state based on mocked `error`
- Verify metric cards render expected values from mocked energy data and metrics
- Verify adapter health and alert rules sections render
- Verify event log and Grafana sections render
- Verify `PageCrossLinks` renders when `embedded={false}` and is hidden when `embedded={true}`

### 2. Optional further decomposition

- Move `buildCoreAdapters`, `buildContribAdapters`, `buildEventLog`, `buildMetricCards`, `buildAlertRules`, `calculateStatuses` into a dedicated `useMonitoringData.ts` file next to the page.
- Consider moving the data builders into the backend or a static config file if they become stable.

## Acceptance criteria for any follow-up

- `pnpm lint` and `pnpm type-check` remain green
- `pnpm --filter @nexus-hems/web test:run` passes
- Codecov patch coverage does not drop

## Owner

AI coding agent / frontend owner.

## Related

- `docs/runbooks/pr-review-correction-loop.md`
- `docs/runbooks/deepsource-integration.md`
