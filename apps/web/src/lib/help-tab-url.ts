import type { HelpTab } from './help-search-entries';
import { VALID_HELP_TABS } from './help-search-entries';

export const DEFAULT_HELP_TAB: HelpTab = 'getting-started';

/** Resolve `?tab=` to a valid help tab id. */
export function resolveHelpTab(param: string | null): HelpTab {
  if (param && VALID_HELP_TABS.includes(param as HelpTab)) {
    return param as HelpTab;
  }
  return DEFAULT_HELP_TAB;
}

/** Apply help tab to search params; when embedded, preserve `section=help`. */
export function applyHelpTabParam(
  params: URLSearchParams,
  tab: HelpTab,
  options?: { embedded?: boolean },
): URLSearchParams {
  const next = new URLSearchParams(params);
  if (options?.embedded) {
    next.set('section', 'help');
  }
  if (tab === DEFAULT_HELP_TAB) {
    next.delete('tab');
  } else {
    next.set('tab', tab);
  }
  return next;
}
