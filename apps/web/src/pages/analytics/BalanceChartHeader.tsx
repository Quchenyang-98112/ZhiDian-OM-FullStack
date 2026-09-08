import type { TFunction } from 'i18next';
import { Clock } from 'lucide-react';

/** Header row with legend for the 24h energy balance chart. */
export const BalanceChartHeader = ({ t }: { t: TFunction }) => (
  <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
    <h2 id="balance-chart-title" className="fluid-text-lg flex items-center gap-2 font-medium">
      <Clock size={20} className="text-(--color-secondary)" aria-hidden="true" />
      {t('analytics.energyBalance24h')}
    </h2>
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px]">
      <span className="flex items-center gap-1">
        <span className="inline-block h-2.5 w-2.5 rounded-full bg-yellow-400" />
        {t('analytics.pvProduction')}
      </span>
      <span className="flex items-center gap-1">
        <span className="inline-block h-2.5 w-2.5 rounded-full bg-blue-400" />
        {t('analytics.consumptionLabel')}
      </span>
      <span className="flex items-center gap-1">
        <span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-400" />
        {t('analytics.surplus')}
      </span>
    </div>
  </div>
);
