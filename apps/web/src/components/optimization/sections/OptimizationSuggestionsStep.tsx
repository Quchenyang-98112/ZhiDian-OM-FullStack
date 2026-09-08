import {
  BarChart3,
  Battery,
  Car,
  CheckCircle2,
  Clock,
  Flame,
  Leaf,
  Sparkles,
  Zap,
} from 'lucide-react';
import { motion } from 'motion/react';
import { useTranslation } from 'react-i18next';
import type { PredictiveRecommendation } from '../../../lib/predictive-ai';
import type { OptimizerRecommendation } from '../../../types';

const SEVERITY_STYLES: Record<
  OptimizerRecommendation['severity'],
  { bg: string; text: string; icon: typeof Zap }
> = {
  positive: { bg: 'bg-emerald-500/15', text: 'text-emerald-400', icon: CheckCircle2 },
  warning: { bg: 'bg-amber-500/15', text: 'text-amber-400', icon: Clock },
  critical: { bg: 'bg-red-500/15', text: 'text-red-400', icon: Zap },
  neutral: { bg: 'bg-sky-500/15', text: 'text-sky-400', icon: BarChart3 },
};

const ACTION_ICONS: Record<string, typeof Zap> = {
  charge_ev: Car,
  charge_battery: Battery,
  preheat: Flame,
  wait: Clock,
};

interface SuggestionsStepProps {
  aiRecommendation: PredictiveRecommendation | null;
  recommendations: OptimizerRecommendation[];
}

/** Wizard step 2 — predictive AI recommendation plus MPC/rule-based cards. */
export function OptimizationSuggestionsStep({
  aiRecommendation,
  recommendations,
}: SuggestionsStepProps) {
  const { t } = useTranslation();
  const ActionIcon = aiRecommendation ? (ACTION_ICONS[aiRecommendation.action] ?? Zap) : Zap;

  return (
    <div className="flex flex-col gap-5">
      <h2 className="fluid-text-xl font-semibold">{t('optimizationWizard.suggestionsTitle')}</h2>

      {aiRecommendation && (
        <motion.div
          className="neon-border-blue glass-panel-strong flex flex-col gap-3 rounded-2xl p-5"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="flex items-center gap-2">
            <Sparkles size={18} className="text-(--color-primary)" aria-hidden="true" />
            <span className="font-semibold text-(--color-primary) text-sm">
              {t('ai.aiPowered')}
            </span>
            <span className="ml-auto rounded-full bg-(--color-primary)/15 px-2.5 py-0.5 font-medium text-(--color-primary) text-xs">
              {Math.round(aiRecommendation.confidence * 100)}%
            </span>
          </div>

          <div className="flex items-center gap-3">
            <ActionIcon size={22} className="text-(--color-accent)" aria-hidden="true" />
            <div>
              <p className="font-medium text-sm">
                {t(`optimizationWizard.action_${aiRecommendation.action}`)}
              </p>
              <p className="text-(--color-muted) text-xs">{aiRecommendation.reasoning}</p>
            </div>
          </div>

          <div className="flex gap-4 pt-1 text-(--color-muted) text-xs">
            <span className="flex items-center gap-1">
              <Clock size={12} aria-hidden="true" />
              {aiRecommendation.optimalTimeSlot.start.toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              })}
              –
              {aiRecommendation.optimalTimeSlot.end.toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
            <span className="flex items-center gap-1">
              <Leaf size={12} aria-hidden="true" />
              {t('optimizationWizard.estSavings')}: €{aiRecommendation.estimatedSavings.toFixed(2)}
            </span>
          </div>
        </motion.div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {recommendations.map((rec, i) => {
          const style = SEVERITY_STYLES[rec.severity];
          const Icon = style.icon;
          return (
            <motion.div
              key={rec.id}
              className="glass-panel flex items-start gap-3 rounded-2xl p-4"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06 }}
            >
              <div className={`${style.bg} rounded-lg p-2`}>
                <Icon size={16} className={style.text} aria-hidden="true" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-medium text-sm">{t(rec.titleKey)}</p>
                <p className="text-(--color-muted) text-xs">{t(rec.descriptionKey)}</p>
                <span className="mt-1 inline-block rounded bg-(--color-primary)/10 px-2 py-0.5 font-semibold text-(--color-primary) text-xs tabular-nums">
                  {rec.value}
                </span>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
