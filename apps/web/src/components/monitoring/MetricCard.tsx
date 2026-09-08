import { motion } from 'motion/react';
import type { MetricCardItem } from './types';

export function MetricCard({ card, index }: { card: MetricCardItem; index: number }) {
  return (
    <motion.div
      key={card.label}
      className="group metric-card hover-lift rounded-2xl"
      initial={{ opacity: 0, scale: 0.92 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3, delay: 0.05 + index * 0.03 }}
    >
      <div className="mb-2 flex items-center justify-between">
        <span
          aria-hidden="true"
          className={`flex h-7 w-7 items-center justify-center rounded-lg ${card.bg} ${card.color}`}
        >
          {card.icon}
        </span>
        <span
          className={`h-2 w-2 rounded-full ${
            card.status === 'crit'
              ? 'energy-pulse bg-red-400'
              : card.status === 'warn'
                ? 'energy-pulse bg-yellow-400'
                : 'bg-emerald-400'
          }`}
        />
      </div>
      <p className={`truncate font-light text-xl ${card.color}`}>
        {card.value}
        <span className="ml-1 text-(--color-muted) text-xs">{card.unit}</span>
      </p>
      <p className="mt-0.5 truncate text-(--color-muted) text-[10px] leading-tight">{card.label}</p>
    </motion.div>
  );
}
