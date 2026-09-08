import { Activity, Wifi } from 'lucide-react';
import { motion } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { AdapterRow } from './AdapterRow';
import type { AdapterItem } from './types';

export function AdapterHealthSection({
  adapters,
  contribAdapters,
  get,
}: {
  adapters: AdapterItem[];
  contribAdapters: AdapterItem[];
  get: (name: string, labels?: Record<string, string>) => number | null;
}) {
  const { t } = useTranslation();
  return (
    <motion.section
      className="glass-panel-strong hover-lift cv-auto p-6"
      aria-labelledby="adapters-title"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.4 }}
    >
      <h2 id="adapters-title" className="fluid-text-lg mb-4 flex items-center gap-2 font-medium">
        <Wifi size={20} className="text-(--color-secondary)" aria-hidden="true" />
        {t('monitoring.adapterHealth')}
      </h2>
      <div className="space-y-2">
        {adapters.map((adapter) => {
          const isConnected = (get('hems_adapter_connected', { adapter: adapter.id }) ?? 1) > 0;
          const latency = get('hems_adapter_latency_seconds', { adapter: adapter.id }) ?? 0;
          return (
            <AdapterRow
              key={adapter.id}
              adapter={adapter}
              isConnected={isConnected}
              latencyMs={latency * 1000}
            />
          );
        })}
      </div>

      {/* Contrib Adapters */}
      <h3 className="fluid-text-sm mt-5 mb-3 flex items-center gap-2 font-medium text-(--color-muted)">
        <Activity size={16} className="text-(--color-primary)" aria-hidden="true" />
        {t('monitoring.contribAdapters')}
      </h3>
      <div className="space-y-2">
        {contribAdapters.map((adapter) => {
          const isConnected = (get('hems_adapter_connected', { adapter: adapter.id }) ?? 0) > 0;
          const latency = get('hems_adapter_latency_seconds', { adapter: adapter.id }) ?? 0;
          return (
            <AdapterRow
              key={adapter.id}
              adapter={adapter}
              isConnected={isConnected}
              latencyMs={latency * 1000}
              contrib
            />
          );
        })}
      </div>
    </motion.section>
  );
}
