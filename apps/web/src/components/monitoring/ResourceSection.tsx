import { Cpu, HardDrive, MemoryStick, Server } from 'lucide-react';
import { motion } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { NetworkIORow } from './NetworkIORow';
import { ResourceGauge } from './ResourceGauge';
import { SystemInfoRows } from './SystemInfoRows';

function cpuGaugeColor(cpuUsage: number): string {
  if (cpuUsage > 80) return 'bg-red-500/70';
  if (cpuUsage > 60) return 'bg-yellow-500/70';
  return 'bg-emerald-500/70';
}

function ramGaugeColor(memUsage: number): string {
  if (memUsage > 85) return 'bg-red-500/70';
  if (memUsage > 70) return 'bg-yellow-500/70';
  return 'bg-blue-500/70';
}

// skipcq: JS-0415
export function ResourceSection({
  cpuUsage,
  memUsage,
  diskUsage,
  networkIO,
}: {
  cpuUsage: number;
  memUsage: number;
  diskUsage: number;
  networkIO: number;
}) {
  const { t } = useTranslation();
  return (
    <motion.section
      className="glass-panel-strong hover-lift cv-auto-sm p-6"
      aria-labelledby="resources-title"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.38 }}
    >
      <h2 id="resources-title" className="fluid-text-lg mb-4 flex items-center gap-2 font-medium">
        <Server size={20} className="text-(--color-secondary)" aria-hidden="true" />
        {t('monitoring.resources')}
      </h2>
      <div className="space-y-4">
        <ResourceGauge
          icon={<Cpu size={16} className="text-purple-400" aria-hidden="true" />}
          label={t('monitoring.cpu')}
          value={cpuUsage}
          color={cpuGaugeColor(cpuUsage)}
        />
        <ResourceGauge
          icon={<MemoryStick size={16} className="text-blue-400" aria-hidden="true" />}
          label={t('monitoring.ram')}
          value={memUsage}
          color={ramGaugeColor(memUsage)}
        />
        <ResourceGauge
          icon={<HardDrive size={16} className="text-cyan-400" aria-hidden="true" />}
          label={t('monitoring.disk')}
          value={diskUsage}
          color="bg-cyan-500/70"
        />
        <NetworkIORow networkIO={networkIO} />
      </div>
      <SystemInfoRows />
    </motion.section>
  );
}
