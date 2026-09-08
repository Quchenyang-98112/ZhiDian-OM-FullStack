import { Terminal } from 'lucide-react';
import { motion } from 'motion/react';
import { useTranslation } from 'react-i18next';
import type { EventLogEntry } from './types';
import { VirtualEventLog } from './VirtualEventLog';

export function EventLogSection({ eventLog }: { eventLog: EventLogEntry[] }) {
  const { t } = useTranslation();
  return (
    <motion.section
      className="glass-panel-strong hover-lift cv-auto p-6"
      aria-labelledby="event-log-title"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.44 }}
    >
      <h2 id="event-log-title" className="fluid-text-lg mb-4 flex items-center gap-2 font-medium">
        <Terminal size={20} className="text-(--color-secondary)" aria-hidden="true" />
        {t('monitoring.eventLog')}
      </h2>
      <VirtualEventLog events={eventLog} />
    </motion.section>
  );
}
