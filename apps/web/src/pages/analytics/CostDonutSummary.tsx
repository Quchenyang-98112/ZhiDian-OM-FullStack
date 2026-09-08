import type { TFunction } from 'i18next';

/** Net cost summary below the cost allocation donut chart. */
export const CostDonutSummary = ({
  t,
  netCost,
  gridCost,
  feedInRevenue,
}: {
  t: TFunction;
  netCost: number;
  gridCost: number;
  feedInRevenue: number;
}) => (
  <div className="mt-3 rounded-xl bg-white/5 p-3">
    <div className="flex items-center justify-between text-xs">
      <span className="text-(--color-muted)">{t('analytics.netCostToday')}</span>
      <span className={`font-medium ${netCost <= 0 ? 'text-emerald-400' : 'text-orange-400'}`}>
        {netCost <= 0 ? '–' : ''}€{Math.abs(netCost).toFixed(2)}
      </span>
    </div>
    <div className="mt-1 flex flex-wrap items-center justify-between gap-1 text-(--color-muted) text-[10px]">
      <span className="truncate">
        {t('analytics.gridCostLabel')}: €{gridCost.toFixed(2)}
      </span>
      <span className="truncate">
        {t('analytics.feedInRevenue')}: €{feedInRevenue.toFixed(2)}
      </span>
    </div>
  </div>
);
