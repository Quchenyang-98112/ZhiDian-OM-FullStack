import { Search } from 'lucide-react';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { HelpTab } from '../../lib/help-search-entries';
import {
  buildHelpSearchActiveOptionId,
  handleHelpSearchKeyDown,
  resolveHelpSearchActiveIndex,
} from '../../lib/help-search-keyboard';
import { resolveHelpSearchStatusMessage } from '../../lib/help-search-status';
import { HelpSearchResultsPanel } from './HelpSearchResultsPanel';

export interface HelpSearchResult {
  tab: HelpTab;
  title: string;
  body: string;
}

export interface HelpSearchBoxProps {
  searchQuery: string;
  onSearchQueryChange: (value: string) => void;
  normalizedQuery: string;
  searchResults: HelpSearchResult[];
  onSelectResult: (tab: HelpTab) => void;
}

/** Help page search combobox with listbox results and live region announcements. */
export const HelpSearchBox = ({
  searchQuery,
  onSearchQueryChange,
  normalizedQuery,
  searchResults,
  onSelectResult,
}: HelpSearchBoxProps) => {
  const { t } = useTranslation();
  const listboxId = useId();
  const statusId = useId();
  const [dismissedQuery, setDismissedQuery] = useState<string | null>(null);
  const isOpen = normalizedQuery.length >= 2 && dismissedQuery !== normalizedQuery;
  const [selectionState, setSelectionState] = useState({
    normalizedQuery: '',
    activeIndex: -1,
  });
  const activeIndex = resolveHelpSearchActiveIndex(searchResults, normalizedQuery, selectionState);
  const setActiveIndex = (index: number) => {
    setSelectionState({ normalizedQuery, activeIndex: index });
  };
  const statusMessage = resolveHelpSearchStatusMessage(isOpen, searchResults.length, t);
  const activeOptionId = buildHelpSearchActiveOptionId(
    listboxId,
    activeIndex,
    searchResults.length,
  );

  return (
    <div className="relative mb-6">
      <Search
        className="pointer-events-none absolute top-1/2 left-4 h-4 w-4 -translate-y-1/2 text-(--color-muted)"
        aria-hidden="true"
      />
      <input
        type="search"
        value={searchQuery}
        onChange={(e) => {
          setDismissedQuery(null);
          onSearchQueryChange(e.target.value);
        }}
        onKeyDown={(event) =>
          handleHelpSearchKeyDown(
            event,
            searchResults,
            activeIndex,
            setActiveIndex,
            onSelectResult,
            () => setDismissedQuery(normalizedQuery),
            isOpen,
          )
        }
        placeholder={t('help.searchPlaceholder')}
        role="combobox"
        aria-expanded={isOpen}
        aria-controls={isOpen ? listboxId : undefined}
        aria-activedescendant={isOpen ? activeOptionId : undefined}
        aria-autocomplete="list"
        aria-haspopup="listbox"
        aria-describedby={statusId}
        className="w-full rounded-xl border border-(--color-border) bg-(--color-surface) py-3 pr-4 pl-11 text-(--color-text) text-sm transition-all placeholder:text-(--color-muted) focus:border-(--color-primary)/70 focus:outline-none focus:ring-(--color-primary)/20 focus:ring-2"
      />
      <p id={statusId} role="status" aria-live="polite" className="sr-only">
        {statusMessage}
      </p>
      {isOpen && (
        <div className="absolute top-full right-0 left-0 z-20 mt-2 rounded-xl border border-(--color-border) bg-(--color-surface-strong) p-3 shadow-lg">
          <HelpSearchResultsPanel
            listboxId={listboxId}
            searchResults={searchResults}
            activeIndex={activeIndex}
            onSelectResult={onSelectResult}
          />
        </div>
      )}
    </div>
  );
};
