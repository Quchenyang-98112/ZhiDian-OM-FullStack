import { AlertCircle, CheckCircle, CloudSun, ExternalLink } from 'lucide-react';
import { motion } from 'motion/react';
import { useTranslation } from 'react-i18next';

interface ServiceInfo {
  name: string;
  desc: string;
  port: string;
  status: boolean | null;
}

function ServiceCard({ svc }: { svc: ServiceInfo }) {
  const { t } = useTranslation();
  return (
    <div className="rounded-lg border border-(--color-border) p-3">
      <div className="flex items-center justify-between">
        <span className="font-semibold text-(--color-text) text-sm">{svc.name}</span>
        {svc.status === true && (
          <CheckCircle
            size={14}
            className="text-green-400"
            role="img"
            aria-label={t('historicalAnalytics.serviceHealthyLabel')}
          />
        )}
        {svc.status === false && (
          <AlertCircle
            size={14}
            className="text-red-400"
            role="img"
            aria-label={t('historicalAnalytics.serviceUnhealthyLabel')}
          />
        )}
      </div>
      <p className="mt-1 text-(--color-muted) text-xs">{svc.desc}</p>
      <p className="mt-1 text-(--color-muted) text-xs">
        {t('historicalAnalytics.portLabel')}: {svc.port}
        {svc.name === 'Grafana' && (
          <a
            href={`http://localhost:${svc.port}`}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-2 inline-flex items-center gap-0.5 text-(--color-primary) hover:underline"
          >
            <ExternalLink size={10} aria-hidden="true" />
            {t('historicalAnalytics.open')}
          </a>
        )}
      </p>
    </div>
  );
}

export function InfrastructureSection({ influxHealthy }: { influxHealthy: boolean | null }) {
  const { t } = useTranslation();
  const services: ServiceInfo[] = [
    {
      name: 'InfluxDB',
      desc: t('historicalAnalytics.influxDesc'),
      port: '8086',
      status: influxHealthy,
    },
    {
      name: 'Prometheus',
      desc: t('historicalAnalytics.prometheusDesc'),
      port: '9090',
      status: null,
    },
    { name: 'Grafana', desc: t('historicalAnalytics.grafanaDesc'), port: '3001', status: null },
  ];

  return (
    <motion.section
      className="glass-panel rounded-xl p-5"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 0.4 }}
    >
      <h2 className="mb-4 flex items-center gap-2 font-semibold text-(--color-text) text-lg">
        <CloudSun size={20} className="text-(--color-electric-blue)" aria-hidden="true" />
        {t('historicalAnalytics.infrastructure')}
      </h2>
      <div className="grid gap-3 sm:grid-cols-3">
        {services.map((svc) => (
          <ServiceCard key={svc.name} svc={svc} />
        ))}
      </div>
    </motion.section>
  );
}
