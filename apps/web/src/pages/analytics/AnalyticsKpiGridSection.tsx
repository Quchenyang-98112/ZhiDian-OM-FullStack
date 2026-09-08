import { ArrowDownRight, ArrowUpRight, ChevronRight } from 'lucide-react';
import { motion } from 'motion/react';
import type { ReactNode } from 'react';

export interface AnalyticsKpiCard {
  label: string;
  value: string;
  icon: ReactNode;
  color: string;
  bg: string;
  trend: string;
  trendUp: boolean;
}

export interface AnalyticsKpiGridSectionProps {
  kpiCards: AnalyticsKpiCard[];
}

/** KPI card grid at the top of the Analytics page. */
export const AnalyticsKpiGridSection = ({ kpiCards }: AnalyticsKpiGridSectionProps) => (
  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-8">
    {kpiCards.map((card, i) => (
      <motion.div
        key={card.label}
        className="group metric-card hover-lift rounded-2xl"
        initial={{ opacity: 0, scale: 0.92 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.35, delay: 0.05 + i * 0.04 }}
      >
        <div className="mb-2 flex items-center justify-between">
          <span
            className={`flex h-7 w-7 items-center justify-center rounded-lg ${card.bg} ${card.color}`}
          >
            {card.icon}
          </span>
          <ChevronRight
            size={12}
            className="text-(--color-muted) opacity-0 transition-opacity group-hover:opacity-100"
            aria-hidden="true"
          />
        </div>
        <p className={`truncate font-light text-xl ${card.color}`}>{card.value}</p>
        <p className="mt-0.5 truncate text-(--color-muted) text-[10px] leading-tight">
          {card.label}
        </p>
        <div className="mt-1.5 flex items-center gap-1 text-[9px]">
          {card.trendUp ? (
            <ArrowUpRight size={10} className="text-emerald-400" aria-hidden="true" />
          ) : (
            <ArrowDownRight size={10} className="text-orange-400" aria-hidden="true" />
          )}
          <span className={card.trendUp ? 'text-emerald-400' : 'text-orange-400'}>
            {card.trend}
          </span>
        </div>
      </motion.div>
    ))}
  </div>
);
