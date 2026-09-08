import type { TFunction } from 'i18next';
import type { generateEnergyBalance } from '../../lib/analytics-chart-data';

type BalanceDataPoint = ReturnType<typeof generateEnergyBalance>[number];

/** Three summary stat tiles below the energy balance chart. */
export const BalanceSummaryStats = ({
  t,
  balanceData,
  netBalanceKwh,
}: {
  t: TFunction;
  balanceData: BalanceDataPoint[];
  netBalanceKwh: number;
}) => (
  <div className="mt-4 grid grid-cols-3 gap-3">
    <div className="rounded-xl bg-white/5 p-2.5 text-center">
      <p className="text-(--color-muted) text-[10px]">{t('analytics.totalProduction')}</p>
      <p className="font-medium text-sm text-yellow-400">
        {(balanceData.reduce((a, d) => a + d.pv, 0) / 1000).toFixed(1)} kWh
      </p>
    </div>
    <div className="rounded-xl bg-white/5 p-2.5 text-center">
      <p className="text-(--color-muted) text-[10px]">{t('analytics.totalConsumption')}</p>
      <p className="font-medium text-blue-400 text-sm">
        {(balanceData.reduce((a, d) => a + d.consumption, 0) / 1000).toFixed(1)} kWh
      </p>
    </div>
    <div className="rounded-xl bg-white/5 p-2.5 text-center">
      <p className="text-(--color-muted) text-[10px]">{t('analytics.netBalance')}</p>
      <p
        className={`font-medium text-sm ${netBalanceKwh >= 0 ? 'text-emerald-400' : 'text-red-400'}`}
      >
        {netBalanceKwh >= 0 ? '+' : ''}
        {netBalanceKwh.toFixed(1)} kWh
      </p>
    </div>
  </div>
);
