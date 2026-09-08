import { motion } from 'motion/react';

/** Single efficiency progress bar row. */
export const EfficiencyMetricBar = ({
  label,
  value,
  max,
  suffix,
  color,
}: {
  label: string;
  value: number;
  max: number;
  suffix: string;
  color: string;
}) => (
  <div>
    <div className="mb-1 flex items-center justify-between text-xs">
      <span className="text-(--color-muted)">{label}</span>
      <span className="font-medium text-(--color-text)">
        {value.toFixed(1)}
        {suffix}
      </span>
    </div>
    <div className="h-2 overflow-hidden rounded-full bg-(--color-surface)">
      <motion.div
        className={`h-full rounded-full ${color}`}
        initial={{ width: 0 }}
        animate={{ width: `${Math.min(100, (value / max) * 100)}%` }}
        transition={{ duration: 1, ease: 'easeOut' }}
      />
    </div>
  </div>
);
