import { Check } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { ConfirmDialog, useConfirmDialog } from '../components/ConfirmDialog';
import { ReadOnlySettingsBanner } from '../components/settings/ReadOnlySettingsBanner';
import { SettingsPageHeader } from '../components/settings/SettingsPageHeader';
import { type SettingsTab, SettingsTabPanels } from '../components/settings/SettingsTabPanels';
import { buildSettingsTabs } from '../components/settings/settings-tab-definitions';
import { applySettingsTabParam, resolveSettingsTab } from '../lib/settings-tab-url';
import { triggerSettingsExport, triggerSettingsImport } from '../lib/settings-transfer';
import { useAppStoreShallow } from '../store';

export const Settings = () => {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const confirm = useConfirmDialog();
  const [importSuccess, setImportSuccess] = useState(false);
  const [exportSuccess, setExportSuccess] = useState(false);
  const { settings, updateSettings } = useAppStoreShallow((s) => ({
    settings: s.settings,
    updateSettings: s.updateSettings,
  }));

  const handleExportSettings = () => {
    triggerSettingsExport(settings, confirm, t, () => {
      setExportSuccess(true);
      setTimeout(() => setExportSuccess(false), 4000);
    });
  };

  const handleImportSettings = () => {
    triggerSettingsImport(updateSettings, confirm, t, () => {
      setImportSuccess(true);
      setTimeout(() => setImportSuccess(false), 4000);
    });
  };

  const tabParam = searchParams.get('tab');
  const activeTab = resolveSettingsTab(tabParam);

  const handleTabChange = (tab: SettingsTab) => {
    setSearchParams(applySettingsTabParam(searchParams, tab), { replace: true });
  };

  const tabs = buildSettingsTabs(t);

  return (
    <motion.div
      className="mx-auto max-w-5xl"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    >
      <SettingsPageHeader t={t} onExport={handleExportSettings} onImport={handleImportSettings} />

      <AnimatePresence>
        {importSuccess && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mb-4 flex items-center gap-2 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-emerald-400 text-sm"
            role="status"
          >
            <Check size={16} className="shrink-0" aria-hidden="true" />
            {t('common.importSuccess')}
          </motion.div>
        )}
        {exportSuccess && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mb-4 flex items-center gap-2 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-emerald-400 text-sm"
            role="status"
          >
            <Check size={16} className="shrink-0" aria-hidden="true" />
            {t('settings.exportSuccess', 'Settings exported successfully')}
          </motion.div>
        )}
      </AnimatePresence>

      <ReadOnlySettingsBanner />

      <div className="flex flex-col gap-6 lg:flex-row">
        <nav className="w-full shrink-0 lg:w-56">
          <div
            className="scrollbar-hide flex gap-1 overflow-x-auto pb-2 lg:flex-col lg:overflow-visible lg:pb-0"
            role="tablist"
            aria-label={t('settings.title')}
          >
            {tabs.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => handleTabChange(tab.key)}
                role="tab"
                aria-selected={activeTab === tab.key}
                aria-controls={`tabpanel-${tab.key}`}
                id={`tab-${tab.key}`}
                className={`flex items-center gap-2.5 whitespace-nowrap rounded-xl px-4 py-2.5 font-medium text-sm transition-all duration-200 active:scale-[0.97] ${
                  activeTab === tab.key
                    ? 'bg-(--color-primary)/15 text-(--color-primary) shadow-[inset_0_0_0_1px_var(--color-primary)/20]'
                    : 'text-(--color-muted) hover:bg-white/5 hover:text-(--color-text)'
                }`}
              >
                {tab.icon}
                <span>{tab.label}</span>
              </button>
            ))}
          </div>
        </nav>

        <div className="min-w-0 flex-1">
          <SettingsTabPanels activeTab={activeTab} />
        </div>
      </div>

      <ConfirmDialog {...confirm.dialogProps} />
    </motion.div>
  );
};
