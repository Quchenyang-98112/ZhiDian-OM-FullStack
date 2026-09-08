import { type HelpTab, VALID_HELP_TABS } from './help-search-entries';
import { VALID_SETTINGS_TABS } from './settings-tab-url';

export type SettingsSection = 'settings' | 'plugins' | 'help';

export const VALID_SETTINGS_SECTIONS: readonly SettingsSection[] = [
  'settings',
  'plugins',
  'help',
] as const;

export const DEFAULT_SETTINGS_SECTION: SettingsSection = 'settings';

/** Resolve `?section=` to a valid unified settings section id. */
export function resolveSettingsSection(param: string | null): SettingsSection {
  if (param && (VALID_SETTINGS_SECTIONS as readonly string[]).includes(param)) {
    return param as SettingsSection;
  }
  return DEFAULT_SETTINGS_SECTION;
}

/** Apply unified section to search params, preserving unrelated keys where sensible. */
export function applySettingsSectionParam(
  params: URLSearchParams,
  section: SettingsSection,
): URLSearchParams {
  const next = new URLSearchParams(params);
  if (section === DEFAULT_SETTINGS_SECTION) {
    next.delete('section');
  } else {
    next.set('section', section);
    if (section === 'plugins') {
      next.delete('tab');
    }
  }

  const tab = next.get('tab');
  if (tab) {
    if (section === 'settings' && !(VALID_SETTINGS_TABS as readonly string[]).includes(tab)) {
      next.delete('tab');
    }
    if (section === 'help' && !VALID_HELP_TABS.includes(tab as HelpTab)) {
      next.delete('tab');
    }
  }

  return next;
}
