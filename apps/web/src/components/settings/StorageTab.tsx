import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { clearAllData, getLocalStorageStats } from '../../lib/db';
import { ignorePromiseRejection } from '../../lib/ignore-promise-rejection';
import { useAppStoreShallow } from '../../store';
import { useConfirmDialog } from '../ConfirmDialog';
import { StorageTabLayout } from './StorageTabLayout';

/** Settings → Storage tab: InfluxDB connection, retention and local-storage info. */
export const StorageTab = () => {
  const { t } = useTranslation();
  const confirm = useConfirmDialog();
  const { settings, updateSettings } = useAppStoreShallow((s) => ({
    settings: s.settings,
    updateSettings: s.updateSettings,
  }));
  const [showInfluxToken, setShowInfluxToken] = useState(false);
  const [usageMb, setUsageMb] = useState(0);
  const [snapshots, setSnapshots] = useState(0);
  const [statsTick, setStatsTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    getLocalStorageStats()
      .then((stats) => {
        if (!cancelled) {
          setUsageMb(stats.usageMb);
          setSnapshots(stats.snapshots);
        }
      })
      .catch(ignorePromiseRejection);
    return () => {
      cancelled = true;
    };
  }, [statsTick]);

  const handleClearCache = () => {
    confirm.openDialog({
      title: t('settings.clearCacheConfirmTitle', 'Clear local cache'),
      message: t(
        'settings.clearCacheConfirmMessage',
        'This removes cached snapshots and offline data from this device. Settings are kept.',
      ),
      confirmText: t('settings.clearCacheConfirmAction', 'Clear cache'),
      variant: 'warning',
      onConfirm: async () => {
        await clearAllData();
        setStatsTick((n) => n + 1);
      },
    });
  };

  return (
    <StorageTabLayout
      settings={settings}
      showInfluxToken={showInfluxToken}
      usageMb={usageMb}
      snapshots={snapshots}
      onInfluxUrlChange={(value) => updateSettings({ influxUrl: value })}
      onInfluxTokenChange={(value) => updateSettings({ influxToken: value })}
      onHistoryDaysChange={(value) => updateSettings({ historyDays: value })}
      onToggleShowToken={() => setShowInfluxToken((v) => !v)}
      onClearCache={handleClearCache}
      confirm={confirm}
    />
  );
};
