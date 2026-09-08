import type { EnergyData } from '@nexus-hems/shared-types';
import type { TFunction } from 'i18next';
import { Activity, Gauge, Shield } from 'lucide-react';
import { motion } from 'motion/react';
import {
  buildDataQualityItems,
  buildEfficiencySectionMetrics,
} from '../../lib/analytics-derived-metrics';
import { DataQualityRow } from './DataQualityRow';
import { EfficiencyMetricBar } from './EfficiencyMetricBar';

export interface AnalyticsEfficiencySectionProps {
  t: TFunction;
  energyData: EnergyData;
  selfRate: number;
  autarky: number;
  inverterEfficiency: number;
  batteryRoundTrip: number;
}

/** Inverter, battery, self-consumption, and data-quality metrics for Analytics. */
export const AnalyticsEfficiencySection = ({
  t,
  energyData,
  selfRate,
  autarky,
  inverterEfficiency,
  batteryRoundTrip,
}: AnalyticsEfficiencySectionProps) => {
  const efficiencyMetrics = buildEfficiencySectionMetrics(
    t,
    selfRate,
    autarky,
    inverterEfficiency,
    batteryRoundTrip,
  );
  const dataQualityItems = buildDataQualityItems(t);

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <motion.section
        className="glass-panel-strong hover-lift cv-auto-sm p-6"
        aria-labelledby="efficiency-title"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.42 }}
      >
        <h2
          id="efficiency-title"
          className="fluid-text-lg mb-4 flex items-center gap-2 font-medium"
        >
          <Gauge size={20} className="text-(--color-secondary)" aria-hidden="true" />
          {t('analytics.efficiencyMetrics')}
        </h2>
        <div className="space-y-3">
          {efficiencyMetrics.map((metric) => (
            <EfficiencyMetricBar key={metric.label} {...metric} />
          ))}
        </div>
        <div className="mt-4 rounded-xl border border-(--color-primary)/20 bg-(--color-primary)/5 p-3 text-(--color-muted) text-xs">
          <span className="font-medium text-(--color-primary)">💡 </span>
          {t('analytics.efficiencyTip')}
        </div>
      </motion.section>

      <motion.section
        className="glass-panel-strong hover-lift cv-auto-sm p-6"
        aria-labelledby="data-quality-title"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.44 }}
      >
        <h2
          id="data-quality-title"
          className="fluid-text-lg mb-4 flex items-center gap-2 font-medium"
        >
          <Shield size={20} className="text-(--color-secondary)" aria-hidden="true" />
          {t('analytics.dataQuality')}
        </h2>
        <div className="space-y-3">
          {dataQualityItems.map((item) => (
            <DataQualityRow key={item.label} {...item} />
          ))}
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white/5 px-3 py-2.5 text-xs">
          <span className="flex items-center gap-1.5 text-(--color-muted)">
            <Activity size={12} className="energy-pulse text-emerald-400" aria-hidden="true" />
            {t('analytics.liveDataStream')}
          </span>
          <span className="truncate font-mono text-emerald-400">
            {energyData.gridVoltage.toFixed(0)}V · {energyData.priceCurrent.toFixed(4)} €/kWh
          </span>
        </div>
      </motion.section>
    </div>
  );
};
