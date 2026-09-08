import { BrainCircuit, TrendingUp, TriangleAlert, Zap } from 'lucide-react';
import { motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useAIWorker } from '../core/useAIWorker';
import { useAppStoreShallow } from '../store';
import type { EnergyDataFull, OptimizerRecommendation } from '../workers/worker-types';

const severityStyles = {
  positive: 'border-emerald-400/35 bg-emerald-400/10 text-emerald-100',
  warning: 'border-orange-400/35 bg-orange-400/10 text-orange-50',
  critical: 'border-red-400/35 bg-red-400/10 text-red-50',
  neutral: 'border-sky-400/30 bg-sky-400/10 text-sky-50',
} as const;

const severityIcons = {
  positive: TrendingUp,
  warning: BrainCircuit,
  critical: TriangleAlert,
  neutral: Zap,
} as const;

export function AIOptimizerPanel() {
  const { t } = useTranslation();
  const energyData = useAppStoreShallow((state) => state.energyData);
  const settings = useAppStoreShallow((state) => state.settings);
  const aiWorker = useAIWorker();
  const [recommendations, setRecommendations] = useState<OptimizerRecommendation[]>([]);

  useEffect(() => {
    let cancelled = false;
    const input: EnergyDataFull = { ...energyData };
    aiWorker
      .computeRecommendations(input, {
        chargeThreshold: settings.chargeThreshold,
        maxGridImportKw: settings.maxGridImportKw,
      })
      .then((recs) => {
        if (!cancelled) setRecommendations(recs);
      });
    return () => {
      cancelled = true;
    };
  }, [aiWorker, energyData, settings.chargeThreshold, settings.maxGridImportKw]);

  return (
    <div className="glass-panel grid gap-3 p-4 sm:gap-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="eyebrow">{t('dashboard.optimizer')}</p>
          <h3 className="fluid-text-lg mt-2 font-semibold text-(--color-text)">
            {t('dashboard.optimizerSubtitle')}
          </h3>
        </div>
        <div className="inline-flex shrink-0 items-center gap-2 rounded-full border border-(--color-border) bg-white/5 px-2 py-1 font-semibold text-(--color-primary) text-xs uppercase tracking-[0.22em] sm:px-3">
          <BrainCircuit className="h-4 w-4" aria-hidden="true" />
          {t('common.live')}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {recommendations.map((recommendation, index) => {
          const Icon = severityIcons[recommendation.severity];

          return (
            <motion.article
              key={recommendation.id}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.06, duration: 0.3 }}
              className={`rounded-2xl border p-3 sm:rounded-3xl sm:p-4 ${severityStyles[recommendation.severity]}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-xs uppercase tracking-[0.18em] opacity-80">
                    {t(recommendation.titleKey)}
                  </p>
                  <h4 className="fluid-text-base mt-2 font-semibold">
                    {t(recommendation.descriptionKey)}
                  </h4>
                </div>
                <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
              </div>
              <p className="mt-4 font-medium text-sm opacity-80">{recommendation.value}</p>
            </motion.article>
          );
        })}
      </div>
    </div>
  );
}
