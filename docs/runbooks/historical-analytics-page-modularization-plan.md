# Runbook: HistoricalAnalyticsPage Modularization Plan

## Current state

`apps/web/src/pages/HistoricalAnalyticsPage.tsx` is a 777-line monolith. It mixes:

- Time-range state and demo data generation (`generateDemoTimeSeries`, `generateDemoForecasts`)
- Timestamp formatting helpers
- Multiple Recharts visualizations (consumption history, forecast overlay, distribution, efficiency)
- AI forecast table and confidence badges
- Export / download actions

## Goal

Move visualization sections and data generation into `apps/web/src/components/historical-analytics/` while keeping the page as a thin orchestrator.

## Proposed module structure

```
apps/web/src/components/historical-analytics/
├── index.ts
├── types.ts                  # TimeRange, AIForecastRecord, etc.
├── utils.ts                  # formatTimestamp, formatting helpers
├── data/
│   ├── constants.ts          # default range, color mapping
│   ├── timeSeries.ts         # generateDemoTimeSeries
│   └── forecasts.ts          # generateDemoForecasts
├── charts/
│   ├── ConsumptionChart.tsx
│   ├── ForecastOverlayChart.tsx
│   ├── DistributionChart.tsx
│   └── EfficiencyChart.tsx
├── sections/
│   ├── HistoricalHeader.tsx       # title + range selector
│   ├── ForecastTable.tsx          # AI forecast rows
│   ├── SummaryCards.tsx           # KPI cards
│   └── ExportActions.tsx          # CSV / JSON download buttons
└── hooks/
    └── useHistoricalAnalytics.ts  # range state + data selection
```

## Step-by-step execution plan

1. **Extract types and data generators**
   - Move `TimeRange`, forecast types and generators to `types.ts` and `data/`.
   - Keep demo data deterministic.

2. **Extract helpers**
   - Move `formatTimestamp` to `utils.ts` with unit tests for each range.

3. **Extract charts**
   - Move each Recharts block into its own component.
   - Pass `data`, `range`, and callback props only.

4. **Extract sections**
   - Header with range selector.
   - Forecast table with confidence badges.
   - Summary KPI cards.
   - Export actions.

5. **Introduce state hook**
   - `useHistoricalAnalytics()` holds `range`, generated series and forecast data.

6. **Simplify the page component**
   - Compose header, summary cards, charts, forecast table and export actions.

7. **Add tests**
   - `historical-analytics-page.test.tsx`: verify range switching updates charts and table.
   - `formatTimestamp.test.ts`: verify formatting for all ranges.
   - Mock `recharts`, `motion/react`, `react-i18next`, `PageHeader`, `PageCrossLinks`.

8. **Run gates**
   - `pnpm --filter @nexus-hems/web lint`
   - `pnpm --filter @nexus-hems/web type-check`
   - `pnpm --filter @nexus-hems/web test:run`

## Acceptance criteria

- `HistoricalAnalyticsPage.tsx` under 150 lines.
- No DeepSource hygiene regressions.
- All time-range switching and export behavior preserved.
- New test file added.

## Related

- `docs/runbooks/monitoring-page-modularization-followup.md`
- `docs/runbooks/pr-review-correction-loop.md`
