import { useTranslation } from 'react-i18next';
import {
  Area,
  Brush,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { TimeSeriesPoint } from '../types';

const TOOLTIP_STYLE = {
  background: 'var(--color-surface)',
  border: '1px solid var(--color-border)',
  borderRadius: '8px',
  color: 'var(--color-text)',
  fontSize: '12px',
} as const;

export function EnergyOverviewChart({ data }: { data: TimeSeriesPoint[] }) {
  const { t } = useTranslation();
  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={data} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
        <defs>
          <linearGradient id="pvGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--chart-7)" stopOpacity={0.4} />
            <stop offset="100%" stopColor="var(--chart-7)" stopOpacity={0.05} />
          </linearGradient>
          <linearGradient id="loadGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--chart-2)" stopOpacity={0.3} />
            <stop offset="100%" stopColor="var(--chart-2)" stopOpacity={0.05} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" opacity={0.3} />
        <XAxis
          dataKey="time"
          stroke="var(--color-muted)"
          tick={{ fontSize: 10 }}
          interval="preserveStartEnd"
        />
        <YAxis stroke="var(--color-muted)" tick={{ fontSize: 10 }} unit=" W" />
        <Tooltip contentStyle={TOOLTIP_STYLE} />
        <Legend wrapperStyle={{ fontSize: '12px' }} />
        <Area
          type="monotone"
          dataKey="pvPower"
          name={t('historicalAnalytics.pvPower')}
          stroke="var(--chart-7)"
          fill="url(#pvGrad)"
          strokeWidth={2}
        />
        <Area
          type="monotone"
          dataKey="houseLoad"
          name={t('historicalAnalytics.houseLoad')}
          stroke="var(--chart-2)"
          fill="url(#loadGrad)"
          strokeWidth={2}
        />
        <Line
          type="monotone"
          dataKey="gridPower"
          name={t('historicalAnalytics.gridPower')}
          stroke="var(--chart-5)"
          strokeWidth={1.5}
          dot={false}
        />
        <Line
          type="monotone"
          dataKey="batteryPower"
          name={t('historicalAnalytics.batteryPower')}
          stroke="var(--chart-4)"
          strokeWidth={1.5}
          dot={false}
        />
        {data.length > 50 && <Brush dataKey="time" height={20} stroke="var(--color-primary)" />}
      </ComposedChart>
    </ResponsiveContainer>
  );
}
