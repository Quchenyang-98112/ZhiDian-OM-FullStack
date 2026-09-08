import type { TFunction } from 'i18next';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { generateEnergyBalance } from '../../lib/analytics-chart-data';
import { EnergyBalanceChartGradients } from './EnergyBalanceChartGradients';

type BalanceDataPoint = ReturnType<typeof generateEnergyBalance>[number];

/** Props for the energy balance area chart section. */
export interface EnergyBalanceAreaChartProps {
  t: TFunction;
  balanceData: BalanceDataPoint[];
}

/** 24-hour PV vs consumption area chart for the Analytics balance section. */
export const EnergyBalanceAreaChart = ({ t, balanceData }: EnergyBalanceAreaChartProps) => (
  <div className="h-[260px]" role="img" aria-label={t('analytics.balanceChartAria')}>
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={balanceData}>
        <EnergyBalanceChartGradients />
        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" opacity={0.3} />
        <XAxis
          dataKey="hour"
          stroke="var(--color-muted)"
          tick={{ fill: 'var(--color-muted)', fontSize: 10 }}
          interval={2}
        />
        <YAxis
          stroke="var(--color-muted)"
          tick={{ fill: 'var(--color-muted)', fontSize: 10 }}
          label={{
            value: 'W',
            angle: -90,
            position: 'insideLeft',
            fill: 'var(--color-muted)',
            fontSize: 10,
          }}
        />
        <Tooltip
          contentStyle={{
            background: 'var(--color-surface-strong)',
            border: '1px solid var(--color-border)',
            borderRadius: '12px',
            fontSize: '11px',
            color: 'var(--color-text)',
          }}
          formatter={(value) => [`${value} W`]}
        />
        <Area
          type="monotone"
          dataKey="pv"
          stroke="var(--chart-7)"
          fill="url(#gradPv)"
          strokeWidth={2}
          name="PV"
        />
        <Area
          type="monotone"
          dataKey="consumption"
          stroke="var(--chart-2)"
          fill="url(#gradCons)"
          strokeWidth={2}
          name={t('analytics.consumptionLabel')}
        />
        <Area
          type="monotone"
          dataKey="surplus"
          stroke="var(--chart-1)"
          fill="url(#gradSurplus)"
          strokeWidth={1.5}
          strokeDasharray="4 2"
          name={t('analytics.surplus')}
        />
      </AreaChart>
    </ResponsiveContainer>
  </div>
);
