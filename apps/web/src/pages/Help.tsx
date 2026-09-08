import { motion } from 'motion/react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { HelpPageHeader } from '../components/help/HelpPageHeader';
import { HelpSearchBox } from '../components/help/HelpSearchBox';
import { HelpTabContent } from '../components/help/HelpTabContent';
import { HelpTabNav } from '../components/help/HelpTabNav';
import {
  buildHelpSearchEntries,
  filterHelpSearchResults,
  type HelpTab,
} from '../lib/help-search-entries';
import { buildHelpTabs } from '../lib/help-tab-definitions';
import { createHelpTabKeyHandler } from '../lib/help-tab-keyboard';
import { applyHelpTabParam, resolveHelpTab } from '../lib/help-tab-url';

export interface HelpProps {
  /** When true, suppresses the page header (embedded in SettingsUnified). */
  embedded?: boolean;
}

/**
 * Help center with searchable tabs for onboarding, integration guides, FAQ, and about.
 *
 * @param embedded When rendered as the "help" section inside SettingsUnified,
 *   that wrapper already supplies the page header; this page suppresses its own
 *   title block to avoid a duplicate h1. Defaults to false for the standalone /help route.
 */
export const Help = ({ embedded = false }: HelpProps = {}) => {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  const activeTab: HelpTab = resolveHelpTab(tabParam);
  const [searchQuery, setSearchQuery] = useState('');

  const tabs = buildHelpTabs(t);

  const selectTab = (tab: HelpTab) => {
    setSearchParams(applyHelpTabParam(searchParams, tab, { embedded }), { replace: true });
  };

  const handleTabKeyDown = createHelpTabKeyHandler(tabs, activeTab, selectTab);
  const normalizedQuery = searchQuery.trim().toLowerCase();

  const searchResults = useMemo(
    () => filterHelpSearchResults(buildHelpSearchEntries(t), normalizedQuery),
    [normalizedQuery, t],
  );

  const handleSelectSearchResult = (tab: HelpTab) => {
    selectTab(tab);
    setSearchQuery('');
  };

  return (
    <motion.div
      className="mx-auto max-w-5xl"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    >
      {!embedded && <HelpPageHeader />}

      <HelpSearchBox
        searchQuery={searchQuery}
        onSearchQueryChange={setSearchQuery}
        normalizedQuery={normalizedQuery}
        searchResults={searchResults}
        onSelectResult={handleSelectSearchResult}
      />

      <div className="flex flex-col gap-6 lg:flex-row">
        <HelpTabNav
          tabs={tabs}
          activeTab={activeTab}
          onSelectTab={selectTab}
          onKeyDown={handleTabKeyDown}
        />
        <HelpTabContent activeTab={activeTab} />
      </div>
    </motion.div>
  );
};
