import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import { isLiveSafetyMode } from '../../lib/adapter-mode';
import { getAuthToken, getTokenScope } from '../../lib/auth-token';
import { resolveReadOnlyModeActive } from '../../lib/use-read-only-mode';
import { useAppStoreShallow } from '../../store';
import { useEnergyStoreBase } from '../useEnergyStore';
import type { AuthScope, CommandContext, CommandPalettePreferences } from './types';

export interface UseCommandContextOptions {
  onOptimize?: () => void;
  onExportReport?: () => void;
  closePalette: () => void;
  recordUsage: (commandId: string) => void;
  toggleFavorite: (commandId: string) => void;
  executeHardwareCommand?: (command: import('../adapters/EnergyAdapter').AdapterCommand) => void;
}

/**
 * Resolve the effective JWT scope for command palette authorization.
 * Reads the persisted auth token and returns its scope claim.
 * Falls back to 'readwrite' in dev/anonymous mode so navigation works.
 */
function resolveAuthScope(): AuthScope {
  const rawScope = getTokenScope(getAuthToken());
  if (rawScope === 'read' || rawScope === 'readwrite' || rawScope === 'admin') {
    return rawScope;
  }
  return 'readwrite';
}

/** Stable store fingerprint for adapter status + enabled toggles (command palette). */
export function buildAdapterStoreSnapshotKey(
  adapters: Readonly<Record<string, { status: string; enabled: boolean }>>,
): string {
  return Object.entries(adapters)
    .map(([id, entry]) => `${id}:${entry.status}:${entry.enabled ? 1 : 0}`)
    .sort()
    .join('|');
}

/**
 * Build the read-only command context snapshot for registry providers.
 */
export function useCommandContext(options: UseCommandContextOptions): CommandContext {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();

  const {
    locale,
    theme,
    pvPower,
    batterySoC,
    batteryPower,
    gridPower,
    houseLoad,
    priceCurrent,
    evPower,
    adapterMode,
    backendReadOnly,
    tariffProvider,
    chargeThreshold,
  } = useAppStoreShallow((s) => ({
    locale: s.locale,
    theme: s.theme,
    pvPower: s.energyData.pvPower,
    batterySoC: s.energyData.batterySoC,
    batteryPower: s.energyData.batteryPower,
    gridPower: s.energyData.gridPower,
    houseLoad: s.energyData.houseLoad,
    priceCurrent: s.energyData.priceCurrent,
    evPower: s.energyData.evPower,
    adapterMode: s.adapterMode,
    backendReadOnly: s.backendReadOnly,
    tariffProvider: s.settings.tariffProvider,
    chargeThreshold: s.settings.chargeThreshold,
  }));

  const adapterStatusKey = useEnergyStoreBase((s) => buildAdapterStoreSnapshotKey(s.adapters));

  const adapterStatuses = useMemo(() => {
    const state = useEnergyStoreBase.getState();
    const map = new Map<string, import('../adapters/EnergyAdapter').AdapterStatus>();
    for (const [id, entry] of Object.entries(state.adapters)) {
      map.set(id, entry.status);
    }
    return map;
  }, [adapterStatusKey]);

  const adapterEntries = useMemo(() => {
    const state = useEnergyStoreBase.getState();
    const map = new Map<
      string,
      {
        id: string;
        name: string;
        status: import('../adapters/EnergyAdapter').AdapterStatus;
        enabled: boolean;
      }
    >();
    for (const [id, entry] of Object.entries(state.adapters)) {
      if (!entry.enabled) continue;
      map.set(id, {
        id,
        name: entry.adapter.name,
        status: entry.status,
        enabled: entry.enabled,
      });
    }
    return map;
  }, [adapterStatusKey]);

  return useMemo(
    () => ({
      route: { pathname: location.pathname, search: location.search },
      locale,
      theme,
      energy: {
        pvPower,
        batterySoC,
        batteryPower,
        gridPower,
        houseLoad,
        priceCurrent,
        evPower,
      },
      adapterStatuses,
      adapterEntries,
      tariffProvider,
      chargeThreshold,
      isReadOnly: resolveReadOnlyModeActive(backendReadOnly),
      isLiveMode: isLiveSafetyMode(adapterMode),
      authScope: resolveAuthScope(),
      navigate,
      t,
      actions: {
        closePalette: options.closePalette,
        recordUsage: options.recordUsage,
        toggleFavorite: options.toggleFavorite,
        ...(options.onOptimize !== undefined ? { onOptimize: options.onOptimize } : {}),
        ...(options.onExportReport !== undefined ? { onExportReport: options.onExportReport } : {}),
        ...(options.executeHardwareCommand !== undefined
          ? { executeHardwareCommand: options.executeHardwareCommand }
          : {}),
      },
    }),
    [
      location.pathname,
      location.search,
      locale,
      theme,
      pvPower,
      batterySoC,
      batteryPower,
      gridPower,
      houseLoad,
      priceCurrent,
      evPower,
      adapterStatuses,
      adapterEntries,
      tariffProvider,
      chargeThreshold,
      backendReadOnly,
      adapterMode,
      navigate,
      t,
      options.onOptimize,
      options.onExportReport,
      options.closePalette,
      options.recordUsage,
      options.toggleFavorite,
      options.executeHardwareCommand,
    ],
  );
}

export function getRecentCommandIds(prefs: CommandPalettePreferences): string[] {
  return prefs.recent
    .slice()
    .sort((a, b) => b.ts - a.ts)
    .map((r) => r.id);
}

export function getContextualCommandIds(ctx: CommandContext): string[] {
  const ids: string[] = [];
  const { energy, chargeThreshold } = ctx;

  if (energy.pvPower > energy.houseLoad * 1.2 && energy.pvPower > 0.5) {
    ids.push('energy.optimizeSurplus');
  }
  if (energy.batterySoC < 20) {
    ids.push('energy.viewBattery');
  }
  if (energy.priceCurrent > chargeThreshold) {
    ids.push('energy.viewTariffs');
  }
  if (ctx.adapterStatuses.size > 0) {
    for (const [, status] of ctx.adapterStatuses) {
      if (status === 'error') {
        ids.push('nav-monitoring');
        break;
      }
    }
  }

  return ids;
}
