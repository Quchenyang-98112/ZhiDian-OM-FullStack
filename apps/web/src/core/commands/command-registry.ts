import { useAppStore } from '../../store';
import { getContextualCommandIds } from './command-context';
import { BATTERY_CHARGING_POWER_W, EV_ACTIVE_POWER_W } from './device-command-thresholds';
import type {
  CommandContext,
  CommandDefinition,
  CommandListSection,
  CommandProvider,
  ResolvedCommand,
} from './types';

const registry = new Map<string, CommandDefinition>();
const providers: CommandProvider[] = [];
let coreBootstrapped = false;

const AI_CONTEXTUAL_MIRROR: Record<string, string> = {
  'energy.optimizeSurplus': 'ai.suggest.optimizeSurplus',
  'energy.viewBattery': 'ai.suggest.viewBattery',
  'energy.viewTariffs': 'ai.suggest.viewTariffs',
  'nav-monitoring': 'ai.suggest.checkMonitoring',
};

const SCOPE_RANK: Record<string, number> = { read: 0, readwrite: 1, admin: 2 };

function hasScope(ctx: CommandContext, required?: CommandDefinition['requiredScope']): boolean {
  if (!required) return true;
  return (SCOPE_RANK[ctx.authScope] ?? 0) >= (SCOPE_RANK[required] ?? 0);
}

function isVisible(cmd: CommandDefinition, ctx: CommandContext): boolean {
  if (cmd.when && !cmd.when(ctx)) return false;
  return true;
}

function resolveDisabled(
  cmd: CommandDefinition,
  ctx: CommandContext,
): { disabled: boolean; disabledReasonKey?: string } {
  if (cmd.blockedInReadOnly && ctx.isReadOnly) {
    return { disabled: true, disabledReasonKey: 'mode.readOnlyBlocked' };
  }
  if (!hasScope(ctx, cmd.requiredScope)) {
    return { disabled: true, disabledReasonKey: 'command.insufficientScope' };
  }
  return { disabled: false };
}

/**
 * Register a single command. Duplicate ids are skipped (dev warns).
 */
export function registerCommand(cmd: CommandDefinition): void {
  if (registry.has(cmd.id)) {
    if (import.meta.env.DEV) {
      console.warn('[CommandRegistry] Command already registered, skipping:', cmd.id);
    }
    return;
  }
  registry.set(cmd.id, cmd);
}

/** Register a dynamic command provider (adapters, plugins). */
export function registerCommandProvider(provider: CommandProvider): void {
  if (providers.some((p) => p.id === provider.id)) {
    if (import.meta.env.DEV) {
      console.warn('[CommandRegistry] Provider already registered, skipping:', provider.id);
    }
    return;
  }
  providers.push(provider);
  providers.sort((a, b) => a.priority - b.priority);
}

export function unregisterCommandsBySource(
  source: CommandDefinition['source'],
  adapterId?: string,
): void {
  for (const [id, cmd] of registry.entries()) {
    if (cmd.source !== source) continue;
    if (adapterId && cmd.adapterId !== adapterId) continue;
    registry.delete(id);
  }
}

export function unregisterCommandProvider(providerId: string): void {
  const idx = providers.findIndex((p) => p.id === providerId);
  if (idx >= 0) providers.splice(idx, 1);
}

export function clearCommandRegistryForTests(): void {
  registry.clear();
  providers.length = 0;
  coreBootstrapped = false;
}

export function markCoreProvidersBootstrapped(): void {
  coreBootstrapped = true;
}

export function isCoreProvidersBootstrapped(): boolean {
  return coreBootstrapped;
}

function cloneAiSuggestionCommand(mirrored: CommandDefinition, id: string): CommandDefinition {
  return { ...mirrored, id, category: 'ai', source: 'ai' };
}

