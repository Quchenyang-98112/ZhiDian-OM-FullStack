import { Activity } from 'lucide-react';
import { motion } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { LoadAreaChart } from './LoadAreaChart';
import type { generateSystemLoadHistory } from './utils';

function LoadChartLegend() {
  const { t } = useTranslation();
  const items = [
    { key: 'monitoring.houseLoad', color: 'bg-cyan-400' },
    { key: 'monitoring.cpuPercent', color: 'bg-purple-400' },
    { key: 'monitoring.ramPercent', color: 'bg-blue-400' },
  ] as const;

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px]">
      {items.map(({ key, color }) => (
        <span key={key} className="flex items-center gap-1">
          <span className={`inline-block h-2.5 w-2.5 rounded-full ${color}`} />
          {t(key)}
        </span>
      ))}
    </div>
  );
}

// skipcq: JS-0415
export function LoadChartSection({
  loadHistory,
}: {
  loadHistory: ReturnType<typeof generateSystemLoadHistory>;
}) {
  const { t } = useTranslation();
  return (
    <motion.section
      className="glass-panel-strong hover-lift p-6 lg:col-span-2"
      aria-labelledby="load-chart-title"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.35 }}
    >
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h2 id="load-chart-title" className="fluid-text-lg flex items-center gap-2 font-medium">
          <Activity size={20} className="text-(--color-secondary)" aria-hidden="true" />
          {t('monitoring.systemLoad24h')}
        </h2>
        <LoadChartLegend />
      </div>
      <div className="h-[240px]" role="img" aria-label={t('monitoring.systemLoad24h')}>
        <LoadAreaChart loadHistory={loadHistory} />
      </div>
    </motion.section>
  );
}
