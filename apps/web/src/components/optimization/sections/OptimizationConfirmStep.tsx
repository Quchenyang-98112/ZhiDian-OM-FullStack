import { CheckCircle2 } from 'lucide-react';
import { motion } from 'motion/react';
import { useTranslation } from 'react-i18next';
import type { PredictiveRecommendation } from '../../../lib/predictive-ai';
import type { OptimizerRecommendation } from '../../../types';

interface ConfirmStepProps {
  applied: boolean;
  aiRecommendation: PredictiveRecommendation | null;
  recommendations: OptimizerRecommendation[];
}

/** Wizard step 3 — summary of the plan and the applied confirmation state. */
export function OptimizationConfirmStep({
  applied,
  aiRecommendation,
  recommendations,
}: ConfirmStepProps) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col gap-5">
      <h2 className="fluid-text-xl font-semibold">{t('optimizationWizard.confirmTitle')}</h2>

      {applied ? (
        <motion.div
          className="flex flex-col items-center gap-3 py-10"
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
        >
          <CheckCircle2 size={48} className="text-emerald-400" aria-hidden="true" />
          <p className="fluid-text-lg font-semibold">{t('optimizationWizard.applied')}</p>
          <p className="text-(--color-muted) text-sm">{t('optimizationWizard.appliedDesc')}</p>
        </motion.div>
      ) : (
        <>
          <div className="glass-panel divide-y divide-(--color-border)/30 rounded-2xl">
            {aiRecommendation && (
              <div className="flex items-center justify-between px-5 py-3">
                <span className="text-sm">
                  {t(`optimizationWizard.action_${aiRecommendation.action}`)}
                </span>
                <span className="rounded-full bg-emerald-500/15 px-2.5 py-0.5 font-medium text-emerald-400 text-xs">
                  {Math.round(aiRecommendation.confidence * 100)}%{' '}
                  {t('optimizationWizard.confidence')}
                </span>
              </div>
            )}
            {recommendations.slice(0, 4).map((rec) => (
              <div key={rec.id} className="flex items-center justify-between px-5 py-3">
                <span className="text-sm">{t(rec.titleKey)}</span>
                <span className="font-semibold text-(--color-primary) text-xs tabular-nums">
                  {rec.value}
                </span>
              </div>
            ))}
          </div>

          {aiRecommendation && (
            <p className="text-center text-(--color-muted) text-xs">
              {t('optimizationWizard.estSavings')}:{' '}
              <strong className="text-(--color-primary)">
                €{aiRecommendation.estimatedSavings.toFixed(2)}
              </strong>
            </p>
          )}
        </>
      )}
    </div>
  );
}
