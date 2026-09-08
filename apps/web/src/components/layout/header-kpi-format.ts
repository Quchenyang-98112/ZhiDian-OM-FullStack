/**
 * @module header-kpi-format
 * Formatting helpers for compact header KPI pills.
 */

/** Format absolute power in W or kW for the mobile header ticker. */
export function formatHeaderPower(watts: number): string {
  const abs = Math.abs(watts);
  return abs >= 1000 ? `${(abs / 1000).toFixed(1)} kW` : `${Math.round(abs)} W`;
}

/** Tailwind text color class for battery state-of-charge thresholds. */
export function batterySocTextClass(soc: number): string {
  if (soc > 50) return 'text-(--color-neon-green)';
  if (soc > 20) return 'text-amber-400';
  return 'text-red-400';
}

/** Tailwind text color class for grid import (positive) vs export (negative). */
export function gridPowerTextClass(gridPower: number): string {
  return gridPower >= 0 ? 'text-red-400' : 'text-(--color-neon-green)';
}
