/**
 * PWA Install Prompt Component
 * Displays install banner when PWA is installable
 * Features: deferred prompt, smart timing, platform-aware messaging
 */

import { CheckCircle2, Download, Monitor, Smartphone, X, Zap } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { usePWAInstall } from '../lib/pwa-install';

export function PWAInstallPrompt() {
  const { t } = useTranslation();
  const { canInstall, isIOSDevice, isInstalled, install } = usePWAInstall();
  const [showPrompt, setShowPrompt] = useState(false);
  const [showIOSHint, setShowIOSHint] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  useEffect(() => {
    if (isInstalled) return;

    // Check if dismissed in last 7 days
    const dismissed = localStorage.getItem('pwa-install-dismissed');
    if (dismissed) {
      const daysSinceDismissal = (Date.now() - parseInt(dismissed, 10)) / (1000 * 60 * 60 * 24);
      if (daysSinceDismissal < 7) return;
    }

    const timer = setTimeout(() => {
      if (canInstall) setShowPrompt(true);
      else if (isIOSDevice && !localStorage.getItem('pwa-installed')) setShowIOSHint(true);
    }, 20000);

    return () => clearTimeout(timer);
  }, [canInstall, isIOSDevice, isInstalled]);

  // Show success toast when installed
  useEffect(() => {
    if (!isInstalled) return;
    const wasShown = localStorage.getItem('pwa-install-success-shown');
    if (wasShown) return;

    localStorage.setItem('pwa-install-success-shown', 'true');
    // Use timeout to avoid synchronous setState in effect body
    const timer1 = setTimeout(() => {
      setShowSuccess(true);
      setShowPrompt(false);
    }, 0);
    const timer2 = setTimeout(() => setShowSuccess(false), 4000);
    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
    };
  }, [isInstalled]);

  const handleInstallClick = async () => {
    const accepted = await install();
    if (accepted) {
      setShowPrompt(false);
    }
  };

  const handleDismiss = () => {
    setShowPrompt(false);
    setShowIOSHint(false);
    localStorage.setItem('pwa-install-dismissed', Date.now().toString());
  };

  // Installation success toast
  if (showSuccess) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 50 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 50 }}
        className="fixed right-4 bottom-20 left-4 z-notification md:right-4 md:left-auto md:max-w-sm lg:bottom-4"
      >
        <div
          className="flex items-center gap-3 rounded-2xl border border-(--state-success-border) bg-(--state-success-bg)/10 p-4 shadow-2xl backdrop-blur-xl"
          role="alert"
        >
          <CheckCircle2 className="h-6 w-6 shrink-0 text-(--state-success-fg)" aria-hidden="true" />
          <div>
            <p className="font-semibold text-(--state-success-fg) text-sm">
              {t('pwa.installed', 'Successfully installed!')}
            </p>
            <p className="text-(--color-muted) text-xs">
              {t('pwa.installedDesc', 'Nexus HEMS is now available on your home screen')}
            </p>
          </div>
        </div>
      </motion.div>
    );
  }

  // iOS install hint
  if (showIOSHint) {
    return (
      <AnimatePresence>
        <motion.div
          initial={{ opacity: 0, y: 50 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 50 }}
          className="fixed right-4 bottom-20 left-4 z-notification md:right-4 md:left-auto md:max-w-md lg:bottom-4"
        >
          <div className="glass-panel rounded-2xl border-(--color-primary)/30 border-2 p-6 shadow-2xl">
            <button
              type="button"
              onClick={handleDismiss}
              className="absolute top-3 right-3 rounded-lg p-1 text-(--color-muted) hover:text-(--color-text)"
              aria-label={t('common.close', 'Close')}
            >
              <X className="h-4 w-4" />
            </button>
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-(--color-primary)/20">
                <Smartphone className="h-6 w-6 text-(--color-primary)" aria-hidden="true" />
              </div>
              <div>
                <h3 className="font-semibold text-(--color-text)">{t('pwa.installTitle')}</h3>
                <p className="mt-1 text-(--color-muted) text-sm">
                  {t(
                    'pwa.iosInstallHint',
                    'To install on iOS: tap the Share button in Safari, then select "Add to Home Screen".',
                  )}
                </p>
              </div>
            </div>
          </div>
        </motion.div>
      </AnimatePresence>
    );
  }

  if (!showPrompt) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 50 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 50 }}
        className="fixed right-4 bottom-20 left-4 z-notification md:right-4 md:left-auto md:max-w-md lg:bottom-4"
      >
        <div className="glass-panel rounded-2xl border-(--color-primary)/30 border-2 p-6 shadow-2xl">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-(--color-primary)/20">
                <Download className="h-6 w-6 text-(--color-primary)" aria-hidden="true" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-(--color-text)">{t('pwa.installTitle')}</h3>
                <p className="mt-1 text-(--color-muted) text-sm">{t('pwa.installDescription')}</p>
                <div className="mt-3 flex flex-wrap gap-2 text-(--color-muted) text-xs">
                  <span className="inline-flex items-center gap-1 rounded-full border border-(--color-border) px-2 py-0.5">
                    <Zap className="h-3 w-3 text-(--color-primary)" />{' '}
                    {t('pwa.featureFast', 'Faster loading')}
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full border border-(--color-border) px-2 py-0.5">
                    <Monitor className="h-3 w-3 text-blue-400" />{' '}
                    {t('pwa.featureOffline', 'Offline mode')}
                  </span>
                </div>
                <div className="mt-4 flex gap-2">
                  <button
                    type="button"
                    onClick={handleInstallClick}
                    className="btn-primary focus-ring px-4 py-2 text-sm"
                  >
                    {t('pwa.install')}
                  </button>
                  <button
                    type="button"
                    onClick={handleDismiss}
                    className="btn-secondary focus-ring px-4 py-2 text-sm"
                  >
                    {t('common.later', 'Later')}
                  </button>
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={handleDismiss}
              className="focus-ring rounded-lg p-1 text-(--color-muted) hover:text-(--color-text)"
              aria-label={t('common.close', 'Close')}
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
