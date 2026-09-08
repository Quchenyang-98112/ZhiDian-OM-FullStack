import {
  CheckCircle2,
  Download,
  HardDrive,
  Lock,
  RefreshCw,
  Smartphone,
  Trash2,
} from 'lucide-react';
import { motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import packageJson from '../../../package.json';
import { usePWAInstall } from '../../lib/pwa-install';
import { ConfirmDialog, useConfirmDialog } from '../ConfirmDialog';
import {
  installStatusDescriptionKey,
  type SWStatus,
  swBadgeClass,
  swDotClass,
  swStatusDescriptionKey,
  swStatusLabelKey,
  type UpdateStatus,
  updateStatusDescriptionKey,
} from './pwa-helpers';

export function PWASettingsSection() {
  const { t } = useTranslation();
  const { canInstall, isIOSDevice, isInstalled, install } = usePWAInstall();
  const confirm = useConfirmDialog();
  const [swStatus, setSWStatus] = useState<SWStatus>('none');
  const [cacheSize, setCacheSize] = useState<string | null>(null);
  const [installing, setInstalling] = useState(false);
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>('idle');
  const [persistedStorage, setPersistedStorage] = useState<boolean | null>(null);

  useEffect(() => {
    // Check service worker status
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistration().then((reg) => {
        if (reg?.active) setSWStatus(reg.waiting ? 'waiting' : 'active');
      });
    }
    // Estimate cache size
    if ('storage' in navigator && 'estimate' in navigator.storage) {
      navigator.storage.estimate().then((estimate) => {
        if (estimate.usage) {
          const mb = (estimate.usage / (1024 * 1024)).toFixed(1);
          setCacheSize(`${mb} MB`);
        }
      });
    }
    // Check persistent storage
    if (navigator.storage?.persisted) {
      navigator.storage.persisted().then(setPersistedStorage);
    }
  }, []);

  const handleInstall = async () => {
    setInstalling(true);
    await install();
    setInstalling(false);
  };

  const handleClearCache = () => {
    confirm.openDialog({
      title: t('settings_pwa.clearCacheConfirmTitle', 'Clear App Cache'),
      message: t(
        'settings_pwa.clearCacheConfirmMessage',
        'This will clear all cached data and reload the app. Your settings will be preserved.',
      ),
      confirmText: t('settings_pwa.clearCacheConfirmAction', 'Clear & Reload'),
      variant: 'warning',
      onConfirm: async () => {
        if ('serviceWorker' in navigator) {
          const regs = await navigator.serviceWorker.getRegistrations();
          for (const r of regs) await r.unregister();
          const names = await caches.keys();
          await Promise.all(names.map((n) => caches.delete(n)));
          window.location.reload();
        }
      },
    });
  };

  const handleForceUpdate = async () => {
    setUpdateStatus('checking');
    try {
      if ('serviceWorker' in navigator) {
        const reg = await navigator.serviceWorker.getRegistration();
        if (reg) {
          await reg.update();
          // Check if a new SW is waiting after the update
          await new Promise((r) => setTimeout(r, 1500));
          const regAfter = await navigator.serviceWorker.getRegistration();
          if (regAfter?.waiting) {
            setUpdateStatus('found');
            setSWStatus('waiting');
            setTimeout(() => window.location.reload(), 1500);
          } else {
            setUpdateStatus('none');
            setTimeout(() => setUpdateStatus('idle'), 3000);
          }
        } else {
          setUpdateStatus('none');
          setTimeout(() => setUpdateStatus('idle'), 3000);
        }
      }
    } catch {
      setUpdateStatus('none');
      setTimeout(() => setUpdateStatus('idle'), 3000);
    }
  };

  const handleRequestPersistence = async () => {
    if (navigator.storage?.persist) {
      const granted = await navigator.storage.persist();
      setPersistedStorage(granted);
    }
  };

  const sectionClass =
    'rounded-2xl border border-(--color-border) bg-(--color-surface)/50 p-6 backdrop-blur-sm';
  const sectionHeaderClass =
    'mb-5 flex items-center gap-3 text-lg fluid-text-lg font-semibold text-(--color-text)';
  const rowClass =
    'flex items-center justify-between p-4 rounded-xl border border-(--color-border) bg-(--color-surface)';
  const updateDescriptionKey = updateStatusDescriptionKey(updateStatus);

  return (
    <>
      <section className={sectionClass}>
        <h2 className={sectionHeaderClass}>
          <Smartphone size={20} className="text-sky-400" />
          {t('settings_pwa.title', 'Progressive Web App')}
        </h2>
        <div className="space-y-4">
          {/* Install status */}
          <div className={rowClass}>
            <div>
              <p className="font-medium text-sm">
                {t('settings_pwa.installStatus', 'Installation')}
              </p>
              <p className="text-(--color-muted) text-xs">
                {t(installStatusDescriptionKey({ isInstalled, isIOSDevice, canInstall }))}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {isInstalled ? (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 font-medium text-emerald-400 text-xs">
                  <CheckCircle2 size={14} />
                  {t('settings_pwa.installedBadge', 'Installed')}
                </span>
              ) : canInstall ? (
                <motion.button
                  onClick={handleInstall}
                  disabled={installing}
                  className="focus-ring flex items-center gap-2 rounded-xl bg-(--color-text) px-4 py-2 font-medium text-(--color-background) text-sm transition-opacity hover:opacity-90 disabled:opacity-50"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <Download size={16} />
                  {installing
                    ? t('settings_pwa.installing', 'Installing…')
                    : t('pwa.install', 'Install')}
                </motion.button>
              ) : null}
            </div>
          </div>

          {/* Service Worker status */}
          <div className={rowClass}>
            <div>
              <p className="font-medium text-sm">
                {t('settings_pwa.serviceWorker', 'Service Worker')}
              </p>
              <p className="text-(--color-muted) text-xs">{t(swStatusDescriptionKey(swStatus))}</p>
            </div>
            <div className="flex items-center gap-2">
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 font-medium text-xs ${swBadgeClass(swStatus)}`}
              >
                <span
                  className={`h-2 w-2 rounded-full ${swDotClass(swStatus)}`}
                  aria-hidden="true"
                />
                {t(swStatusLabelKey(swStatus))}
              </span>
            </div>
          </div>

          {/* Force update check */}
          <div className={rowClass}>
            <div>
              <p className="font-medium text-sm">
                {t('settings_pwa.forceUpdate', 'Check for Update')}
              </p>
              <p className="text-(--color-muted) text-xs">
                {updateDescriptionKey
                  ? t(updateDescriptionKey)
                  : t('settings_pwa.appVersion', { version: packageJson.version })}
              </p>
            </div>
            <motion.button
              onClick={handleForceUpdate}
              disabled={updateStatus === 'checking' || updateStatus === 'found'}
              className="focus-ring flex items-center gap-2 rounded-xl border border-(--color-border) bg-(--color-surface-strong) px-3 py-2 text-(--color-muted) text-xs transition-colors hover:border-(--color-primary)/30 hover:text-(--color-primary) disabled:opacity-50"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <RefreshCw size={14} className={updateStatus === 'checking' ? 'animate-spin' : ''} />
              {updateStatus === 'checking'
                ? t('settings_pwa.forceUpdateChecking', 'Checking…')
                : t('settings_pwa.forceUpdate', 'Check for Update')}
            </motion.button>
          </div>

          {/* Cache info */}
          <div className={rowClass}>
            <div>
              <p className="font-medium text-sm">{t('settings_pwa.cache', 'Cache Storage')}</p>
              <p className="text-(--color-muted) text-xs">
                {cacheSize
                  ? t('settings_pwa.cacheSize', 'Using {{size}} of device storage', {
                      size: cacheSize,
                    })
                  : t('settings_pwa.cacheUnknown', 'Storage usage unavailable')}
              </p>
            </div>
            <motion.button
              onClick={handleClearCache}
              className="focus-ring flex items-center gap-2 rounded-xl border border-(--color-border) bg-(--color-surface-strong) px-3 py-2 text-(--color-muted) text-xs transition-colors hover:border-rose-500/30 hover:text-rose-400"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <Trash2 size={14} />
              {t('settings_pwa.clearCache', 'Clear Cache')}
            </motion.button>
          </div>

          {/* Persistent storage */}
          <div className={rowClass}>
            <div>
              <p className="font-medium text-sm">
                {t('settings_pwa.persistentStorage', 'Persistent Storage')}
              </p>
              <p className="text-(--color-muted) text-xs">
                {persistedStorage === true
                  ? t(
                      'settings_pwa.persistentStorageGranted',
                      'Data protected from browser cleanup',
                    )
                  : t(
                      'settings_pwa.persistentStorageDenied',
                      'Browser may clear data when storage is low',
                    )}
              </p>
            </div>
            {persistedStorage === true ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 font-medium text-emerald-400 text-xs">
                <Lock size={12} />
                {t('common.active', 'Active')}
              </span>
            ) : (
              <motion.button
                onClick={handleRequestPersistence}
                className="focus-ring flex items-center gap-2 rounded-xl border border-(--color-border) bg-(--color-surface-strong) px-3 py-2 text-(--color-muted) text-xs transition-colors hover:border-(--color-primary)/30 hover:text-(--color-primary)"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                <HardDrive size={14} />
                {t('settings_pwa.persistentStorageRequest', 'Request persistent storage')}
              </motion.button>
            )}
          </div>
        </div>
      </section>
      <ConfirmDialog {...confirm.dialogProps} />
    </>
  );
}
