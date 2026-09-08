import type { TFunction } from 'i18next';
import { PieChart as PieIcon } from 'lucide-react';
import { motion } from 'motion/react';
import type { generateEnergyBalance } from '../../lib/analytics-chart-data';
import { BalanceChartHeader } from './BalanceChartHeader';
import { BalanceSummaryStats } from './BalanceSummaryStats';
import { CostDonutChart } from './CostDonutChart';
import { CostDonutSummary } from './CostDonutSummary';
import { EnergyBalanceAreaChart } from './EnergyBalanceAreaChart';

type BalanceDataPoint = ReturnType<typeof generateEnergyBalance>[number];

export interface CostAllocationEntry {
  name: string;
  value: number;
  color: string;
}

export interface AnalyticsBalanceCostSectionProps {
  t: TFunction;
  balanceData: BalanceDataPoint[];
  costAllocation: CostAllocationEntry[];
  netCost: number;
  gridCost: number;
  feedInRevenue: number;
}

/** Energy balance area chart and cost allocation donut for the Analytics page. */
export const AnalyticsBalanceCostSection = ({
  t,
  balanceData,
  costAllocation,
  netCost,
  gridCost,
  feedInRevenue,
}: AnalyticsBalanceCostSectionProps) => {
  const netBalanceKwh = balanceData.reduce((a, d) => a + d.pv - d.consumption, 0) / 1000;

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <motion.section
        className="glass-panel-strong hover-lift p-6 lg:col-span-2"
        aria-labelledby="balance-chart-title"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.35 }}
      >
        <BalanceChartHeader t={t} />
        <EnergyBalanceAreaChart t={t} balanceData={balanceData} />
        <BalanceSummaryStats t={t} balanceData={balanceData} netBalanceKwh={netBalanceKwh} />
      </motion.section>

      <motion.section
        className="glass-panel-strong hover-lift p-6"
        aria-labelledby="cost-donut-title"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.38 }}
      >
        <h2
          id="cost-donut-title"
          className="fluid-text-lg mb-4 flex items-center gap-2 font-medium"
        >
          <PieIcon size={20} className="text-(--color-secondary)" aria-hidden="true" />
          {t('analytics.costAllocation')}
        </h2>
        <CostDonutChart costAllocation={costAllocation} />
        <CostDonutSummary
          t={t}
          netCost={netCost}
          gridCost={gridCost}
          feedInRevenue={feedInRevenue}
        />
      </motion.section>
    </div>
  );
};
