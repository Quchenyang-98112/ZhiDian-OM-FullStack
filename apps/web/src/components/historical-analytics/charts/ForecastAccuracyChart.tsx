import { useTranslation } from 'react-i18next';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { ForecastAccuracyRow } from '../types';

export function ForecastAccuracyChart({ data }: { data: ForecastAccuracyRow[] }) {
  const { t } = useTranslation();
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" opacity={0.3} />
        <XAxis
          dataKey="label"
          stroke="var(--color-muted)"
          tick={{ fontSize: 9 }}
          interval={0}
          angle={-35}
          textAnchor="end"
          height={60}
        />
        <YAxis stroke="var(--color-muted)" tick={{ fontSize: 10 }} domain={[0, 100]} />
        <Tooltip
          contentStyle={{
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: '8px',
            color: 'var(--color-text)',
            fontSize: '12px',
          }}
        />
        <Legend wrapperStyle={{ fontSize: '12px' }} />
        <Bar
          dataKey="r2"
          name={t('historicalAnalytics.r2Score')}
          fill="var(--chart-1)"
          radius={[4, 4, 0, 0]}
        />
        <Bar
          dataKey="mape"
          name={t('historicalAnalytics.mape')}
          fill="var(--chart-3)"
          radius={[4, 4, 0, 0]}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
