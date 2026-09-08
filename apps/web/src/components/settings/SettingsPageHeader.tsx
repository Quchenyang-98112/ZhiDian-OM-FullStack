import type { TFunction } from 'i18next';
import { Download, Settings as SettingsIcon, Upload } from 'lucide-react';
import { motion } from 'motion/react';

/** Animated title row with export/import actions on the Settings page. */
export const SettingsPageHeader = ({
  t,
  onExport,
  onImport,
}: {
  t: TFunction;
  onExport: () => void;
  onImport: () => void;
}) => (
  <motion.div
    className="mb-8 flex flex-col justify-between gap-3 sm:flex-row sm:items-center"
    initial={{ opacity: 0, x: -20 }}
    animate={{ opacity: 1, x: 0 }}
    transition={{ duration: 0.5, delay: 0.1 }}
  >
    <div className="flex items-center gap-3">
      <motion.div
        className="flex h-10 w-10 items-center justify-center rounded-xl border border-(--color-border) bg-(--color-primary)/10"
        animate={{ rotate: [0, 90, 0] }}
        transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
      >
        <SettingsIcon className="text-(--color-primary)" size={22} />
      </motion.div>
      <div>
        <h1 className="fluid-text-2xl font-semibold tracking-tight">{t('settings.title')}</h1>
        <p className="text-(--color-muted) text-sm">
          {t('settings.subtitle', 'Configure your HEMS dashboard')}
        </p>
      </div>
    </div>
    <div className="flex items-center gap-2 self-end sm:self-auto">
      <motion.button
        type="button"
        onClick={onExport}
        className="focus-ring inline-flex items-center gap-2 rounded-xl border border-(--color-border) bg-(--color-surface-strong) px-3 py-2 text-sm transition-all hover:bg-(--color-primary)/10"
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        title={t('settings.exportSettings', 'Export settings')}
      >
        <Download size={16} aria-hidden="true" />
        <span className="hidden sm:inline">{t('settings.export', 'Export')}</span>
      </motion.button>
      <motion.button
        type="button"
        onClick={onImport}
        className="focus-ring inline-flex items-center gap-2 rounded-xl border border-(--color-border) bg-(--color-surface-strong) px-3 py-2 text-sm transition-all hover:bg-(--color-primary)/10"
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        title={t('settings.importSettings', 'Import settings')}
      >
        <Upload size={16} aria-hidden="true" />
        <span className="hidden sm:inline">{t('settings.import', 'Import')}</span>
      </motion.button>
    </div>
  </motion.div>
);
