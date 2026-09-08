import { Battery, Sun, TrendingDown } from 'lucide-react';
import { motion } from 'motion/react';
import { useTranslation } from 'react-i18next';
import type { EnergyData } from '../../../types';

interface OverviewCardsProps {
  energyData: Pick<EnergyData, 'pvPower' | 'batterySoC' | 'priceCurrent'>;
}

/** The three at-a-glance PV / battery / price cards above the wizard. */
export function OptimizationOverviewCards({ energyData }: OverviewCardsProps) {
  const { t } = useTranslation();
  const cards = [
    {
      icon: <Sun size={20} aria-hidden="true" />,
      label: t('optimizationWizard.currentPv'),
      value: `${(energyData.pvPower / 1000).toFixed(1)} kW`,
      color: 'text-amber-400',
    },
    {
      icon: <Battery size={20} aria-hidden="true" />,
      label: t('optimizationWizard.batterySoC'),
      value: `${Math.round(energyData.batterySoC)}%`,
      color: 'text-emerald-400',
    },
    {
      icon: <TrendingDown size={20} aria-hidden="true" />,
      label: t('optimizationWizard.currentPrice'),
      value: `${energyData.priceCurrent.toFixed(3)} €/kWh`,
      color: 'text-sky-400',
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      {cards.map((card) => (
        <motion.div
          key={card.label}
          className="glass-panel flex items-center gap-4 rounded-2xl p-4"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <div className={`${card.color} rounded-xl bg-current/10 p-2.5`}>{card.icon}</div>
          <div>
            <p className="text-(--color-muted) text-xs">{card.label}</p>
            <p className="fluid-text-lg font-semibold tabular-nums">{card.value}</p>
          </div>
        </motion.div>
      ))}
    </div>
  );
}
