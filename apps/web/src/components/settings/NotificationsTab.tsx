import { Bell, Clock, Gauge, Moon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAppStoreShallow } from '../../store';
import { SettingsFeatureBar } from './SettingsFeatureBar';
import { inputClass, sectionClass, sectionHeaderClass } from './styles';
import { ToggleSwitch } from './ToggleSwitch';

/** Settings → Notifications tab: alert toggles, thresholds and quiet hours. */
export function NotificationsTab() {
  const { t } = useTranslation();
  const { settings, updateSettings } = useAppStoreShallow((s) => ({
    settings: s.settings,
    updateSettings: s.updateSettings,
  }));

  return (
    <>
      <SettingsFeatureBar tabId="notifications" />
      <section className={sectionClass}>
        <h2 className={sectionHeaderClass}>
          <Bell size={20} className="text-yellow-400" />
          {t('settings.notifications', 'Notifications')}
        </h2>
        <div className="space-y-5">
          <div className="flex items-center justify-between rounded-xl border border-(--color-border) bg-(--color-surface) p-4">
            <div>
              <p className="font-medium text-sm">
                {t('settings.pushNotifications', 'Push notifications')}
              </p>
              <p className="text-(--color-muted) text-xs">
                {t('settings.pushHint', 'Receive alerts for important system events')}
              </p>
            </div>
            <ToggleSwitch
              id="push"
              checked={settings.pushNotifications ?? true}
              onChange={(v) => updateSettings({ pushNotifications: v })}
              label={t('settings.pushNotifications', 'Push notifications')}
            />
          </div>
          <div className="flex items-center justify-between rounded-xl border border-(--color-border) bg-(--color-surface) p-4">
            <div>
              <p className="font-medium text-sm">{t('settings.priceAlerts', 'Price alerts')}</p>
              <p className="text-(--color-muted) text-xs">
                {t(
                  'settings.priceAlertsHint',
                  'Notify when electricity price drops below threshold',
                )}
              </p>
            </div>
            <ToggleSwitch
              id="price-alerts"
              checked={settings.priceAlerts ?? true}
              onChange={(v) => updateSettings({ priceAlerts: v })}
              label={t('settings.priceAlerts', 'Price alerts')}
            />
          </div>
          <div className="flex items-center justify-between rounded-xl border border-(--color-border) bg-(--color-surface) p-4">
            <div>
              <p className="font-medium text-sm">{t('settings.batteryAlerts', 'Battery alerts')}</p>
              <p className="text-(--color-muted) text-xs">
                {t('settings.batteryAlertsHint', 'Alert when battery SoC falls below minimum')}
              </p>
            </div>
            <ToggleSwitch
              id="battery-alerts"
              checked={settings.batteryAlerts ?? true}
              onChange={(v) => updateSettings({ batteryAlerts: v })}
              label={t('settings.batteryAlerts', 'Battery alerts')}
            />
          </div>
          <div className="flex items-center justify-between rounded-xl border border-(--color-border) bg-(--color-surface) p-4">
            <div>
              <p className="font-medium text-sm">
                {t('settings.gridAlerts', 'Grid anomaly alerts')}
              </p>
              <p className="text-(--color-muted) text-xs">
                {t('settings.gridAlertsHint', 'Alert on voltage fluctuations or power outages')}
              </p>
            </div>
            <ToggleSwitch
              id="grid-alerts"
              checked={settings.gridAlerts ?? false}
              onChange={(v) => updateSettings({ gridAlerts: v })}
              label={t('settings.gridAlerts', 'Grid anomaly alerts')}
            />
          </div>
          <div className="flex items-center justify-between rounded-xl border border-(--color-border) bg-(--color-surface) p-4">
            <div>
              <p className="font-medium text-sm">
                {t('settings.updateNotifications', 'Update notifications')}
              </p>
              <p className="text-(--color-muted) text-xs">
                {t('settings.updateHint', 'Notify when a new app version is available')}
              </p>
            </div>
            <ToggleSwitch
              id="update-notif"
              checked={settings.updateNotifications ?? true}
              onChange={(v) => updateSettings({ updateNotifications: v })}
              label={t('settings.updateNotifications', 'Update notifications')}
            />
          </div>
        </div>
      </section>

      {/* Alert Thresholds */}
      <section className={sectionClass}>
        <h2 className={sectionHeaderClass}>
          <Gauge size={20} className="text-orange-400" />
          {t('settings.alertThresholds', 'Alert Thresholds')}
        </h2>
        <div className="space-y-5">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="font-medium text-sm">
                {t('settings.batteryAlertThreshold', 'Battery SoC alert level')}
              </p>
              <span className="font-mono text-(--color-primary) text-sm tabular-nums">
                {settings.batteryAlertThreshold ?? 15}%
              </span>
            </div>
            <input
              type="range"
              min={5}
              max={50}
              step={1}
              value={settings.batteryAlertThreshold ?? 15}
              onChange={(e) => updateSettings({ batteryAlertThreshold: Number(e.target.value) })}
              className="w-full accent-(--color-primary)"
              aria-label={t('settings.batteryAlertThreshold', 'Battery SoC alert level')}
              aria-valuetext={`${settings.batteryAlertThreshold ?? 15}%`}
            />
            <p className="text-(--color-muted) text-xs">
              {t(
                'settings.batteryAlertThresholdHint',
                'Alert when battery falls below this charge level',
              )}
            </p>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="font-medium text-sm">
                {t('settings.priceAlertThreshold', 'Price alert threshold')}
              </p>
              <span className="font-mono text-(--color-primary) text-sm tabular-nums">
                {(settings.priceAlertThreshold ?? 0.1).toFixed(2)} €/kWh
              </span>
            </div>
            <input
              type="range"
              min={0.02}
              max={0.5}
              step={0.01}
              value={settings.priceAlertThreshold ?? 0.1}
              onChange={(e) => updateSettings({ priceAlertThreshold: Number(e.target.value) })}
              className="w-full accent-(--color-primary)"
              aria-label={t('settings.priceAlertThreshold', 'Price alert threshold')}
              aria-valuetext={`${(settings.priceAlertThreshold ?? 0.1).toFixed(2)} €/kWh`}
            />
            <p className="text-(--color-muted) text-xs">
              {t(
                'settings.priceAlertThresholdHint',
                'Notify when grid price drops below this value',
              )}
            </p>
          </div>
        </div>
      </section>

      {/* Quiet Hours */}
      <section className={sectionClass}>
        <h2 className={sectionHeaderClass}>
          <Moon size={20} className="text-indigo-400" />
          {t('settings.quietHours', 'Quiet Hours')}
        </h2>
        <div className="space-y-5">
          <div className="flex items-center justify-between rounded-xl border border-(--color-border) bg-(--color-surface) p-4">
            <div>
              <p className="font-medium text-sm">
                {t('settings.quietHoursEnabled', 'Enable quiet hours')}
              </p>
              <p className="text-(--color-muted) text-xs">
                {t(
                  'settings.quietHoursHint',
                  'Suppress non-critical notifications during specified hours',
                )}
              </p>
            </div>
            <ToggleSwitch
              id="quiet-hours"
              checked={settings.quietHoursEnabled ?? false}
              onChange={(v) => updateSettings({ quietHoursEnabled: v })}
              label={t('settings.quietHoursEnabled', 'Enable quiet hours')}
            />
          </div>
          {(settings.quietHoursEnabled ?? false) && (
            <div className="grid grid-cols-1 gap-4 min-[400px]:grid-cols-2">
              <div className="space-y-2">
                <label
                  htmlFor="quiet-start"
                  className="flex items-center gap-2 font-medium text-sm"
                >
                  <Clock size={14} className="text-(--color-muted)" />
                  {t('settings.quietHoursStart', 'Start')}
                </label>
                <input
                  id="quiet-start"
                  type="time"
                  value={settings.quietHoursStart ?? '22:00'}
                  onChange={(e) => updateSettings({ quietHoursStart: e.target.value })}
                  className={inputClass}
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="quiet-end" className="flex items-center gap-2 font-medium text-sm">
                  <Clock size={14} className="text-(--color-muted)" />
                  {t('settings.quietHoursEnd', 'End')}
                </label>
                <input
                  id="quiet-end"
                  type="time"
                  value={settings.quietHoursEnd ?? '07:00'}
                  onChange={(e) => updateSettings({ quietHoursEnd: e.target.value })}
                  className={inputClass}
                />
              </div>
            </div>
          )}
        </div>
      </section>
    </>
  );
}
