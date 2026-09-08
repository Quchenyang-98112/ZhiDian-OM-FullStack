import { Cell, Legend, Pie, PieChart as RechartsPie, ResponsiveContainer, Tooltip } from 'recharts';
import type { CostAllocationEntry } from './AnalyticsBalanceCostSection';

export interface CostDonutChartProps {
  costAllocation: CostAllocationEntry[];
}

/** Donut chart for daily cost allocation breakdown. */
export const CostDonutChart = ({ costAllocation }: CostDonutChartProps) => (
  <div className="h-[200px]">
    <ResponsiveContainer width="100%" height="100%">
      {/* skipcq: JS-0415 - Recharts pie/cell mapping exceeds JSX depth 4 by design */}
      <RechartsPie>
        <Pie
          data={costAllocation}
          cx="50%"
          cy="50%"
          innerRadius={50}
          outerRadius={75}
          paddingAngle={3}
          dataKey="value"
          strokeWidth={0}
        >
          {costAllocation.map((entry) => (
            <Cell key={entry.name} fill={entry.color} opacity={0.85} />
          ))}
        </Pie>
        <Tooltip
          contentStyle={{
            background: 'var(--color-surface-strong)',
            border: '1px solid var(--color-border)',
            borderRadius: '12px',
            fontSize: '11px',
            color: 'var(--color-text)',
          }}
          formatter={(value) => [`€${(Number(value) / 100).toFixed(2)}`]}
        />
        <Legend
          verticalAlign="bottom"
          iconType="circle"
          iconSize={8}
          wrapperStyle={{ fontSize: '10px', color: 'var(--color-muted)' }}
        />
      </RechartsPie>
    </ResponsiveContainer>
  </div>
);
