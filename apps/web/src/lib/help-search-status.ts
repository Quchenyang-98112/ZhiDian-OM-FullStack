import type { TFunction } from 'i18next';

/** Live-region message for the Help search combobox. */
export function resolveHelpSearchStatusMessage(
  isOpen: boolean,
  resultCount: number,
  t: TFunction,
): string {
  if (!isOpen) return '';
  if (resultCount === 0) return t('help.searchNoResults');
  return t('help.searchResultsCount', { count: resultCount });
}
