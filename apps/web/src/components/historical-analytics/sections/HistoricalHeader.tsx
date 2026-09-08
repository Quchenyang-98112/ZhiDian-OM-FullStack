import { AlertCircle, CheckCircle, Database } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { TIME_RANGES } from '../data/constants';
import type { TimeRange } from '../types';

function InfluxStatus({ influxHealthy }: { influxHealthy: boolean | null }) {
  const { t } = useTranslation();
  if (influxHealthy === true) {
    return (
      <span className="flex items-center gap-1.5 rounded-full bg-green-500/10 px-3 py-1 font-medium text-green-400 text-xs">
        <CheckCircle size={14} aria-hidden="true" />
        {t('historicalAnalytics.influxConnected')}
      </span>
    );
  }
  if (influxHealthy === false) {
    return (
      <span className="flex items-center gap-1.5 rounded-full bg-red-500/10 px-3 py-1 font-medium text-red-400 text-xs">
        <AlertCircle size={14} aria-hidden="true" />
        {t('historicalAnalytics.influxDisconnected')}
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1.5 rounded-full bg-(--color-border)/30 px-3 py-1 font-medium text-(--color-muted) text-xs">
      <Database size={14} aria-hidden="true" />
      {t('historicalAnalytics.influxNotConfigured')}
    </span>
  );
}

export function HistoricalHeader({
  influxHealthy,
  timeRange,
  onRangeChange,
}: {
  influxHealthy: boolean | null;
  timeRange: TimeRange;
  onRangeChange: (range: TimeRange) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-2">
        <InfluxStatus influxHealthy={influxHealthy} />
      </div>

      <div
        className="flex gap-1 rounded-lg bg-(--color-surface)/50 p-1"
        role="radiogroup"
        aria-label={t('historicalAnalytics.selectRange')}
      >
        {TIME_RANGES.map((r) => (
          // biome-ignore lint/a11y/useSemanticElements: radio-style button inside radiogroup, input[type=radio] would break styled button layout
          <button
            key={r.value}
            type="button"
            onClick={() => onRangeChange(r.value)}
            role="radio"
            aria-checked={timeRange === r.value}
            className={`rounded-md px-3 py-1.5 font-medium text-xs transition-colors ${
              timeRange === r.value
                ? 'bg-(--color-text) text-(--color-background) shadow-sm'
                : 'text-(--color-muted) hover:text-(--color-text)'
            }`}
          >
            {t(r.labelKey)}
          </button>
        ))}
      </div>
    </div>
  );
}
