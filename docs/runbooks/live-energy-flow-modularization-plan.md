# Runbook: LiveEnergyFlow Modularization Plan

## Current state

`apps/web/src/pages/LiveEnergyFlow.tsx` is a 922-line monolith. It contains:

- Custom hook `useDraggable` for floating panel positioning
- Panel state (`PanelId`) and `LiveEnergyFlowComponent` main render
- Multiple floating device panels:
  - `FloatingDevicePanel`
  - `PanelTitle`
  - `EVPanel`, `HeatPumpPanel`, `BatteryPanel`, `KNXPanel`, `StatsPanel`
- Shared primitives: `GaugeBar`
- Command dispatching for hardware control mixed into panels

## Goal

Split into `apps/web/src/components/live-energy-flow/` so each panel and the drag-layout logic is isolated, while preserving live command safety and the public page API.

## Proposed module structure

```
apps/web/src/components/live-energy-flow/
├── index.ts
├── types.ts                  # Position, PanelId, CommandType
├── utils.ts                  # panel position helpers, clamping
├── hooks/
│   ├── useDraggable.ts       # drag logic extracted from page
│   └── useLiveEnergyFlow.ts  # open panels, command dispatch
├── layout/
│   ├── LiveEnergyCanvas.tsx  # background + energy nodes + draggable panels
│   └── FloatingDevicePanel.tsx
├── panels/
│   ├── PanelTitle.tsx
│   ├── EVPanel.tsx
│   ├── HeatPumpPanel.tsx
│   ├── BatteryPanel.tsx
│   ├── KNXPanel.tsx
│   └── StatsPanel.tsx
└── shared/
    └── GaugeBar.tsx
```

## Step-by-step execution plan

1. **Extract types and helpers**
   - Move `Position`, `PanelId`, command types to `types.ts`.
   - Add any drag-boundary helpers to `utils.ts`.

2. **Extract `useDraggable`**
   - Move into `hooks/useDraggable.ts`.
   - Add unit tests for position clamping and pointer event handling.

3. **Extract shared primitives**
   - `GaugeBar` to `shared/GaugeBar.tsx`.

4. **Extract panels**
   - One file per panel under `panels/`.
   - Each panel receives `sendCommand`, `onClose` and device state props.
   - Keep command-safety hooks inside panels where they are used.

5. **Extract layout canvas**
   - `LiveEnergyCanvas` renders the energy-flow background, nodes and `FloatingDevicePanel`s.

6. **Introduce state hook**
   - `useLiveEnergyFlow()` manages which panels are open and command dispatch.

7. **Simplify the page component**
   - `LiveEnergyFlowComponent` should render `LiveEnergyCanvas` and import `useLiveEnergyFlow`.

8. **Add tests**
   - `live-energy-flow.test.tsx`: verify panels open/close and render correct titles.
   - `useDraggable.test.ts`: verify position updates and boundary clamping.
   - Mock `motion/react`, `react-i18next`, `useAppStoreShallow`, `useEnergyStore`, `PageHeader`, `PageCrossLinks`, and command-safety hooks.

9. **Run gates**
   - `pnpm --filter @nexus-hems/web lint`
   - `pnpm --filter @nexus-hems/web type-check`
   - `pnpm --filter @nexus-hems/web test:run`

## Acceptance criteria

- `LiveEnergyFlow.tsx` under 150 lines.
- No panel file exceeds 250 lines.
- Drag positioning still works across screen sizes.
- All hardware command flows still pass through `command-safety.ts` guards.
- DeepSource hygiene issues resolved.
- New test file added.

## Risks

- Drag logic has DOM measurements; tests need `jsdom` pointer events and correct bounding rects.
- Hardware commands are safety-critical; ensure mocks do not bypass command validation in production.

## Related

- `docs/runbooks/monitoring-page-modularization-followup.md`
- `docs/runbooks/pr-review-correction-loop.md`
