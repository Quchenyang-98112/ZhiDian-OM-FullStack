// ─── PageCrossLinks — Contextual navigation footer for every feature page ───
// Shows: related pages, settings shortcuts, setup progress, and help links.

import { motion } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';
import { SETUP_STEPS } from '../../lib/page-relations';
import { useAppStoreShallow } from '../../store';
import { QuickSettingsSection } from './cross-links/QuickSettingsSection';
import { RelatedPagesSection } from './cross-links/RelatedPagesSection';
import { resolvePageCrossLinks } from './cross-links/resolve-page-cross-links';
import { SetupProgressSection } from './cross-links/SetupProgressSection';

/** Contextual related pages, settings shortcuts, and setup progress footer. */
export const PageCrossLinks = () => {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const settings = useAppStoreShallow((s) => s.settings);

  const resolved = resolvePageCrossLinks(pathname);
  if (!resolved) return null;

  const { relations, relatedPages } = resolved;
  const settingsObj = settings as unknown as Record<string, unknown>;
  const completedSteps = SETUP_STEPS.filter((step) => step.checkFn(settingsObj)).length;
  const totalSteps = SETUP_STEPS.length;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.6 }}
      className="mt-8 space-y-6"
      role="complementary"
      aria-label={t('crossLinks.sectionLabel')}
    >
      <RelatedPagesSection relatedPages={relatedPages} />

      <div className="grid gap-4 md:grid-cols-2">
        <QuickSettingsSection
          settingsLinks={relations.settingsLinks}
          setupReqs={relations.setupRequirements}
        />
        <SetupProgressSection
          completedSteps={completedSteps}
          totalSteps={totalSteps}
          settingsObj={settingsObj}
          {...(relations.helpTab ? { helpTab: relations.helpTab } : {})}
        />
      </div>
    </motion.div>
  );
};