/** Collect all command definitions visible in the current context. */
export function collectCommandDefinitions(ctx: CommandContext): CommandDefinition[] {
  const seen = new Set<string>();
  const merged: CommandDefinition[] = [];

  const add = (cmd: CommandDefinition) => {
    if (seen.has(cmd.id)) {
      if (import.meta.env.DEV) {
        console.warn('[CommandRegistry] Duplicate command id skipped:', cmd.id);
      }
      return;
    }
    if (!isVisible(cmd, ctx)) return;
    seen.add(cmd.id);
    merged.push(cmd);
  };

  for (const cmd of registry.values()) {
    add(cmd);
  }

  for (const provider of providers) {
    try {
      for (const cmd of provider.getCommands(ctx)) add(cmd);
    } catch (err) {
      if (import.meta.env.DEV) {
        console.warn('[CommandRegistry] Provider failed:', provider.id, err);
      }
    }
  }

  if (useAppStore.getState().settings.experimentalFeatures) {
    const pushAiMirror = (mirrorId: string, id: string) => {
      const mirrored = registry.get(mirrorId);
      if (!mirrored || !isVisible(mirrored, ctx)) return;
      add(cloneAiSuggestionCommand(mirrored, id));
    };

    for (const mirrorId of getContextualCommandIds(ctx)) {
      const id = AI_CONTEXTUAL_MIRROR[mirrorId];
      if (id) pushAiMirror(mirrorId, id);
    }

    const { energy, chargeThreshold } = ctx;
    if (
      energy.evPower < EV_ACTIVE_POWER_W &&
      energy.pvPower > energy.houseLoad * 1.1 &&
      energy.pvPower > 0.5
    ) {
      pushAiMirror('device.startEvCharging', 'ai.suggest.startEvCharging');
    }
    if (
      energy.batterySoC < 90 &&
      energy.batteryPower < BATTERY_CHARGING_POWER_W &&
      energy.priceCurrent < chargeThreshold
    ) {
      pushAiMirror('device.batteryForceCharge', 'ai.suggest.batteryForceCharge');
    }
  }

  return merged;
}

export interface ResolveCommandsOptions {
  query: string;
  recentIds: string[];
  favoriteIds: string[];
  contextualIds: string[];
  scoreFn: (
    cmd: CommandDefinition,
    label: string,
    query: string,
    boosts: { recent: boolean; favorite: boolean; contextual: boolean },
  ) => number;
}

const SECTION_SORT_ORDER: CommandListSection[] = [
  'recent',
  'favorites',
  'contextual',
  'action',
  'energy',
  'navigation',
  'device',
  'settings',
  'adapter',
  'ai',
  'system',
];

/** Resolve, score, and annotate commands for palette rendering. */
export function resolveCommands(
  ctx: CommandContext,
  options: ResolveCommandsOptions,
): ResolvedCommand[] {
  const definitions = collectCommandDefinitions(ctx);
  const favoriteSet = new Set(options.favoriteIds);
  const recentSet = new Set(options.recentIds);
  const contextualSet = new Set(options.contextualIds);

  const resolved: ResolvedCommand[] = definitions.map((cmd) => {
    const labelParams = cmd.labelParams?.(ctx);
    const label = labelParams ? ctx.t(cmd.labelKey, labelParams) : ctx.t(cmd.labelKey);
    const description = cmd.descriptionKey
      ? labelParams
        ? ctx.t(cmd.descriptionKey, labelParams)
        : ctx.t(cmd.descriptionKey)
      : undefined;
    const { disabled, disabledReasonKey } = resolveDisabled(cmd, ctx);
    const isFavorite = favoriteSet.has(cmd.id);
    const isRecent = recentSet.has(cmd.id);
    const isContextual = contextualSet.has(cmd.id);

    const score = options.scoreFn(cmd, label, options.query, {
      recent: isRecent,
      favorite: isFavorite,
      contextual: isContextual,
    });

    let section: CommandListSection = cmd.category;
    if (isRecent && !options.query) section = 'recent';
    else if (isFavorite && !options.query) section = 'favorites';
    else if (isContextual && !options.query) section = 'contextual';

    const base: ResolvedCommand = {
      ...cmd,
      label,
      score,
      disabled,
      isFavorite,
      section,
    };
    if (description !== undefined) base.description = description;
    if (disabledReasonKey !== undefined) base.disabledReasonKey = disabledReasonKey;
    return base;
  });

  const filtered = options.query.trim().length > 0 ? resolved.filter((c) => c.score > 0) : resolved;

  filtered.sort((a, b) => {
    const rank = (section: ResolvedCommand['section']) => {
      const index = SECTION_SORT_ORDER.indexOf(section);
      return index === -1 ? SECTION_SORT_ORDER.length : index;
    };
    const sa = rank(a.section);
    const sb = rank(b.section);
    if (sa !== sb) return sa - sb;
    return b.score - a.score || a.label.localeCompare(b.label);
  });

  return filtered;
}

export type { CommandProvider };
