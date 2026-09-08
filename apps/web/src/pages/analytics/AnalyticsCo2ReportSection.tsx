import type { TFunction } from 'i18next';
import { Car, Plane, TreePine } from 'lucide-react';
import { motion } from 'motion/react';
import type { AnalyticsDashboardMetrics } from '../../lib/analytics-derived-metrics';
import { Co2KpiTile } from './Co2KpiTile';
import { Co2ReportHeader } from './Co2ReportHeader';

export interface AnalyticsCo2ReportSectionProps {
  t: TFunction;
  currentYear: number;
  ubaFactor: number;
  monthlyCo2: AnalyticsDashboardMetrics['monthlyCo2'];
}

/** CO₂ savings report section with KPI tiles and export actions. */
export const AnalyticsCo2ReportSection = ({
  t,
  currentYear,
  ubaFactor,
  monthlyCo2,
}: AnalyticsCo2ReportSectionProps) => {
  const co2KpiCards = [
    {
      label: t('analytics.co2GridEmissions'),
      value: monthlyCo2.gridEmissions,
      color: 'text-red-400',
      icon: '⚡',
    },
    {
      label: t('analytics.co2SelfSavings'),
      value: monthlyCo2.selfSavings,
      color: 'text-emerald-400',
      icon: '☀',
    },
    {
      label: t('analytics.co2FeedInSavings'),
      value: monthlyCo2.feedInSavings,
      color: 'text-blue-400',
      icon: '🔌',
    },
    {
      label: t('analytics.co2NetBalance'),
      value: monthlyCo2.netBalance,
      color: monthlyCo2.netBalance <= 0 ? 'text-emerald-400' : 'text-red-400',
      icon: monthlyCo2.netBalance <= 0 ? '✅' : '⚠',
    },
  ];

  return (
    <motion.section
      className="glass-panel space-y-4 rounded-2xl p-5"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.45 }}
    >
      <Co2ReportHeader t={t} currentYear={currentYear} ubaFactor={ubaFactor} />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {co2KpiCards.map((item) => (
          <Co2KpiTile key={item.label} {...item} />
        ))}
      </div>

      {monthlyCo2.totalSaved > 0 ? (
        <div className="flex flex-wrap items-center justify-center gap-4 rounded-xl bg-emerald-500/5 px-4 py-3">
          <div className="flex items-center gap-1.5">
            <TreePine size={16} className="text-emerald-400" aria-hidden="true" />
            <span className="text-(--color-text) text-xs">
              <strong>{monthlyCo2.treesEquiv.toFixed(1)}</strong> {t('analytics.co2Trees')}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <Car size={16} className="text-blue-400" aria-hidden="true" />
            <span className="text-(--color-text) text-xs">
              <strong>{monthlyCo2.carKmEquiv.toFixed(0)}</strong> {t('analytics.co2CarKm')}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <Plane size={16} className="text-yellow-400" aria-hidden="true" />
            <span className="text-(--color-text) text-xs">
              <strong>{monthlyCo2.flightsEquiv.toFixed(2)}</strong> {t('analytics.co2Flights')}
            </span>
          </div>
        </div>
      ) : null}

      <p className="text-center text-(--color-muted) text-[10px]">
        {monthlyCo2.netBalance <= 0 ? t('analytics.co2NetSaver') : t('analytics.co2NetEmitter')} ·{' '}
        {t('analytics.co2ReportMonthly')}
      </p>
    </motion.section>
  );
};
