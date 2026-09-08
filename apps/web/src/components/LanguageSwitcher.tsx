import { Languages } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { useAppStore } from '../store';
import type { LocaleCode } from '../types';

const locales: LocaleCode[] = ['zh', 'en', 'de'];

export function LanguageSwitcher() {
  const { i18n, t } = useTranslation();
  const locale = useAppStore((state) => state.locale);
  const setLocale = useAppStore((state) => state.setLocale);

  const handleLocaleChange = (nextLocale: LocaleCode) => {
    setLocale(nextLocale);
    void i18n.changeLanguage(nextLocale);
    localStorage.setItem('nexus-hems-language', nextLocale);
  };

  return (
    // biome-ignore lint/a11y/useSemanticElements: div with role=group for button group; fieldset would require legend and is not appropriate for inline button group
    <div
      role="group"
      aria-label={t('common.language')}
      className="flex items-center gap-2 rounded-full border border-(--color-border) bg-(--color-surface-strong) px-2 py-1.5 backdrop-blur-3xl"
    >
      <Languages className="h-4 w-4 text-(--color-muted)" aria-hidden="true" />
      <span className="sr-only">{t('common.language')}</span>
      {locales.map((entry) => (
        <button
          key={entry}
          type="button"
          onClick={() => handleLocaleChange(entry)}
          className={`focus-visible:focus-ring rounded-full px-3 py-1 font-semibold text-xs uppercase tracking-[0.22em] transition ${
            locale === entry
              ? 'bg-(--color-text) text-(--color-background) shadow-[0_0_20px_var(--color-glow)]'
              : 'text-(--color-muted) hover:text-(--color-text)'
          }`}
          aria-pressed={locale === entry}
          aria-label={t('common.switchTo', {
            lang: entry.toUpperCase(),
            defaultValue: `Switch to ${entry.toUpperCase()}`,
          })}
        >
          {entry}
        </button>
      ))}
    </div>
  );
}
