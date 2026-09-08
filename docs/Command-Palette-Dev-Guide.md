# Command Palette — Developer Guide

Register commands via the **Command Registry** (`apps/web/src/core/commands/`).

## Quick start

```typescript
import { registerCommand } from '@/core/commands';

registerCommand({
  id: 'my-feature.action',
  labelKey: 'myFeature.action',
  category: 'action',
  risk: 'safe',
  source: 'core',
  keywords: ['example'],
  execute: (ctx) => {
    ctx.navigate('/my-route');
    ctx.actions.closePalette();
  },
});
```

Add `labelKey` to **both** `apps/web/src/locales/en.ts` and `de.ts`.

## Dynamic commands (adapters)

```typescript
import { registerCommandProvider, unregisterCommandProvider } from '@/core/commands';

registerCommandProvider({
  id: 'my-adapter',
  priority: 100,
  getCommands: (ctx) => [
    /* CommandDefinition[] */
  ],
});

// on adapter stop:
unregisterCommandProvider('my-adapter');
```

## Safety

| `risk` | Behavior |
|--------|----------|
| `safe` | Execute immediately |
| `moderate` | Route through `useSafeCommand` when `hardwareCommand` is set |
| `danger` | Route through `useSafeCommand` via `hardwareCommand` |
| `admin` | Requires `authScope: 'admin'` + hardware bridge when applicable |

Set `blockedInReadOnly: true` for hardware control commands.

### Hardware commands (Phase 2+)

```typescript
registerCommand({
  id: 'device.stopEvCharging',
  labelKey: 'command.stopEvCharging',
  category: 'device',
  risk: 'danger',
  blockedInReadOnly: true,
  source: 'core',
  hardwareCommand: { type: 'STOP_CHARGING', value: true },
  execute: (ctx) => ctx.actions.closePalette(),
});
```

Mount the palette via `CommandPaletteWithSafety` in `AppShell` so `executeHardwareCommand`
wires to `useSafeCommand` (confirmation dialog, validation, audit trail).

### Adapter provider

`adapterCommandsProvider` reads `ctx.adapterEntries` and emits per-adapter settings +
reconnect commands. Register additional providers with `registerCommandProvider` and
`unregisterCommandProvider` on adapter unload. Phase 3 adds tariff-provider shortcuts,
hardware catalog commands (EV start/stop, battery force charge), and lifecycle cleanup in
`removeContribAdapter`.

## AI suggestions (Phase 4)

Rule-based suggestions — **not** LLM calls. Enable **Settings → Advanced → Experimental
features** (`settings.experimentalFeatures`) to surface the `ai` section in the palette.

```typescript
import { collectCommandDefinitions } from '@/core/commands';
import { useAppStore } from '@/store';

const experimental = useAppStore.getState().settings.experimentalFeatures;
const commands = collectCommandDefinitions(ctx); // AI mirrors when experimental is true
```

- Mirrors are injected in `collectCommandDefinitions` when
  `useAppStore.getState().settings.experimentalFeatures` is true (Settings → Advanced).
- Commands use `source: 'ai'`, `category: 'ai'`; labels/previews reuse mirrored core commands.
- Hardware mirrors (`startEvCharging`, `batteryForceCharge`) keep `hardwareCommand` from the device catalog.
- Add section title via existing `command.categoryAi` in locale files.

## Architecture

See `docs/adr/ADR-028-command-palette-registry.md`.
