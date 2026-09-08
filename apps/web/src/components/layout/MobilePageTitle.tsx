import { AnimatePresence, motion } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';

/** Route pathname → i18n label key for the mobile page title. */
const headerRouteLabels: Record<string, string> = {
  '/': 'nav.home',
  '/energy-flow': 'nav.energyFlow',
  '/devices': 'nav.devicesOverview',
  '/agent-collaboration': 'nav.agentCollaboration',
  '/agent-collaboration/monitoring': 'nav.monitoringAgent',
  '/agent-collaboration/diagnosis': 'nav.diagnosisAgent',
  '/agent-collaboration/decision': 'nav.decisionAgent',
  '/knowledge-base': 'nav.knowledgeBase',
  '/analytics': 'nav.analyticsReports',
  '/carbon-reduction': 'nav.carbonReduction',
  '/energy-absorption': 'nav.energyAbsorption',
  '/optimization-ai': 'nav.aiOptimizer',
  '/tariffs': 'nav.tariffs',
  '/monitoring': 'nav.monitoring',
  '/plugins': 'nav.plugins',
  '/settings': 'nav.settings',
  '/settings/ai': 'nav.aiKeys',
  '/settings/hardware': 'nav.hardware',
  '/help': 'nav.help',
};

/**
 * Displays the current page name in the mobile header.
 *
 * Reads the active route from React Router and maps it to an i18n label.
 */
export function MobilePageTitle() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const labelKey = headerRouteLabels[pathname] ?? 'nav.home';

  return (
    <AnimatePresence mode="wait">
      <motion.span
        key={pathname}
        className="min-w-0 truncate font-semibold text-(--color-text) text-sm lg:hidden"
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -4 }}
        transition={{ duration: 0.15 }}
      >
        {t(labelKey)}
      </motion.span>
    </AnimatePresence>
  );
}
