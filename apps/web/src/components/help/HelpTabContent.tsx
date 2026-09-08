import { AnimatePresence } from 'motion/react';
import type { ComponentType } from 'react';
import type { HelpTab } from '../../lib/help-search-entries';
import { HelpAboutPanel } from './panels/HelpAboutPanel';
import { HelpFaqPanel } from './panels/HelpFaqPanel';
import { HelpFeaturesPanel } from './panels/HelpFeaturesPanel';
import { HelpGettingStartedPanel } from './panels/HelpGettingStartedPanel';
import { HelpIntegrationPanel } from './panels/HelpIntegrationPanel';
import { HelpLexiconPanel } from './panels/HelpLexiconPanel';
import { HelpShortcutsPanel } from './panels/HelpShortcutsPanel';
import { HelpTroubleshootingPanel } from './panels/HelpTroubleshootingPanel';

const HELP_TAB_PANELS: Record<HelpTab, ComponentType> = {
  'getting-started': HelpGettingStartedPanel,
  integration: HelpIntegrationPanel,
  features: HelpFeaturesPanel,
  lexicon: HelpLexiconPanel,
  faq: HelpFaqPanel,
  shortcuts: HelpShortcutsPanel,
  troubleshooting: HelpTroubleshootingPanel,
  about: HelpAboutPanel,
};

export interface HelpTabContentProps {
  activeTab: HelpTab;
}

/** Renders the active Help tab panel with enter/exit animation. */
export const HelpTabContent = ({ activeTab }: HelpTabContentProps) => {
  const Panel = HELP_TAB_PANELS[activeTab];

  return (
    <div className="min-w-0 flex-1">
      <AnimatePresence mode="wait">
        <Panel key={activeTab} />
      </AnimatePresence>
    </div>
  );
};
