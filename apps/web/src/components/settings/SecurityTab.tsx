import { Lock, Shield } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAppStoreShallow } from '../../store';
import { ApiAuthSettingsSection } from '../ApiAuthSettingsSection';
import { SettingsFeatureBar } from './SettingsFeatureBar';
import { sectionClass, sectionHeaderClass } from './styles';
import { ToggleSwitch } from './ToggleSwitch';

/** Settings → Security & Privacy tab: mTLS, telemetry, 2FA, API auth, encryption info. */
export function SecurityTab() {
  const { t } = useTranslation();
  const { settings, updateSettings } = useAppStoreShallow((s) => ({
    settings: s.settings,
    updateSettings: s.updateSettings,
  }));

  return (
    <>
      <SettingsFeatureBar tabId="security" />
      <section className={sectionClass}>
        <h2 className={sectionHeaderClass}>
          <Shield size={20} className="text-red-400" />
          {t('settings.security')}
        </h2>
        <div className="space-y-5">
          <div className="flex items-center justify-between rounded-xl border border-(--color-border) bg-(--color-surface) p-4">
            <div>
              <p className="font-medium text-sm">{t('settings.mtls')}</p>
              <p className="text-(--color-muted) text-xs">{t('settings.mtlsHint')}</p>
            </div>
            <ToggleSwitch
              id="mtls"
              checked={settings.mtls}
              onChange={(v) => updateSettings({ mtls: v })}
              label={t('settings.mtls')}
            />
          </div>
          <div className="flex items-center justify-between rounded-xl border border-(--color-border) bg-(--color-surface) p-4">
            <div>
              <p className="font-medium text-sm">{t('settings.telemetry')}</p>
              <p className="text-(--color-muted) text-xs">{t('settings.telemetryHint')}</p>
            </div>
            <ToggleSwitch
              id="telemetry"
              checked={settings.telemetryDisabled}
              onChange={(v) => updateSettings({ telemetryDisabled: v })}
              label={t('settings.telemetry')}
            />
          </div>
          <div className="flex items-center justify-between rounded-xl border border-(--color-border) bg-(--color-surface) p-4">
            <div>
              <p className="font-medium text-sm">{t('settings.twoFactor')}</p>
              <p className="text-(--color-muted) text-xs">{t('settings.twoFactorHint')}</p>
            </div>
            <ToggleSwitch
              id="2fa"
              checked={settings.twoFactor}
              onChange={(v) => updateSettings({ twoFactor: v })}
              label={t('settings.twoFactor')}
            />
          </div>
        </div>
      </section>

      <ApiAuthSettingsSection />

      {/* Encryption Info */}
      <section className={sectionClass}>
        <h2 className={sectionHeaderClass}>
          <Lock size={20} className="text-amber-400" />
          {t('settings.encryptionTitle', 'Encryption & Certificates')}
        </h2>
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
          <div className="flex items-start gap-3">
            <Shield size={20} className="mt-0.5 shrink-0 text-emerald-400" />
            <div className="space-y-1 text-sm">
              <p className="font-medium text-emerald-400">
                {t('settings.encryptionActive', 'End-to-end encryption active')}
              </p>
              <p className="text-(--color-muted)">
                {t(
                  'settings.encryptionDesc',
                  'All API keys are stored with AES-GCM 256-bit encryption. WebSocket connections use TLS. Local data stays in your browser.',
                )}
              </p>
            </div>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="rounded-xl border border-(--color-border) bg-(--color-surface) p-3">
            <p className="text-(--color-muted) text-xs">
              {t('settings.certStatus', 'Certificate Status')}
            </p>
            <p className="font-medium text-emerald-400 text-sm">
              {t('settings.certValid', 'Valid')}
            </p>
          </div>
          <div className="rounded-xl border border-(--color-border) bg-(--color-surface) p-3">
            <p className="text-(--color-muted) text-xs">{t('settings.encType', 'Encryption')}</p>
            <p className="font-medium text-sm">PBKDF2 + AES-GCM 256</p>
          </div>
        </div>
      </section>
    </>
  );
}
