import { BatteryMedium, Sun, Zap } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { formatTariffPriceCompact, tariffFormatLocale } from '../../lib/format-tariff-price';
import { HeaderKpiPill } from './HeaderKpiPill';
import { batterySocTextClass, formatHeaderPower, gridPowerTextClass } from './header-kpi-format';
import { SelfSufficiencyRing } from './SelfSufficiencyRing';

/** Props for {@link AppShellHeaderPvPill}. */
export interface AppShellHeaderPvPillProps {
  /** PV production in watts. */
  pvPower: number;
}

/** PV production KPI pill. */
export function AppShellHeaderPvPill({ pvPower }: AppShellHeaderPvPillProps) {
  const { t } = useTranslation();
  return (
    <HeaderKpiPill title={t('header.pvPower')}>
      <Sun className="h-3 w-3 text-amber-400" aria-hidden="true" />
      <span className="text-(--color-text)">{formatHeaderPower(pvPower)}</span>
    </HeaderKpiPill>
  );
}

/** Props for {@link AppShellHeaderBatteryPill}. */
export interface AppShellHeaderBatteryPillProps {
  /** Battery state of charge (0–100). */
  batterySoC: number;
}

/** Battery SoC KPI pill. */
export function AppShellHeaderBatteryPill({ batterySoC }: AppShellHeaderBatteryPillProps) {
  const { t } = useTranslation();
  return (
    <HeaderKpiPill title={t('header.batterySoC')}>
      <BatteryMedium className={`h-3 w-3 ${batterySocTextClass(batterySoC)}`} aria-hidden="true" />
      <span className="text-(--color-text)">{Math.round(batterySoC)}%</span>
    </HeaderKpiPill>
  );
}

/** Props for {@link AppShellHeaderGridPill}. */
export interface AppShellHeaderGridPillProps {
  /** Grid power in watts (positive = import, negative = export). */
  gridPower: number;
}

/** Grid import/export KPI pill. */
export function AppShellHeaderGridPill({ gridPower }: AppShellHeaderGridPillProps) {
  const { t } = useTranslation();
  const colorClass = gridPowerTextClass(gridPower);
  return (
    <HeaderKpiPill title={gridPower >= 0 ? t('header.gridImport') : t('header.gridExport')}>
      <Zap className={`h-3 w-3 ${colorClass}`} aria-hidden="true" />
      <span className="text-(--color-text)">{formatHeaderPower(gridPower)}</span>
      <span className={`text-[10px] ${colorClass}`}>{gridPower >= 0 ? '↓' : '↑'}</span>
    </HeaderKpiPill>
  );
}

/** Props for {@link AppShellHeaderPricePill}. */
export interface AppShellHeaderPricePillProps {
  /** Current electricity price in €/kWh. */
  priceCurrent: number;
}

/** Mobile-only price KPI pill (cent/kWh). */
export function AppShellHeaderPricePill({ priceCurrent }: AppShellHeaderPricePillProps) {
  const { t, i18n } = useTranslation();
  const formatted = formatTariffPriceCompact(
    priceCurrent,
    tariffFormatLocale(i18n.resolvedLanguage ?? i18n.language),
    t('units.ctPerKwh'),
  );
  return (
    <HeaderKpiPill title={t('dashboard.currentPrice')} className="md:hidden">
      <span className="text-(--color-primary)">{formatted}</span>
    </HeaderKpiPill>
  );
}

/** Props for {@link AppShellHeaderSelfSufficiencyPill}. */
export interface AppShellHeaderSelfSufficiencyPillProps {
  /** Self-sufficiency ratio in the range 0–100. */
  selfSufficiencyPercent: number;
}

/** Self-sufficiency ring + percentage KPI pill. */
export function AppShellHeaderSelfSufficiencyPill({
  selfSufficiencyPercent,
}: AppShellHeaderSelfSufficiencyPillProps) {
  const { t } = useTranslation();
  return (
    <HeaderKpiPill title={t('header.selfSufficiency')}>
      <SelfSufficiencyRing percentage={selfSufficiencyPercent} />
      <span className="text-(--color-text)">{selfSufficiencyPercent}%</span>
    </HeaderKpiPill>
  );
}
