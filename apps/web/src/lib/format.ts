export function formatNumber(value: number, locale: string, maximumFractionDigits = 1) {
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: 0,
    maximumFractionDigits,
  }).format(value);
}

export function formatPower(value: number, locale: string) {
  const kilowatts = value / 1000;
  return `${formatNumber(kilowatts, locale, 2)} kW`;
}

export function formatEnergy(value: number, locale: string) {
  return `${formatNumber(value, locale, 1)} kWh`;
}

export function formatCurrencyPerKwh(value: number, locale: string) {
  return `${formatNumber(value, locale, 3)} €/kWh`;
}

export function formatPercent(value: number, locale: string) {
  return `${formatNumber(value, locale, 1)} %`;
}

/** German grid CO₂ emission factor (g CO₂/kWh) — Umweltbundesamt 2024 average */
const GRID_CO2_FACTOR = 380;

/**
 * Calculates CO₂ savings from self-consumed PV generation.
 * @param pvKwh - PV generation in kWh that displaced grid import
 * @returns CO₂ saved in kg
 */
export function calculateCo2Savings(pvKwh: number): number {
  return (pvKwh * GRID_CO2_FACTOR) / 1000;
}
