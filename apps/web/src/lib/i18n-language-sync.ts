import { ignorePromiseRejection } from './ignore-promise-rejection';

type I18nLike = {
  language: string;
  changeLanguage: (lng: string) => Promise<unknown>;
};

/**
 * Push the persisted store `locale` into i18next when the two differ.
 *
 * Compares `i18n.language` (the exact code set synchronously by
 * `changeLanguage`), NOT `i18n.resolvedLanguage` — the latter is
 * region/fallback-resolved and lags behind the async locale-bundle load, which
 * made the command-palette language toggle apply once and then skip the switch
 * back. Kept as a pure, dependency-free helper so the guard is unit-testable.
 */
export function syncI18nLanguage(i18n: I18nLike, locale: string): void {
  if (i18n.language !== locale) {
    void i18n.changeLanguage(locale).catch(ignorePromiseRejection);
  }
}
