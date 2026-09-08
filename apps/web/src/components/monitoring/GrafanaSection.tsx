import { BarChart3 } from 'lucide-react';
import { motion } from 'motion/react';
import { useTranslation } from 'react-i18next';

export function GrafanaSection() {
  const { t } = useTranslation();
  return (
    <motion.section
      className="glass-panel-strong hover-lift cv-auto-sm p-6"
      aria-labelledby="grafana-title"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.46 }}
    >
      <h2 id="grafana-title" className="fluid-text-lg mb-4 flex items-center gap-2 font-medium">
        <BarChart3 size={20} className="text-(--color-secondary)" aria-hidden="true" />
        {t('monitoring.grafanaDashboard')}
      </h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl bg-white/5 p-3">
          <p className="text-(--color-muted) text-[10px]">{t('monitoring.dashboardUid')}</p>
          <code className="font-mono text-(--color-primary) text-xs">nexus-hems-overview</code>
        </div>
        <div className="rounded-xl bg-white/5 p-3">
          <p className="text-(--color-muted) text-[10px]">{t('monitoring.dataSource')}</p>
          <code className="font-mono text-(--color-primary) text-xs">Prometheus</code>
        </div>
        <div className="rounded-xl bg-white/5 p-3">
          <p className="text-(--color-muted) text-[10px]">{t('monitoring.interval')}</p>
          <code className="font-mono text-(--color-primary) text-xs">5s</code>
        </div>
        <div className="rounded-xl bg-white/5 p-3">
          <p className="text-(--color-muted) text-[10px]">{t('monitoring.retention')}</p>
          <code className="font-mono text-(--color-primary) text-xs">30d</code>
        </div>
      </div>
      <div className="mt-3 rounded-xl border border-(--color-primary)/20 bg-(--color-primary)/5 p-3 text-(--color-muted) text-xs">
        <span className="font-medium text-(--color-primary)">💡 </span>
        {t('monitoring.grafanaHint')}
      </div>
    </motion.section>
  );
}
