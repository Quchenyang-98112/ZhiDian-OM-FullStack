import type { TFunction } from 'i18next';
import { BrainCircuit } from 'lucide-react';
import { motion } from 'motion/react';
import { ChoiceCardGroup } from '../../components/ui/ChoiceCardGroup';
import type { ForecastResult } from '../../lib/ml-forecast';
import { getForecastableMetrics } from '../../lib/ml-forecast';
import { MlForecastLineChart } from './MlForecastLineChart';
import { MlForecastSectionHeader } from './MlForecastSectionHeader';

export interface AnalyticsMlForecastSectionProps {
  t: TFunction;
  selectedMetric: string;
  onSelectedMetricChange: (metric: string) => void;
  forecastResult: ForecastResult | null;
  forecastLoading: boolean;
  onRunForecast: () => void;
}

/** ML forecast section with metric selector and optional result chart. */
export const AnalyticsMlForecastSection = ({
  t,
  selectedMetric,
  onSelectedMetricChange,
  forecastResult,
  forecastLoading,
  onRunForecast,
}: AnalyticsMlForecastSectionProps) => (
  <motion.section
    className="glass-panel space-y-4 rounded-2xl p-5"
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.5, delay: 0.44 }}
  >
    <MlForecastSectionHeader
      t={t}
      forecastLoading={forecastLoading}
      onRunForecast={onRunForecast}
    />

    <ChoiceCardGroup
      key={selectedMetric}
      name="ml-forecast-metric"
      value={selectedMetric}
      onChange={onSelectedMetricChange}
      aria-label={t('analytics.mlForecastSelectMetric')}
      layout="grid"
      size="compact"
      options={getForecastableMetrics().map((m) => ({
        value: m.key,
        label: m.label,
        meta: m.unit,
        tone: 'primary' as const,
      }))}
    />

    {forecastResult && (
      <div className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <span className="rounded-full bg-purple-500/15 px-2.5 py-1 font-medium text-[10px] text-purple-300">
            {t('analytics.mlForecastModel')}: {forecastResult.model}
          </span>
          <span className="rounded-full bg-emerald-500/15 px-2.5 py-1 font-medium text-[10px] text-emerald-300">
            R² {(forecastResult.accuracy.r2 * 100).toFixed(1)}%
          </span>
          <span className="rounded-full bg-blue-400/15 px-2.5 py-1 font-medium text-[10px] text-blue-300">
            MAPE {forecastResult.accuracy.mape.toFixed(1)}%
          </span>
          <span className="rounded-full bg-yellow-400/15 px-2.5 py-1 font-medium text-[10px] text-yellow-300">
            RMSE {forecastResult.accuracy.rmse.toFixed(0)} {forecastResult.unit}
          </span>
        </div>

        <MlForecastLineChart forecastResult={forecastResult} />
        <p className="text-center text-(--color-muted) text-[10px]">
          {t('analytics.mlForecastConfidence')} · {forecastResult.training.samplesUsed}{' '}
          {t('analytics.mlForecastDataPoints')}
        </p>
      </div>
    )}

    {!forecastResult && (
      <div className="flex flex-col items-center justify-center gap-2 py-8 text-center text-(--color-muted)">
        <BrainCircuit size={32} className="opacity-30" aria-hidden="true" />
        <p className="text-xs">{t('analytics.mlForecastNoData')}</p>
      </div>
    )}
  </motion.section>
);
