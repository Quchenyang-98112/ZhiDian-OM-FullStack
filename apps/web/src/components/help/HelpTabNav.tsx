import type { KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { HelpTab } from '../../lib/help-search-entries';

export interface HelpTabNavProps {
  tabs: { key: HelpTab; icon: React.ReactNode; label: string }[];
  activeTab: HelpTab;
  onSelectTab: (tab: HelpTab) => void;
  onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void;
}

/** Vertical/horizontal tab list for the Help page sidebar. */
export const HelpTabNav = ({ tabs, activeTab, onSelectTab, onKeyDown }: HelpTabNavProps) => {
  const { t } = useTranslation();

  return (
    <nav className="w-full shrink-0 lg:w-56">
      <div
        className="scrollbar-hide flex gap-1 overflow-x-auto pb-2 lg:flex-col lg:overflow-visible lg:pb-0"
        role="tablist"
        aria-label={t('help.title')}
        onKeyDown={onKeyDown}
      >
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => onSelectTab(tab.key)}
            role="tab"
            aria-selected={activeTab === tab.key}
            aria-controls={`help-tabpanel-${tab.key}`}
            id={`help-tab-${tab.key}`}
            tabIndex={activeTab === tab.key ? 0 : -1}
            className={`flex items-center gap-2.5 whitespace-nowrap rounded-xl px-4 py-2.5 font-medium text-sm transition-all duration-200 active:scale-[0.97] ${
              activeTab === tab.key
                ? 'bg-(--color-primary)/15 text-(--color-primary) shadow-[inset_0_0_0_1px_var(--color-primary)/20]'
                : 'text-(--color-muted) hover:bg-white/5 hover:text-(--color-text)'
            }`}
          >
            {tab.icon}
            <span>{tab.label}</span>
          </button>
        ))}
      </div>
    </nav>
  );
};
