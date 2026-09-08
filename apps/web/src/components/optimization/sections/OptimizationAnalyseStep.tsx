import { Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { ForecastPoint } from '../hooks/useOptimizationWizard';

interface AnalyseStepProps {
  loading: boolean;
  chartData: ForecastPoint[];
}

const tooltipStyle = {
  background: 'var(--color-surface-strong)',
  border: '1px solid var(--color-border)',
  borderRadius: '0.75rem',
  fontSize: '0.75rem',
} as const;

/** Wizard step 1 — tariff-price and renewable-share forecast charts. */
export function OptimizationAnalyseStep({ loading, chartData }: AnalyseStepProps) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col gap-5">
      <h2 className="fluid-text-xl font-semibold">{t('optimizationWizard.analyseTitle')}</h2>

      {loading ? (
        <div className="flex flex-col items-center justify-center gap-3 py-12" role="status">
          <Loader2 size={28} className="animate-spin text-(--color-primary)" aria-hidden="true" />
          <p className="text-(--color-muted) text-sm">{t('ai.analyzing')}</p>
        </div>
      ) : (
        <>
          {chartData.length > 0 && (
            <div className="glass-panel rounded-2xl p-4">
              <h3 className="mb-3 font-medium text-(--color-muted) text-sm">
                {t('forecast.tariffForecast')}
              </h3>
              <div role="img" aria-label={t('chart.tariffForecastAriaLabel')}>
                <ResponsiveContainer width="100%" height={180}>
                  <AreaChart data={chartData}>
                    <defs>
                      <linearGradient id="priceGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--color-primary)" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="var(--color-primary)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                    <XAxis dataKey="time" tick={{ fontSize: 10, fill: 'var(--color-muted)' }} />
                    <YAxis tick={{ fontSize: 10, fill: 'var(--color-muted)' }} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Area
                      type="monotone"
                      dataKey="price"
                      stroke="var(--color-primary)"
                      fill="url(#priceGrad)"
                      name={t('forecast.tariffPrice')}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {chartData.length > 0 && (
            <div className="glass-panel rounded-2xl p-4">
              <h3 className="mb-3 font-medium text-(--color-muted) text-sm">
                {t('optimizationWizard.renewableShare')}
              </h3>
              <div role="img" aria-label={t('chart.renewableShareAriaLabel')}>
                <ResponsiveContainer width="100%" height={120}>
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                    <XAxis dataKey="time" tick={{ fontSize: 10, fill: 'var(--color-muted)' }} />
                    <YAxis tick={{ fontSize: 10, fill: 'var(--color-muted)' }} domain={[0, 100]} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Bar
                      dataKey="renewable"
                      fill="var(--color-accent)"
                      radius={[4, 4, 0, 0]}
                      name="%"
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
