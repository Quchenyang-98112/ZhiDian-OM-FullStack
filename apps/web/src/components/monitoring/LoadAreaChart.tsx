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
import type { generateSystemLoadHistory } from './utils';

function LoadChartGradientDefs() {
  return (
    <defs>
      <linearGradient id="gradLoad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="5%" stopColor="var(--chart-6)" stopOpacity={0.6} />
        <stop offset="95%" stopColor="var(--chart-6)" stopOpacity={0.02} />
      </linearGradient>
      <linearGradient id="gradCpu" x1="0" y1="0" x2="0" y2="1">
        <stop offset="5%" stopColor="var(--chart-4)" stopOpacity={0.5} />
        <stop offset="95%" stopColor="var(--chart-4)" stopOpacity={0.02} />
      </linearGradient>
      <linearGradient id="gradMem" x1="0" y1="0" x2="0" y2="1">
        <stop offset="5%" stopColor="var(--chart-2)" stopOpacity={0.4} />
        <stop offset="95%" stopColor="var(--chart-2)" stopOpacity={0.02} />
      </linearGradient>
    </defs>
  );
}

function LoadChartGridAxes() {
  return (
    <>
      <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" opacity={0.3} />
      <XAxis
        dataKey="hour"
        stroke="var(--color-muted)"
        tick={{ fill: 'var(--color-muted)', fontSize: 10 }}
        interval={2}
      />
      <YAxis stroke="var(--color-muted)" tick={{ fill: 'var(--color-muted)', fontSize: 10 }} />
      <Tooltip
        contentStyle={{
          background: 'var(--color-surface-strong)',
          border: '1px solid var(--color-border)',
          borderRadius: '12px',
          fontSize: '11px',
          color: 'var(--color-text)',
        }}
      />
    </>
  );
}

function LoadChartAreas() {
  const { t } = useTranslation();
  return (
    <>
      <Area
        type="monotone"
        dataKey="load"
        stroke="var(--chart-6)"
        fill="url(#gradLoad)"
        strokeWidth={2}
        name="Load (W)"
      />
      <Area
        type="monotone"
        dataKey="cpu"
        stroke="var(--chart-4)"
        fill="url(#gradCpu)"
        strokeWidth={1.5}
        name={t('monitoring.cpuPercent')}
      />
      <Area
        type="monotone"
        dataKey="memory"
        stroke="var(--chart-2)"
        fill="url(#gradMem)"
        strokeWidth={1.5}
        name={t('monitoring.ramPercent')}
      />
    </>
  );
}

export function LoadAreaChart({
  loadHistory,
}: {
  loadHistory: ReturnType<typeof generateSystemLoadHistory>;
}) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={loadHistory}>
        <LoadChartGradientDefs />
        <LoadChartGridAxes />
        <LoadChartAreas />
      </AreaChart>
    </ResponsiveContainer>
  );
}
