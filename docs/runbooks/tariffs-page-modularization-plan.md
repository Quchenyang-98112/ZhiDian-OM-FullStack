# Runbook: TariffsPage Modularization Plan

## Current state

`apps/web/src/pages/TariffsPage.tsx` is a 1,251-line monolith. It mixes:

- Static simulated data generation (`HOURS_48`, `PRICE_TIMELINE`, `HEATMAP_DATA`, `PRICE_BINS`, `CHARGE_WINDOWS`, `MONTHLY_DAYS`)
- Color / formatting helpers (`getPriceColor`, `getHeatmapBg`)
- Multiple chart sections (48h price curve, 7-day heatmap, histogram, monthly comparison, charge windows)
- Optimization cards and action buttons
- `LivePriceWidget` and `PredictiveForecast` integrations

## Goal

Split the page into focused, testable modules under `apps/web/src/components/tariffs/` while preserving the public page API and behavior.

## Proposed module structure

```
apps/web/src/components/tariffs/
├── index.ts
├── types.ts
├── utils.ts
├── data/
│   ├── constants.ts        # NOW, HOURS_48, PRICE_TIMELINE, PRICES, PRICE_MIN/MAX/AVG/SPREAD
│   ├── heatmap.ts          # HEATMAP_DATA generator
│   ├── histogram.ts        # PRICE_BINS generator
│   ├── chargeWindows.ts    # CHARGE_WINDOWS generator
│   └── monthly.ts          # MONTHLY_DAYS / MONTHLY_TOTAL / MONTHLY_SAVINGS
├── charts/
│   ├── PriceCurveChart.tsx      # 48h area chart
│   ├── PriceHeatmap.tsx         # 7-day heatmap grid
│   ├── PriceHistogram.tsx       # bar chart distribution
│   └── MonthlyComparisonChart.tsx
├── sections/
│   ├── TariffHeader.tsx         # title, live pill, summary stats
│   ├── PriceInsightsCards.tsx   # min / max / avg / spread cards
│   ├── ChargeWindowCards.tsx    # best charge / discharge windows
│   ├── OptimizationActions.tsx  # EV, heat pump, battery action buttons
│   └── SavingsSummary.tsx       # monthly totals and forecast
└── helpers/
    ├── getPriceColor.ts
    └── getHeatmapBg.ts
```

## Step-by-step execution plan

1. **Extract types and static data**
   - Move `TimeRange`-like types and all data generators to `data/` and `types.ts`.
   - Keep data deterministic (no `Math.random`) to keep tests stable.

2. **Extract helpers**
   - Move `getPriceColor` and `getHeatmapBg` to `utils.ts` with unit tests.

3. **Extract chart sections**
   - Move each Recharts block into its own component under `charts/`.
   - Pass only required data as props.

4. **Extract UI sections**
   - Move header, insight cards, charge windows, optimization actions and savings summary into `sections/`.

5. **Refactor the page component**
   - `TariffsPageComponent` should only compose sections and import data.
   - Optional: introduce a `useTariffsData()` hook if dynamic state is added later.

6. **Add tests**
   - `tariffs-page.test.tsx`: smoke test rendering all sections.
   - `tariffs-utils.test.ts`: verify `getPriceColor` and `getHeatmapBg` boundaries.
   - Mock `recharts`, `motion/react`, `react-i18next`, `PageHeader`, `PageCrossLinks`, `LivePriceWidget`, `PredictiveForecast`.

7. **Run gates**
   - `pnpm --filter @nexus-hems/web lint`
   - `pnpm --filter @nexus-hems/web type-check`
   - `pnpm --filter @nexus-hems/web test:run`

## Acceptance criteria

- `TariffsPage.tsx` under 150 lines.
- No DeepSource hygiene regressions (complexity, short names, boolean attrs, non-null assertions).
- All existing user-facing behavior preserved.
- New test file added with >80% coverage for extracted helpers.

## Risks

- Static data generators are large; moving them must not break import order or side effects.
- Charts rely on shared `NOW` constant; ensure all components use the same reference if needed.

## Related

- `docs/runbooks/monitoring-page-modularization-followup.md`
- `docs/runbooks/pr-review-correction-loop.md`
