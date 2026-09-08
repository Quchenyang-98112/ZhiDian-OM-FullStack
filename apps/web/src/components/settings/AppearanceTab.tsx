import { Eye, Globe, Info, Monitor, Palette, Type } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { themeDefinitions, themeOrder } from '../../design-tokens';
import { resolveTheme, type ThemePreference } from '../../lib/theme';
import { useAppStoreShallow } from '../../store';
import { LanguageSwitcher } from '../LanguageSwitcher';
import { SelectField } from '../ui/SelectField';
import { SettingsFeatureBar } from './SettingsFeatureBar';
import { sectionClass, sectionHeaderClass } from './styles';
import { ThemePreviewCard } from './ThemePreviewCard';
import { ToggleSwitch } from './ToggleSwitch';

/** Settings → Appearance tab: theme selection, display, language/region, accessibility. */
export function AppearanceTab() {
  const { t, i18n } = useTranslation();
  const {
    theme,
    themePreference,
    setThemePreference,
    setTheme,
    locale,
    setLocale,
    settings,
    updateSettings,
  } = useAppStoreShallow((s) => ({
    theme: s.theme,
    themePreference: s.themePreference,
    setThemePreference: s.setThemePreference,
    setTheme: s.setTheme,
    locale: s.locale,
    setLocale: s.setLocale,
    settings: s.settings,
    updateSettings: s.updateSettings,
  }));
  const isSystem = themePreference === 'system';

  const handleThemeChange = (preference: ThemePreference) => {
    setThemePreference(preference);
    setTheme(resolveTheme(preference));
  };

  return (
    <>
      <SettingsFeatureBar tabId="appearance" />
      {/* Theme Selection */}
      <section className={sectionClass}>
        <h2 className={sectionHeaderClass}>
          <Palette size={20} className="text-(--color-primary)" />
          {t('settings.themeTitle', 'Color Theme')}
        </h2>

        {/* System Theme Toggle */}
        <div className="flex items-center justify-between rounded-xl border border-(--color-border) bg-(--color-surface) p-4">
          <div className="flex items-center gap-3">
            <Monitor size={20} className="text-(--color-muted)" />
            <div>
              <p className="font-medium text-sm">
                {t('settings.systemTheme', 'Follow system preference')}
              </p>
              <p className="text-(--color-muted) text-xs">
                {t(
                  'settings.systemThemeHint',
                  'Automatically switch between light and dark themes',
                )}
              </p>
            </div>
          </div>
          <ToggleSwitch
            id="system-theme"
            checked={isSystem}
            onChange={(v) => handleThemeChange(v ? 'system' : theme)}
            label={t('settings.systemTheme', 'Follow system preference')}
          />
        </div>

        {/* Theme Grid */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {themeOrder.map((name) => (
            <ThemePreviewCard
              key={name}
              def={themeDefinitions[name]}
              isActive={!isSystem && theme === name}
              onClick={() => handleThemeChange(name)}
            />
          ))}
        </div>

        {/* Active Theme Info */}
        <div className="flex items-center gap-2 rounded-lg border border-(--color-primary)/20 bg-(--color-primary)/5 px-4 py-3 text-sm">
          <Info size={16} className="shrink-0 text-(--color-primary)" />
          <span>
            {t('settings.activeTheme', 'Active')}: <strong>{themeDefinitions[theme].label}</strong>
            {isSystem && <span className="text-(--color-muted)"> ({t('common.systemTheme')})</span>}
          </span>
        </div>
      </section>

      {/* Display Settings */}
      <section className={sectionClass}>
        <h2 className={sectionHeaderClass}>
          <Eye size={20} className="text-blue-400" />
          {t('settings.displayTitle', 'Display')}
        </h2>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-sm">{t('settings.animations', 'Animations')}</p>
              <p className="text-(--color-muted) text-xs">
                {t('settings.animationsHint', 'Enable smooth transitions and motion effects')}
              </p>
            </div>
            <ToggleSwitch
              id="animations"
              checked={settings.animations ?? true}
              onChange={(v) => updateSettings({ animations: v })}
              label={t('settings.animations', 'Animations')}
            />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-sm">{t('settings.compactMode', 'Compact mode')}</p>
              <p className="text-(--color-muted) text-xs">
                {t('settings.compactModeHint', 'Reduce spacing for more content on screen')}
              </p>
            </div>
            <ToggleSwitch
              id="compact"
              checked={settings.compactMode ?? false}
              onChange={(v) => updateSettings({ compactMode: v })}
              label={t('settings.compactMode', 'Compact mode')}
            />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-sm">{t('settings.glowEffects', 'Glow effects')}</p>
              <p className="text-(--color-muted) text-xs">
                {t('settings.glowEffectsHint', 'Neon glow and glassmorphism effects')}
              </p>
            </div>
            <ToggleSwitch
              id="glow"
              checked={settings.glowEffects ?? true}
              onChange={(v) => updateSettings({ glowEffects: v })}
              label={t('settings.glowEffects', 'Glow effects')}
            />
          </div>
        </div>
      </section>

      {/* Language */}
      <section className={sectionClass}>
        <h2 className={sectionHeaderClass}>
          <Globe size={20} className="text-cyan-400" />
          {t('settings.languageTitle', 'Language & Region')}
        </h2>
        <div className="mb-4 flex items-center gap-3">
          <span className="text-(--color-muted) text-sm">
            {t('settings.quickSwitch', 'Quick switch')}:
          </span>
          <LanguageSwitcher />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <SelectField
            id="settings-language"
            label={t('common.language')}
            value={locale}
            onChange={(e) => {
              const l = e.target.value as 'de' | 'en';
              setLocale(l);
              void i18n.changeLanguage(l);
            }}
          >
            <option value="de">Deutsch</option>
            <option value="en">English</option>
          </SelectField>
          <SelectField
            id="settings-units"
            label={t('settings.units', 'Units')}
            value={settings.units ?? 'metric'}
            onChange={(e) => updateSettings({ units: e.target.value as 'metric' | 'imperial' })}
          >
            <option value="metric">{t('settings.metric', 'Metric (kW, kWh, °C)')}</option>
            <option value="imperial">{t('settings.imperial', 'Imperial (BTU, °F)')}</option>
          </SelectField>
          <SelectField
            id="settings-dateformat"
            label={t('settings.dateFormat', 'Date format')}
            value={settings.dateFormat ?? 'dd.mm.yyyy'}
            onChange={(e) =>
              updateSettings({
                dateFormat: e.target.value as 'dd.mm.yyyy' | 'mm/dd/yyyy' | 'yyyy-mm-dd',
              })
            }
          >
            <option value="dd.mm.yyyy">DD.MM.YYYY</option>
            <option value="mm/dd/yyyy">MM/DD/YYYY</option>
            <option value="yyyy-mm-dd">YYYY-MM-DD</option>
          </SelectField>
          <SelectField
            id="settings-currency"
            label={t('settings.currency', 'Currency')}
            value={settings.currency ?? 'eur'}
            onChange={(e) => updateSettings({ currency: e.target.value as 'eur' | 'chf' | 'gbp' })}
          >
            <option value="eur">€ Euro</option>
            <option value="chf">CHF Franken</option>
            <option value="gbp">£ Pound</option>
          </SelectField>
        </div>
      </section>

      {/* Accessibility */}
      <section className={sectionClass}>
        <h2 className={sectionHeaderClass}>
          <Type size={20} className="text-violet-400" />
          {t('settings.accessibilityTitle', 'Accessibility')}
        </h2>
        <div className="space-y-5">
          {/* Font Scale */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-sm">{t('settings.fontScale', 'Font size')}</p>
                <p className="text-(--color-muted) text-xs">
                  {t('settings.fontScaleHint', 'Adjust the global font size scaling')}
                </p>
              </div>
              <span className="font-mono text-(--color-primary) text-sm tabular-nums">
                {Math.round((settings.fontScale ?? 1.0) * 100)}%
              </span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-(--color-muted) text-xs">A</span>
              <input
                type="range"
                min={0.85}
                max={1.25}
                step={0.05}
                value={settings.fontScale ?? 1.0}
                onChange={(e) => updateSettings({ fontScale: Number(e.target.value) })}
                className="flex-1 accent-(--color-primary)"
                aria-label={t('settings.fontScale', 'Font size')}
                aria-valuetext={`${Math.round((settings.fontScale ?? 1.0) * 100)}%`}
              />
              <span className="font-medium text-(--color-muted) text-base">A</span>
            </div>
          </div>
          {/* Reduced Motion */}
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-sm">{t('settings.reducedMotion', 'Reduced motion')}</p>
              <p className="text-(--color-muted) text-xs">
                {t('settings.reducedMotionHint', 'Minimize animations for motion-sensitive users')}
              </p>
            </div>
            <ToggleSwitch
              id="reduced-motion"
              checked={settings.reducedMotion ?? false}
              onChange={(v) => updateSettings({ reducedMotion: v })}
              label={t('settings.reducedMotion', 'Reduced motion')}
            />
          </div>
          {/* High Contrast */}
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-sm">{t('settings.highContrast', 'High contrast')}</p>
              <p className="text-(--color-muted) text-xs">
                {t('settings.highContrastHint', 'Increase contrast ratios for better readability')}
              </p>
            </div>
            <ToggleSwitch
              id="high-contrast"
              checked={settings.highContrast ?? false}
              onChange={(v) => updateSettings({ highContrast: v })}
              label={t('settings.highContrast', 'High contrast')}
            />
          </div>
        </div>
      </section>
    </>
  );
}
