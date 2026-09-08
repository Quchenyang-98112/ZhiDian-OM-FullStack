import { CloudSun, Leaf, TrendingUp } from 'lucide-react';
import { motion } from 'motion/react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useWeatherForecast } from '../lib/queries';
import { useAppStoreShallow } from '../store';

interface ForecastDataPoint {
  time: string;
  pvForecast: number;
  price: number;
  co2Intensity: number;
  consumption: number;
}

export function PredictiveForecast() {
  const { t, i18n } = useTranslation();
  const settings = useAppStoreShallow((s) => s.settings);
  const [timeRange, setTimeRange] = useState<'24h' | '7d'>('24h');
  const dateLocale = i18n.language === 'de' ? 'de-DE' : 'en-US';

  // Default location: Hamburg, Germany
  const lat = settings.location?.lat || 53.5511;
  const lon = settings.location?.lon || 9.9937;

  // Weather data via TanStack Query (cached 1 h, auto-retry)
  const { data: weatherData } = useWeatherForecast(lat, lon);

  // React Compiler auto-memoizes this derivation — no useMemo wrapper needed.
  const { forecastData, totalSavings, co2Saved } = (() => {
    const hourly = weatherData?.hourly;
    if (!hourly?.time?.length)
      return { forecastData: [] as ForecastDataPoint[], totalSavings: 0, co2Saved: 0 };

    const hours = timeRange === '24h' ? 24 : 168;
    const basePrice = settings.gridPriceAvg || 0.25;

    const data: ForecastDataPoint[] = hourly.time.slice(0, hours).map((time, i) => {
      const ts = new Date(time);
      const hour = ts.getHours();
      const isPeak = hour >= 17 && hour <= 21;
      const price = isPeak ? basePrice * 1.5 : basePrice * 0.8;
      const consumption = 1.5 + Math.sin((hour / 24) * Math.PI * 2) * 1.2;
      const pvPotential = (hourly.shortwave_radiation?.[i] ?? 0) / 10;

      return {
        time:
          timeRange === '24h'
            ? ts.toLocaleTimeString(dateLocale, { hour: '2-digit', minute: '2-digit' })
            : ts.toLocaleDateString(dateLocale, { weekday: 'short', day: 'numeric' }),
        pvForecast: pvPotential,
        price,
        co2Intensity: 300 + (100 - pvPotential * 5),
        consumption,
      };
    });

    const savings = data.reduce((sum, d) => {
      const pvSurplus = Math.max(0, d.pvForecast - d.consumption);
      return sum + pvSurplus * d.price;
    }, 0);

    const co2 = data.reduce((sum, d) => sum + d.pvForecast * 0.5, 0);

    return { forecastData: data, totalSavings: savings, co2Saved: co2 };
  })();

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2 }}
      className="glass-panel p-6"
    >
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="fluid-text-xl font-semibold text-(--color-text)">
            <CloudSun className="mr-2 inline h-6 w-6 text-(--color-primary)" aria-hidden="true" />
            {t('forecast.title')}
          </h2>
          <p className="mt-1 text-(--color-muted) text-sm">{t('forecast.subtitle')}</p>
        </div>

        {/* Time Range Toggle */}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setTimeRange('24h')}
            className={`focus-ring rounded-lg px-4 py-2 font-medium text-sm transition-colors ${
              timeRange === '24h'
                ? 'bg-(--color-text) font-bold text-(--color-background)'
                : 'bg-(--color-surface) text-(--color-muted) hover:bg-white/10'
            }`}
            aria-pressed={timeRange === '24h'}
            aria-label={t('forecast.hours24')}
          >
            {t('forecast.hours24')}
          </button>
          <button
            type="button"
            onClick={() => setTimeRange('7d')}
            className={`focus-ring rounded-lg px-4 py-2 font-medium text-sm transition-colors ${
              timeRange === '7d'
                ? 'bg-(--color-text) font-bold text-(--color-background)'
                : 'bg-(--color-surface) text-(--color-muted) hover:bg-white/10'
            }`}
            aria-pressed={timeRange === '7d'}
            aria-label={t('forecast.days7')}
          >
            {t('forecast.days7')}
          </button>
        </div>
      </div>

      {/* Metrics */}
      <div className="@container mb-6 grid @sm:grid-cols-3 grid-cols-1 gap-4">
        <div className="rounded-2xl bg-emerald-500/10 p-4">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-emerald-400" aria-hidden="true" />
            <span className="text-emerald-400 text-sm">{t('forecast.potentialSavings')}</span>
          </div>
          <p className="mt-2 font-semibold text-2xl text-emerald-300">€{totalSavings.toFixed(2)}</p>
        </div>

        <div className="rounded-2xl bg-green-500/10 p-4">
          <div className="flex items-center gap-2">
            <Leaf className="h-5 w-5 text-green-400" aria-hidden="true" />
            <span className="text-green-400 text-sm">{t('forecast.co2Saved')}</span>
          </div>
          <p className="mt-2 font-semibold text-2xl text-green-300">{co2Saved.toFixed(1)} kg</p>
        </div>

        <div className="rounded-2xl bg-blue-500/10 p-4">
          <div className="flex items-center gap-2">
            <CloudSun className="h-5 w-5 text-blue-400" aria-hidden="true" />
            <span className="text-blue-400 text-sm">{t('forecast.avgPvGeneration')}</span>
          </div>
          <p className="mt-2 font-semibold text-2xl text-blue-300">
            {(forecastData.length > 0
              ? forecastData.reduce((sum, d) => sum + d.pvForecast, 0) / forecastData.length
              : 0
            ).toFixed(1)}{' '}
            kW
          </p>
        </div>
      </div>

      {/* Chart */}
      <div
        className="h-80"
        role="img"
        aria-label={t('chart.forecastAriaLabel', 'Energy production and price forecast chart')}
      >
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={forecastData}>
            <defs>
              <linearGradient id="colorPv" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--chart-7)" stopOpacity={0.8} />
                <stop offset="95%" stopColor="var(--chart-7)" stopOpacity={0.1} />
              </linearGradient>
              <linearGradient id="colorPrice" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--chart-3)" stopOpacity={0.8} />
                <stop offset="95%" stopColor="var(--chart-3)" stopOpacity={0.1} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" opacity={0.3} />
            <XAxis
              dataKey="time"
              stroke="var(--color-muted)"
              tick={{ fill: 'var(--color-muted)', fontSize: 12 }}
              tickLine={{ stroke: 'var(--color-border)' }}
            />
            <YAxis
              yAxisId="left"
              stroke="var(--color-muted)"
              tick={{ fill: 'var(--color-muted)', fontSize: 12 }}
              tickLine={{ stroke: 'var(--color-border)' }}
              label={{
                value: 'kW',
                angle: -90,
                position: 'insideLeft',
                fill: 'var(--color-muted)',
              }}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              stroke="var(--color-muted)"
              tick={{ fill: 'var(--color-muted)', fontSize: 12 }}
              tickLine={{ stroke: 'var(--color-border)' }}
              label={{
                value: '€/kWh',
                angle: 90,
                position: 'insideRight',
                fill: 'var(--color-muted)',
              }}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'var(--color-surface-strong)',
                border: '1px solid var(--color-border)',
                borderRadius: '12px',
                color: 'var(--color-text)',
              }}
            />
            <Legend wrapperStyle={{ color: 'var(--color-muted)' }} iconType="line" />
            <Area
              yAxisId="left"
              type="monotone"
              dataKey="pvForecast"
              stroke="var(--chart-7)"
              fillOpacity={1}
              fill="url(#colorPv)"
              name={t('forecast.pvGeneration')}
            />
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="price"
              stroke="var(--chart-3)"
              strokeWidth={2}
              dot={false}
              name={t('forecast.tariffPrice')}
            />
            <Line
              yAxisId="left"
              type="monotone"
              dataKey="consumption"
              stroke="var(--chart-6)"
              strokeWidth={2}
              strokeDasharray="5 5"
              dot={false}
              name={t('forecast.consumption')}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Best Action Recommendation */}
      <div className="mt-6 rounded-2xl border border-(--color-primary)/30 bg-(--color-primary)/10 p-4">
        <p className="font-medium text-(--color-primary) text-sm">{t('forecast.recommendation')}</p>
        <p className="mt-1 text-(--color-muted) text-sm">{t('forecast.recommendationText')}</p>
      </div>
    </motion.div>
  );
}
