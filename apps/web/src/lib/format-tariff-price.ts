/**
 * Tariff price formatting — single policy for header pills, Command Hub, and detail views.
 *
 * - **compact:** cent/kWh for KPI surfaces (header pill, hub metric card)
 * - **full:** €/kWh with three decimal places for analytics and tariff pages
 *
 * Callers must pass localized unit strings from `t('units.ctPerKwh')` / `t('units.euroPerKwh')`.
 */
export type TariffPriceFormatStyle = 'compact' | 'full';

export interface FormatTariffPriceOptions {
  style?: TariffPriceFormatStyle;
  /** BCP-47 locale for number formatting. */
  locale?: string;
  /** Localized unit label (e.g. from `t('units.ctPerKwh')`). */
  unit: string;
}

/** Map i18n language code to an Intl locale for tariff numbers. */
export function tariffFormatLocale(language: string | undefined): string {
  return language?.startsWith('en') ? 'en-US' : 'de-DE';
}

/** Convert €/kWh to a display string. Input is always EUR per kWh (not cents). */
export function formatTariffPrice(
  eurPerKwh: number,
  options: FormatTariffPriceOptions,
): { value: string; unit: string } {
  const style = options.style ?? 'compact';
  const locale = options.locale ?? 'de-DE';

  if (style === 'full') {
    const value = new Intl.NumberFormat(locale, {
      minimumFractionDigits: 3,
      maximumFractionDigits: 3,
    }).format(eurPerKwh);
    return { value, unit: options.unit };
  }

  const cents = eurPerKwh * 100;
  const roundedCents = ((Math.sign(cents) || 1) * Math.round(Math.abs(cents) * 10)) / 10;
  const value = new Intl.NumberFormat(locale, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(roundedCents);
  return { value, unit: options.unit };
}

/** Compact helper for inline KPI pills (value + unit as one string). */
export function formatTariffPriceCompact(eurPerKwh: number, locale: string, unit: string): string {
  const { value, unit: localizedUnit } = formatTariffPrice(eurPerKwh, {
    style: 'compact',
    locale,
    unit,
  });
  return `${value} ${localizedUnit}`;
}

/** Full-precision helper for detail bars and tariff analytics. */
export function formatTariffPriceFull(eurPerKwh: number, locale: string, unit: string): string {
  const { value, unit: localizedUnit } = formatTariffPrice(eurPerKwh, {
    style: 'full',
    locale,
    unit,
  });
  return `${value} ${localizedUnit}`;
}
