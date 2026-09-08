# ADR-028: Command Palette Registry & Extensibility

- **Status:** Accepted (Phase 0+1 shipped; Phase 2 shipped; Phase 3 shipped; Phase 4 shipped)
- **Date:** 2026-07-04 (updated 2026-07-05 — Phase 4 shipped)
- **Deciders:** Maintainer
- **Related:** ADR-002 (Zustand dual-store), ADR-019 (adapter registry), `apps/web/src/core/command-safety.ts`, `docs/UI-UX-Audit-2026.md` (C1)

## Context

The Command Palette (`CommandPalette.tsx`) was a monolithic component with 15 hardcoded
commands, substring search, no adapter extensibility, and DOM-coupled actions (`#ai-optimizer`,
`[data-export-report]`). It did not integrate with `command-safety.ts`, Read-Only Mode, or
`useEnergyStore`. The UI-UX audit (C1) flagged insufficient coverage for 13 adapters and
power-user workflows.

## Decision

1. **Introduce a Command Registry** mirroring `adapter-registry.ts`: static registration,
   provider pattern for dynamic commands, versioned `CommandDefinition` schema.
2. **Split UI from logic**: `apps/web/src/core/commands/` (registry, search, context,
   executor) + `apps/web/src/components/command-palette/` (presentation).
3. **Safety-first execution**: hardware-risk commands route through `useSafeCommand` (Phase 2+);
   Read-Only Mode and scope gates applied at resolve/execute time.
4. **Search**: lightweight custom scorer (no `cmdk` / `fuse.js`) to protect bundle budget;
   `@tanstack/react-virtual` for list virtualization (already a dependency).
5. **Persist recency/favorites** in `useAppStore` (`commandPalette` slice).
6. **Honor `settings.keyboardShortcuts`** for global shortcut registration.

## Phased rollout

| Phase | PR | Scope | Status |
|-------|-----|-------|--------|
| **0+1** | #271 | Registry, providers, search scorer, context hook, navigation/settings/energy/system commands, recency/favorites, `CommandPalette` split | Shipped |
| **2** | #272 | `CommandPaletteWithSafety` + `useSafeCommand` bridge; `adapterCommandsProvider`; list virtualization; `hardwareCommand` on device actions | Shipped |
| **3** | #273 | Tariff-provider shortcuts; EV/battery hardware catalog; `batteryPower` in context; `unregisterCommandProvider` on contrib unload; resilient adapter `destroy()` | Shipped |
| **4** | #274 | Rule-based **AI suggestions** (`source: 'ai'`, category `ai`); gated by `settings.experimentalFeatures`; registry mirror injection; dedicated palette section | Shipped |
| **4+** | — | Natural-language / voice input; LLM-ranked suggestions | Planned |

### Phase 4 — AI suggestions (rule-based)

- **No LLM calls** in Phase 4. Suggestions are deterministic rules in `collectCommandDefinitions`,
  cloning registered core commands when `experimentalFeatures` is enabled.
- **Gate:** `settings.experimentalFeatures` (Settings → Advanced). When off, no AI mirrors are injected.
- **Six rules** (each mirrors an existing core command where applicable):
  1. PV surplus → optimize (`energy.optimizeSurplus`)
  2. PV surplus + idle EV → start charging (`device.startEvCharging`, moderate + hardware)
  3. Low SoC + cheap price → force battery charge (`device.batteryForceCharge`, moderate + hardware)
  4. High price → view tariffs (`energy.viewTariffs`)
  5. Low SoC → view battery (`energy.viewBattery`)
  6. Adapter error → monitoring (`nav-monitoring`)
- **Presentation:** `source: 'ai'`, `category: 'ai'`, section header `command.categoryAi`.
- **Safety:** hardware suggestions reuse Phase 2 `hardwareCommand` + `CommandPaletteWithSafety`.

## Consequences

- **Positive:** Extensible commands from adapters/plugins; faster search; WCAG touch-target fix;
  deep-link navigation; contextual + AI suggestion surfaces without DOM coupling.
- **Negative:** More files and indirection; providers must unregister on adapter unload;
  experimental gate required so AI section does not confuse non-power users.
- **Migration:** `ui/CommandPalette.tsx` re-exports from `command-palette/` for one release.

## Non-Goals (this ADR)

- Natural-language / voice input (Phase 4+)
- LLM inference inside the palette hot path (Phase 4+)
- Full adapter-generated hardware command surface beyond catalog shortcuts (ongoing via providers)
