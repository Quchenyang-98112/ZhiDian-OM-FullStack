import type { KeyboardEvent } from 'react';
import type { HelpSearchResult } from '../components/help/HelpSearchBox';

export interface HelpSearchSelectionState {
  normalizedQuery: string;
  activeIndex: number;
}

/** Derive the highlighted result index for the Help search combobox. */
export function resolveHelpSearchActiveIndex(
  searchResults: HelpSearchResult[],
  normalizedQuery: string,
  selectionState: HelpSearchSelectionState,
): number {
  if (searchResults.length === 0) return -1;
  const baseIndex =
    selectionState.normalizedQuery === normalizedQuery ? selectionState.activeIndex : 0;
  if (baseIndex < 0) return 0;
  return Math.min(baseIndex, searchResults.length - 1);
}

/** Build the aria-activedescendant target for the active listbox option. */
export function buildHelpSearchActiveOptionId(
  listboxId: string,
  activeIndex: number,
  resultCount: number,
): string | undefined {
  if (activeIndex < 0 || resultCount === 0) return undefined;
  return `${listboxId}-option-${activeIndex}`;
}

/** Handle arrow/enter/escape keys for the Help search combobox. */
export function handleHelpSearchKeyDown(
  event: KeyboardEvent<HTMLInputElement>,
  searchResults: HelpSearchResult[],
  activeIndex: number,
  setActiveIndex: (index: number) => void,
  onSelectResult: (tab: HelpSearchResult['tab']) => void,
  onDismiss: () => void,
  isOpen: boolean,
): void {
  if (event.key === 'Escape') {
    if (isOpen) {
      event.preventDefault();
      onDismiss();
    }
    return;
  }

  if (!isOpen || searchResults.length === 0) return;

  switch (event.key) {
    case 'ArrowDown':
      event.preventDefault();
      setActiveIndex(Math.min(activeIndex + 1, searchResults.length - 1));
      break;
    case 'ArrowUp':
      event.preventDefault();
      setActiveIndex(Math.max(activeIndex - 1, 0));
      break;
    case 'Home':
      event.preventDefault();
      setActiveIndex(0);
      break;
    case 'End':
      event.preventDefault();
      setActiveIndex(searchResults.length - 1);
      break;
    case 'Enter': {
      const hit = searchResults[activeIndex];
      if (hit) {
        event.preventDefault();
        onSelectResult(hit.tab);
      }
      break;
    }
    default:
      break;
  }
}
