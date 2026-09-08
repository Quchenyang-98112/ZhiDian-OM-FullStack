import { motion } from 'motion/react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

/** Glass panel with a titled header and an aria-labelled chart container. */
export function ChartCard({
  titleKey,
  ariaKey,
  icon,
  heightClass,
  delay,
  children,
}: {
  titleKey: string;
  ariaKey: string;
  icon: ReactNode;
  heightClass: string;
  delay: number;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <motion.section
      className="glass-panel rounded-xl p-5"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay }}
    >
      <h2 className="mb-4 flex items-center gap-2 font-semibold text-(--color-text) text-lg">
        {icon}
        {t(titleKey)}
      </h2>
      <div className={heightClass} role="img" aria-label={t(ariaKey)}>
        {children}
      </div>
    </motion.section>
  );
}
