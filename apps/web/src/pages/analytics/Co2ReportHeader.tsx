import type { TFunction } from 'i18next';
import { TreePine } from 'lucide-react';

/** CO₂ report section header with UBA factor badge. */
export const Co2ReportHeader = ({
  t,
  currentYear,
  ubaFactor,
}: {
  t: TFunction;
  currentYear: number;
  ubaFactor: number;
}) => (
  <div className="flex flex-wrap items-center justify-between gap-3">
    <div className="flex items-center gap-2">
      <TreePine size={20} className="text-emerald-400" aria-hidden="true" />
      <div>
        <h3 className="fluid-text-base font-semibold text-(--color-text)">
          {t('analytics.co2ReportTitle')}
        </h3>
        <p className="text-(--color-muted) text-xs">{t('analytics.co2ReportSubtitle')}</p>
      </div>
    </div>
    <span className="rounded-full bg-emerald-500/15 px-3 py-1 font-medium text-emerald-300 text-xs">
      UBA {currentYear}: {ubaFactor} g CO₂/kWh
    </span>
  </div>
);
