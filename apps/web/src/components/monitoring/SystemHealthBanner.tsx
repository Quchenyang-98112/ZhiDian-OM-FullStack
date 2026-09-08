import { motion } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { EndpointCards } from './EndpointCards';
import { HealthIconBlock } from './HealthIconBlock';
import { StatusPill } from './StatusPill';
import { formatUptime } from './utils';

// skipcq: JS-0415
export function SystemHealthBanner({
  error,
  uptime,
  lastUpdated,
  connected,
}: {
  error: string | null;
  uptime: number;
  lastUpdated: number;
  connected: boolean;
}) {
  const { t } = useTranslation();
  return (
    <motion.section
      className="glass-panel-strong hover-lift p-5"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <HealthIconBlock error={error} />
          <div>
            <h2 className="font-medium text-(--color-text) text-lg">
              {error ? t('monitoring.systemDegraded') : t('monitoring.systemHealthy')}
            </h2>
            <p className="text-(--color-muted) text-xs">
              {t('monitoring.uptime')}: {formatUptime(uptime)} · {t('monitoring.interval')}: 5s
              {lastUpdated > 0 && (
                <>
                  {' '}
                  · {t('monitoring.lastScrape')}: {new Date(lastUpdated).toLocaleTimeString()}
                </>
              )}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <StatusPill label="Prometheus" ok={!error} />
          <StatusPill label="Grafana" ok />
          <StatusPill label="MQTT" ok={connected} />
          <StatusPill label="KNX/IP" ok />
        </div>
      </div>
      <EndpointCards />
    </motion.section>
  );
}
