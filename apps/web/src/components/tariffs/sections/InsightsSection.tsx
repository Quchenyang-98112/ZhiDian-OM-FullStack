import { ArrowRight, Leaf, Sun, TrendingDown } from 'lucide-react';
import { motion } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { sectionAnim } from '../constants';

export function InsightsSection() {
  const { t } = useTranslation();
  return (
    <motion.section
      className="glass-panel p-6"
      {...sectionAnim}
      transition={{ ...sectionAnim.transition, delay: 0.65 }}
    >
      <h2 className="fluid-text-lg mb-4 font-semibold text-(--color-text)">
        <Leaf className="mr-2 inline h-5 w-5 text-green-400" aria-hidden="true" />
        {t('tariffs.insightsTitle')}
      </h2>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4">
          <div className="mb-2 flex items-center gap-2">
            <TrendingDown className="h-4 w-4 text-emerald-400" aria-hidden="true" />
            <span className="font-medium text-emerald-400 text-sm">
              {t('tariffs.insightSavings')}
            </span>
          </div>
          <p className="text-(--color-muted) text-sm">{t('tariffs.insightSavingsText')}</p>
        </div>

        <div className="rounded-2xl border border-blue-500/20 bg-blue-500/5 p-4">
          <div className="mb-2 flex items-center gap-2">
            <Sun className="h-4 w-4 text-blue-400" aria-hidden="true" />
            <span className="font-medium text-blue-400 text-sm">{t('tariffs.insightSolar')}</span>
          </div>
          <p className="text-(--color-muted) text-sm">{t('tariffs.insightSolarText')}</p>
        </div>

        <div className="rounded-2xl border border-purple-500/20 bg-purple-500/5 p-4">
          <div className="mb-2 flex items-center gap-2">
            <ArrowRight className="h-4 w-4 text-purple-400" aria-hidden="true" />
            <span className="font-medium text-purple-400 text-sm">{t('tariffs.insightTip')}</span>
          </div>
          <p className="text-(--color-muted) text-sm">{t('tariffs.insightTipText')}</p>
        </div>
      </div>
    </motion.section>
  );
}
