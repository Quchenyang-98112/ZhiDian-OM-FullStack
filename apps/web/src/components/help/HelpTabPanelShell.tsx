import { motion } from 'motion/react';
import type { ReactNode } from 'react';
import type { HelpTab } from '../../lib/help-search-entries';

export interface HelpTabPanelShellProps {
  tabKey: HelpTab;
  children: ReactNode;
  className?: string;
}

/** Animated tabpanel wrapper with shared a11y ids for Help route tabs. */
export const HelpTabPanelShell = ({
  tabKey,
  children,
  className = 'space-y-6',
}: HelpTabPanelShellProps) => (
  <motion.div
    key={tabKey}
    initial={{ opacity: 0, x: 20 }}
    animate={{ opacity: 1, x: 0 }}
    exit={{ opacity: 0, x: -20 }}
    transition={{ duration: 0.3 }}
    className={className}
    role="tabpanel"
    id={`help-tabpanel-${tabKey}`}
    aria-labelledby={`help-tab-${tabKey}`}
  >
    {children}
  </motion.div>
);
