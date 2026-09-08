import type { TFunction } from 'i18next';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { generateMonthlyComparison } from '../../lib/analytics-chart-data';

type MonthlyDataPoint = ReturnType<typeof generateMonthlyComparison>[number];

export interface MonthlyComparisonBarChartProps {
  t: TFunction;
  monthlyData: MonthlyDataPoint[];
}

/** Monthly production, consumption, and savings bar chart. */
export const MonthlyComparisonBarChart = ({ t, monthlyData }: MonthlyComparisonBarChartProps) => (
  <div className="h-[240px]" role="img" aria-label={t('analytics.monthlyChartAria')}>
    <ResponsiveContainer width="100%" height="100%">
      {/* skipcq: JS-0415 - Recharts bar chart exceeds JSX depth 4 by design */}
      <BarChart data={monthlyData} barGap={2}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" opacity={0.3} />
        <XAxis
          dataKey="month"
          stroke="var(--color-muted)"
          tick={{ fill: 'var(--color-muted)', fontSize: 10 }}
        />
        <YAxis
          stroke="var(--color-muted)"
          tick={{ fill: 'var(--color-muted)', fontSize: 10 }}
          label={{
            value: 'kWh',
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
        />
        <Bar
          dataKey="production"
          fill="var(--chart-7)"
          radius={[4, 4, 0, 0]}
          name={t('analytics.productionKwh')}
        />
        <Bar
          dataKey="consumption"
          fill="var(--chart-2)"
          radius={[4, 4, 0, 0]}
          name={t('analytics.consumptionKwh')}
        />
        <Bar
          dataKey="savings"
          fill="var(--chart-1)"
          radius={[4, 4, 0, 0]}
          name={t('analytics.savingsEur')}
        />
      </BarChart>
    </ResponsiveContainer>
  </div>
);
