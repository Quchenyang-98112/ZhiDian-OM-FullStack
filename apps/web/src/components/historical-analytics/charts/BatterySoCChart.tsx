import { useTranslation } from 'react-i18next';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { TimeSeriesPoint } from '../types';

export function BatterySoCChart({ data }: { data: TimeSeriesPoint[] }) {
  const { t } = useTranslation();
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
        <defs>
          <linearGradient id="socGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--chart-4)" stopOpacity={0.4} />
            <stop offset="100%" stopColor="var(--chart-4)" stopOpacity={0.05} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" opacity={0.3} />
        <XAxis
          dataKey="time"
          stroke="var(--color-muted)"
          tick={{ fontSize: 10 }}
          interval="preserveStartEnd"
        />
        <YAxis stroke="var(--color-muted)" tick={{ fontSize: 10 }} domain={[0, 100]} unit="%" />
        <Tooltip
          contentStyle={{
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: '8px',
            color: 'var(--color-text)',
            fontSize: '12px',
          }}
        />
        <Area
          type="monotone"
          dataKey="batterySoC"
          name={t('historicalAnalytics.batterySoC')}
          stroke="var(--chart-4)"
          fill="url(#socGrad)"
          strokeWidth={2}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
