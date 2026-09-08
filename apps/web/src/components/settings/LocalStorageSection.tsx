import { HardDrive, Trash2 } from 'lucide-react';
import { motion } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { StorageStatsCards } from './StorageStatsCards';
import { sectionClass, sectionHeaderClass } from './styles';

export const LocalStorageSection = ({
  usageMb,
  snapshots,
  historyDays,
  onClearCache,
}: {
  usageMb: number;
  snapshots: number;
  historyDays: number;
  onClearCache: () => void;
}) => {
  const { t } = useTranslation();

  return (
    <section className={sectionClass}>
      <h2 className={sectionHeaderClass}>
        <HardDrive size={20} className="text-cyan-400" />
        {t('settings.localStorage', 'Local Storage')}
      </h2>
      <StorageStatsCards usageMb={usageMb} snapshots={snapshots} historyDays={historyDays} />
      <motion.button
        type="button"
        onClick={onClearCache}
        className="flex items-center gap-2 text-rose-400 text-sm transition-colors hover:text-rose-300"
        whileHover={{ x: 4 }}
      >
        <Trash2 size={16} />
        {t('settings.clearCache', 'Clear local cache')}
      </motion.button>
    </section>
  );
};
