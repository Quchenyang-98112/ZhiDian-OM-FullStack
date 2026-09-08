import type { TFunction } from 'i18next';
import { Activity, BarChart3, Sun, Zap } from 'lucide-react';
import { PageHeader } from '../../components/layout/PageHeader';

export interface AnalyticsPageHeaderSectionProps {
  t: TFunction;
  isPeakHour: boolean;
  isSolarPeak: boolean;
}

/** Page header with period selector for the Analytics route. */
export const AnalyticsPageHeaderSection = ({
  t,
  isPeakHour,
  isSolarPeak,
}: AnalyticsPageHeaderSectionProps) => (
  <PageHeader
    title={t('nav.analytics', 'Analytics')}
    subtitle={t('analytics.subtitle')}
    icon={<BarChart3 size={22} aria-hidden="true" />}
    actions={
      <div className="flex flex-wrap items-center gap-2">
        {isPeakHour && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-orange-500/15 px-3 py-1.5 font-semibold text-[10px] text-orange-400 uppercase tracking-wider">
            <Zap size={10} className="energy-pulse" aria-hidden="true" />
            {t('analytics.peakHours')}
          </span>
        )}
        {isSolarPeak && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-yellow-500/15 px-3 py-1.5 font-semibold text-[10px] text-yellow-400 uppercase tracking-wider">
            <Sun size={10} aria-hidden="true" />
            {t('analytics.solarPeak')}
          </span>
        )}
        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-3 py-1.5 font-semibold text-[10px] text-emerald-400 uppercase tracking-wider">
          <Activity size={10} className="energy-pulse" aria-hidden="true" />
          {t('common.live')}
        </span>
      </div>
    }
  />
);
