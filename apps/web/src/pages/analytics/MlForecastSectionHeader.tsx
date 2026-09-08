import type { TFunction } from 'i18next';
import { BrainCircuit } from 'lucide-react';

/** Header row with title and run-forecast action for the ML forecast section. */
export const MlForecastSectionHeader = ({
  t,
  forecastLoading,
  onRunForecast,
}: {
  t: TFunction;
  forecastLoading: boolean;
  onRunForecast: () => void;
}) => (
  <div className="flex flex-wrap items-center justify-between gap-3">
    <div className="flex items-center gap-2">
      <BrainCircuit size={20} className="text-purple-400" aria-hidden="true" />
      <div>
        <h3 className="fluid-text-base font-semibold text-(--color-text)">
          {t('analytics.mlForecastTitle')}
        </h3>
        <p className="text-(--color-muted) text-xs">{t('analytics.mlForecastSubtitle')}</p>
      </div>
    </div>
    <button
      type="button"
      onClick={onRunForecast}
      disabled={forecastLoading}
      className="focus-ring flex items-center gap-1.5 rounded-lg bg-purple-500/20 px-3 py-1.5 font-medium text-purple-300 text-xs transition hover:bg-purple-500/30 disabled:opacity-50"
    >
      <BrainCircuit size={14} aria-hidden="true" />
      {forecastLoading ? '…' : t('analytics.mlForecastRun')}
    </button>
  </div>
);
