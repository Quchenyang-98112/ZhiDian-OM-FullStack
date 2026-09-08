import { Activity, BarChart3, Sun, TrendingDown, TrendingUp, Zap } from 'lucide-react';
import { motion } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { PRICE_AVG, PRICE_MAX, PRICE_MIN, PRICE_SPREAD } from '../data/constants';

export function TariffKpiCards({
  currentPrice,
  isGoodPrice,
  feedInTariff,
}: {
  currentPrice: number;
  isGoodPrice: boolean;
  feedInTariff: number;
}) {
  const { t } = useTranslation();
  const kpis = [
    {
      label: t('tariffs.kpiCurrent'),
      value: `${currentPrice.toFixed(3)}`,
      unit: t('units.euroPerKwh'),
      icon: <Zap className="h-5 w-5" aria-hidden="true" />,
      color: isGoodPrice ? 'text-emerald-400' : 'text-orange-400',
      bg: isGoodPrice ? 'bg-emerald-500/10' : 'bg-orange-500/10',
    },
    {
      label: t('tariffs.kpiAvg24h'),
      value: `${PRICE_AVG.toFixed(3)}`,
      unit: t('units.euroPerKwh'),
      icon: <BarChart3 className="h-5 w-5" aria-hidden="true" />,
      color: 'text-blue-400',
      bg: 'bg-blue-500/10',
    },
    {
      label: t('tariffs.kpiLow'),
      value: `${PRICE_MIN.toFixed(3)}`,
      unit: t('units.euroPerKwh'),
      icon: <TrendingDown className="h-5 w-5" aria-hidden="true" />,
      color: 'text-emerald-400',
      bg: 'bg-emerald-500/10',
    },
    {
      label: t('tariffs.kpiHigh'),
      value: `${PRICE_MAX.toFixed(3)}`,
      unit: t('units.euroPerKwh'),
      icon: <TrendingUp className="h-5 w-5" aria-hidden="true" />,
      color: 'text-red-400',
      bg: 'bg-red-500/10',
    },
    {
      label: t('tariffs.kpiSpread'),
      value: `${(PRICE_SPREAD * 100).toFixed(1)}`,
      unit: t('units.ct'),
      icon: <Activity className="h-5 w-5" aria-hidden="true" />,
      color: 'text-purple-400',
      bg: 'bg-purple-500/10',
    },
    {
      label: t('tariffs.kpiFeedIn'),
      value: `${feedInTariff.toFixed(3)}`,
      unit: t('units.euroPerKwh'),
      icon: <Sun className="h-5 w-5" aria-hidden="true" />,
      color: 'text-amber-400',
      bg: 'bg-amber-500/10',
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      {kpis.map((kpi, i) => (
        <motion.div
          key={kpi.label}
          className="glass-panel-strong hover-lift rounded-2xl p-4"
          initial={{ opacity: 0, y: 20, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ delay: 0.05 * i, type: 'spring', bounce: 0.2 }}
        >
          <div
            className={`mb-2 flex h-9 w-9 items-center justify-center rounded-lg ${kpi.bg} ${kpi.color}`}
          >
            {kpi.icon}
          </div>
          <p className="truncate text-(--color-muted) text-xs">{kpi.label}</p>
          <p className={`mt-0.5 truncate font-bold text-xl tabular-nums ${kpi.color}`}>
            {kpi.value}
          </p>
          <p className="text-(--color-muted) text-[10px]">{kpi.unit}</p>
        </motion.div>
      ))}
    </div>
  );
}
