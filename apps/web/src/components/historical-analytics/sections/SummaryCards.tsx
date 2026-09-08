import { Battery, Sun, TrendingUp, Zap } from 'lucide-react';
import { motion } from 'motion/react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

interface SummaryStats {
  avgPv: number;
  avgLoad: number;
  peakPv: number;
  avgSoC: number;
  isLoading: boolean;
}

export function SummaryCards({ avgPv, avgLoad, peakPv, avgSoC, isLoading }: SummaryStats) {
  const { t } = useTranslation();
  const cards: { id: string; label: string; value: string; icon: ReactNode; color: string }[] = [
    {
      id: 'avgPv',
      label: t('historicalAnalytics.avgPvPower'),
      value: `${avgPv} W`,
      icon: <Sun size={18} />,
      color: 'text-yellow-400',
    },
    {
      id: 'avgLoad',
      label: t('historicalAnalytics.avgHouseLoad'),
      value: `${avgLoad} W`,
      icon: <Zap size={18} />,
      color: 'text-blue-400',
    },
    {
      id: 'peakPv',
      label: t('historicalAnalytics.peakPv'),
      value: `${peakPv} W`,
      icon: <TrendingUp size={18} />,
      color: 'text-green-400',
    },
    {
      id: 'avgSoC',
      label: t('historicalAnalytics.avgBatterySoC'),
      value: `${avgSoC}%`,
      icon: <Battery size={18} />,
      color: 'text-purple-400',
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {cards.map((card) => (
        <motion.div
          key={card.id}
          className="glass-panel rounded-xl p-4"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <div className="flex items-center gap-2">
            <span className={card.color} aria-hidden="true">
              {card.icon}
            </span>
            <span className="text-(--color-muted) text-xs">{card.label}</span>
          </div>
          <p className="mt-1 font-bold text-(--color-text) text-xl">
            {isLoading ? '...' : card.value}
          </p>
        </motion.div>
      ))}
    </div>
  );
}
