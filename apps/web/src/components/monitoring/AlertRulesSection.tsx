import { ShieldAlert } from 'lucide-react';
import { motion } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { AlertRuleItem } from './AlertRuleItem';
import type { AlertRule } from './types';

export function AlertRulesSection({ alertRules }: { alertRules: AlertRule[] }) {
  const { t } = useTranslation();
  return (
    <motion.section
      className="glass-panel-strong hover-lift cv-auto-sm p-6"
      aria-labelledby="alerts-title"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.42 }}
    >
      <h2 id="alerts-title" className="fluid-text-lg mb-4 flex items-center gap-2 font-medium">
        <ShieldAlert size={20} className="text-(--color-secondary)" aria-hidden="true" />
        {t('monitoring.alertRules')}
      </h2>
      <div className="space-y-2">
        {alertRules.map((rule) => (
          <AlertRuleItem key={rule.name} rule={rule} />
        ))}
      </div>
    </motion.section>
  );
}
