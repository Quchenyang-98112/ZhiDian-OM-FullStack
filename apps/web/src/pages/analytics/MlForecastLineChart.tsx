import {
  Area,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { ForecastResult } from '../../lib/ml-forecast';

export interface MlForecastLineChartProps {
  forecastResult: ForecastResult;
}

/** Confidence-band line chart for ML forecast results. */
export const MlForecastLineChart = ({ forecastResult }: MlForecastLineChartProps) => (
  <div className="h-48">
    <ResponsiveContainer width="100%" height="100%">
      {/* skipcq: JS-0415 - Recharts line/area chart exceeds JSX depth 4 by design */}
      <LineChart
        data={forecastResult.points.map((p) => ({
          time: `${new Date(p.timestamp).getHours()}:00`,
          value: Math.round(p.value),
          lower: Math.round(p.lower),
          upper: Math.round(p.upper),
        }))}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
        <XAxis dataKey="time" tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 10 }} />
        <YAxis tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 10 }} />
        <Tooltip
          contentStyle={{
            background: 'rgba(0,0,0,0.8)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 8,
            fontSize: 11,
          }}
        />
        <Area dataKey="upper" stroke="none" fill="rgba(168,85,247,0.1)" />
        <Area dataKey="lower" stroke="none" fill="rgba(168,85,247,0.0)" />
        <Line type="monotone" dataKey="value" stroke="var(--chart-4)" strokeWidth={2} dot={false} />
        <Line
          type="monotone"
          dataKey="upper"
          stroke="rgba(168,85,247,0.3)"
          strokeWidth={1}
          strokeDasharray="3 3"
          dot={false}
        />
        <Line
          type="monotone"
          dataKey="lower"
          stroke="rgba(168,85,247,0.3)"
          strokeWidth={1}
          strokeDasharray="3 3"
          dot={false}
        />
      </LineChart>
    </ResponsiveContainer>
  </div>
);
