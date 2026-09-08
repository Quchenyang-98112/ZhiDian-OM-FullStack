# Runbook: DevicesAutomation Modularization Plan

## Current state

`apps/web/src/pages/DevicesAutomation.tsx` is a 1,167-line monolith. It contains:

- View state (`DeviceView`, `DeviceCategory`)
- Static device catalog (`DEVICES`)
- Many nested presentational components in one file:
  - `DeviceCard`, `DeviceInlineDetails`, `DeviceStatusBadge`, `DeviceMetricRow`
  - `QuickAction`, `BatteryQuickAction`, `EVQuickAction`, `HeatPumpQuickAction`, `BuildingQuickAction`
  - `DeviceDetailDialog`, `DeviceDetailContent`
  - Per-device detail panels: `PVDetail`, `StorageDetail`, `EVDetail`, `HeatPumpDetail`, `BuildingDetail`
  - `MetricRow`, `GaugeBar`
- Lazy-loaded `Floorplan` component
- Dialog and command flows mixed with the page layout

## Goal

Split into `apps/web/src/components/devices-automation/` so each device category and shared primitive has its own file, while preserving the public page API.

## Proposed module structure

```
apps/web/src/components/devices-automation/
├── index.ts
├── types.ts
├── constants.ts              # DEVICES catalog, category meta
├── utils.ts                  # getDeviceStatus, formatting helpers
├── hooks/
│   └── useDevicesAutomation.ts   # view state, selected device, dialog state
├── layout/
│   ├── DevicesToolbar.tsx    # category tabs + view toggle
│   └── DevicesGrid.tsx       # grid of DeviceCard
├── cards/
│   ├── DeviceCard.tsx
│   ├── DeviceInlineDetails.tsx
│   └── DeviceMetricRow.tsx
├── status/
│   └── DeviceStatusBadge.tsx
├── quick-actions/
│   ├── QuickAction.tsx
│   ├── BatteryQuickAction.tsx
│   ├── EVQuickAction.tsx
│   ├── HeatPumpQuickAction.tsx
│   └── BuildingQuickAction.tsx
├── detail/
│   ├── DeviceDetailDialog.tsx
│   ├── DeviceDetailContent.tsx
│   ├── PVDetail.tsx
│   ├── StorageDetail.tsx
│   ├── EVDetail.tsx
│   ├── HeatPumpDetail.tsx
│   └── BuildingDetail.tsx
├── floorplan/
│   └── Floorplan.tsx         # move lazy import here or keep in pages
└── shared/
    └── MetricRow.tsx
```

## Step-by-step execution plan

1. **Extract types and constants**
   - Move `DeviceView`, `DeviceCategory`, `DeviceDefinition`, `CommandType` etc. to `types.ts`.
   - Move `DEVICES` and category configuration to `constants.ts`.

2. **Extract shared primitives**
   - `MetricRow`, `DeviceStatusBadge`, `DeviceMetricRow` first.
   - Then `DeviceInlineDetails`.

3. **Extract cards**
   - `DeviceCard` using the already-extracted primitives.

4. **Extract quick actions**
   - One file per device-category quick action plus a shared `QuickAction` wrapper.

5. **Extract detail panels**
   - `DeviceDetailDialog` + `DeviceDetailContent`.
   - One file per device detail panel.

6. **Extract layout sections**
   - `DevicesToolbar` and `DevicesGrid`.

7. **Introduce state hook**
   - `useDevicesAutomation()` encapsulates `view`, `category`, `selectedDevice`, `dialogOpen`.

8. **Simplify the page component**
   - `DevicesAutomation` should only render `DevicesToolbar`, `DevicesGrid`/`Floorplan`, and `DeviceDetailDialog`.

9. **Add tests**
   - `devices-automation.test.tsx`: smoke test category switching, dialog open/close, quick actions.
   - `getDeviceStatus.test.ts`: boundary tests for status derivation.
   - Mock `react-i18next`, `motion/react`, `useAppStoreShallow`, `PageHeader`, `PageCrossLinks`, and heavy chart libs.

10. **Run gates**
    - `pnpm --filter @nexus-hems/web lint`
    - `pnpm --filter @nexus-hems/web type-check`
    - `pnpm --filter @nexus-hems/web test:run`

## Acceptance criteria

- `DevicesAutomation.tsx` under 150 lines.
- No component file exceeds 250 lines after split.
- All existing dialogs, quick actions and detail panels remain functional.
- DeepSource complexity and hygiene issues resolved.
- New test file with category-switch and dialog coverage.

## Risks

- `Floorplan` is lazy-loaded; ensure the dynamic import path is updated and still chunked correctly.
- Command-safety hooks are used inside quick actions; tests need to mock those hooks or wrap with providers.

## Related

- `docs/runbooks/monitoring-page-modularization-followup.md`
- `docs/runbooks/pr-review-correction-loop.md`
