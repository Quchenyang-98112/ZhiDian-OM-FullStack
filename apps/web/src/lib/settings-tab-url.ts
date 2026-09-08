import type { SettingsTab } from './settings-tab-types';

export const VALID_SETTINGS_TABS: readonly SettingsTab[] = [
  'appearance',
  'system',
  'energy',
  'controllers',
  'adapters',
  'security',
  'certificates',
  'storage',
  'notifications',
  'advanced',
  'ai',
] as const;

export const DEFAULT_SETTINGS_TAB: SettingsTab = 'appearance';

/** Resolve `?tab=` to a valid settings tab id (URL is source of truth). */
export function resolveSettingsTab(param: string | null): SettingsTab {
  if (param && (VALID_SETTINGS_TABS as readonly string[]).includes(param)) {
    return param as SettingsTab;
  }
  return DEFAULT_SETTINGS_TAB;
}

/** Apply settings tab to search params, preserving unrelated keys (e.g. `section=help`). */
export function applySettingsTabParam(params: URLSearchParams, tab: SettingsTab): URLSearchParams {
  const next = new URLSearchParams(params);
  if (tab === DEFAULT_SETTINGS_TAB) {
    next.delete('tab');
  } else {
    next.set('tab', tab);
  }
  return next;
}
