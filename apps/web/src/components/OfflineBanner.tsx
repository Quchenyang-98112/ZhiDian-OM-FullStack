import { RefreshCw, WifiOff } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { getLatestEnergySnapshot } from '../lib/db';

export function OfflineBanner() {
  const { t } = useTranslation();
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [lastUpdate, setLastUpdate] = useState<{ timestamp: number; ageMinutes: number } | null>(
    null,
  );

  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = async () => {
      setIsOffline(true);
      const snapshot = await getLatestEnergySnapshot();
      if (snapshot) {
        setLastUpdate({ timestamp: snapshot.timestamp, ageMinutes: snapshot.ageMinutes });
      }
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Check initial state
    if (!navigator.onLine) {
      void handleOffline();
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return (
    <AnimatePresence>
      {isOffline && (
        <motion.div
          initial={{ opacity: 0, y: -50 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -50 }}
          className="fixed top-0 right-0 left-0 z-notification bg-(--state-offline-bg)/95 px-4 py-3 text-(--state-offline-on) shadow-lg backdrop-blur-3xl"
          role="alert"
          aria-atomic="true"
        >
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <WifiOff className="h-5 w-5 animate-pulse" aria-hidden="true" />
              <div>
                <p className="font-semibold">{t('offline.title')}</p>
                {lastUpdate && (
                  <p className="text-sm text-white/90">
                    {t('offline.lastUpdate', `Letzter Stand: vor ${lastUpdate.ageMinutes} Min.`, {
                      minutes: lastUpdate.ageMinutes,
                    })}
                  </p>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="focus-ring flex items-center gap-2 rounded-lg bg-white/20 px-4 py-2 transition-colors hover:bg-white/30"
              aria-label={t('offline.retry')}
            >
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              <span className="hidden font-medium text-sm sm:inline">{t('offline.retry')}</span>
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
