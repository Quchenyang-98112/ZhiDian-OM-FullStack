import { Clock } from 'lucide-react';
import { motion } from 'motion/react';
import { useTranslation } from 'react-i18next';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { sectionAnim } from '../constants';
import { PRICE_AVG, PRICE_TIMELINE } from '../data/constants';
import type { View48h } from '../types';
import { getPriceColor } from '../utils';

function LegendSwatch({ color }: { color: string }) {
  return (
    <span
      className="inline-block h-2.5 w-2.5 rounded-full"
      style={{ backgroundColor: color }}
      aria-hidden="true"
    />
  );
}

function LegendDash({ color }: { color: string }) {
  return (
    <span
      className="inline-block h-0.5 w-4 border-t-2 border-dashed"
      style={{ borderColor: color }}
      aria-hidden="true"
    />
  );
}

export function PriceTimelineSection({
  view48h,
  onView48h,
  chargeThreshold,
}: {
  view48h: View48h;
  onView48h: (v: View48h) => void;
  chargeThreshold: number;
}) {
  const { t } = useTranslation();
  return (
    <motion.section
      className="glass-panel-strong hover-lift p-6"
      {...sectionAnim}
      transition={{ ...sectionAnim.transition, delay: 0.15 }}
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="fluid-text-lg font-semibold text-(--color-text)">
            <Clock className="mr-2 inline h-5 w-5 text-(--color-primary)" aria-hidden="true" />
            {t('tariffs.timeline48h')}
          </h2>
          <p className="mt-0.5 text-(--color-muted) text-sm">{t('tariffs.timelineDesc')}</p>
        </div>
        <div className="flex gap-2">
          {(['price', 'renewable'] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => onView48h(v)}
              className={`focus-ring rounded-lg px-3 py-1.5 font-medium text-xs transition-colors ${
                view48h === v
                  ? 'bg-(--color-text) text-(--color-background)'
                  : 'bg-(--color-surface) text-(--color-muted) hover:bg-white/10'
              }`}
              aria-pressed={view48h === v}
            >
              {v === 'price' ? t('tariffs.viewPrice') : t('tariffs.viewRenewable')}
            </button>
          ))}
        </div>
      </div>

      <div className="h-72" role="img" aria-label={t('tariffs.timelineAria')}>
        <ResponsiveContainer width="100%" height="100%">
          {view48h === 'price' ? (
            <BarChart data={PRICE_TIMELINE} barCategoryGap="8%">
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" opacity={0.3} />
              <XAxis
                dataKey="time"
                stroke="var(--color-muted)"
                tick={{ fill: 'var(--color-muted)', fontSize: 10 }}
                interval={3}
              />
              <YAxis
                stroke="var(--color-muted)"
                tick={{ fill: 'var(--color-muted)', fontSize: 10 }}
                tickFormatter={(v: number) => `${(v * 100).toFixed(0)}`}
                label={{
                  value: t('units.ctPerKwh'),
                  angle: -90,
                  position: 'insideLeft',
                  fill: 'var(--color-muted)',
                  fontSize: 10,
                }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'var(--color-surface-strong)',
                  border: '1px solid var(--color-border)',
                  borderRadius: '12px',
                  color: 'var(--color-text)',
                }}
                formatter={(value: unknown) => [
                  `${(Number(value) * 100).toFixed(2)} ${t('units.ctPerKwh')}`,
                ]}
                labelFormatter={(label: unknown) => `${label}`}
              />
              <ReferenceLine
                y={PRICE_AVG}
                stroke="var(--price-mid)"
                strokeDasharray="6 4"
                label={{ value: 'Ø', fill: 'var(--price-mid)', fontSize: 11, position: 'right' }}
              />
              <ReferenceLine
                y={chargeThreshold}
                stroke="var(--price-low)"
                strokeDasharray="3 3"
                label={{ value: '⚡', fill: 'var(--price-low)', fontSize: 11, position: 'left' }}
              />
              <Bar dataKey="price" radius={[4, 4, 0, 0]}>
                {PRICE_TIMELINE.map((entry) => (
                  <Cell
                    key={entry.time}
                    fill={getPriceColor(entry.price)}
                    fillOpacity={entry.isToday ? 1 : 0.5}
                  />
                ))}
              </Bar>
            </BarChart>
          ) : (
            <AreaChart data={PRICE_TIMELINE}>
              <defs>
                <linearGradient id="renewGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--chart-1)" stopOpacity={0.6} />
                  <stop offset="95%" stopColor="var(--chart-1)" stopOpacity={0.05} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" opacity={0.3} />
              <XAxis
                dataKey="time"
                stroke="var(--color-muted)"
                tick={{ fill: 'var(--color-muted)', fontSize: 10 }}
                interval={3}
              />
              <YAxis
                stroke="var(--color-muted)"
                tick={{ fill: 'var(--color-muted)', fontSize: 10 }}
                label={{
                  value: t('units.percent'),
                  angle: -90,
                  position: 'insideLeft',
                  fill: 'var(--color-muted)',
                  fontSize: 10,
                }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'var(--color-surface-strong)',
                  border: '1px solid var(--color-border)',
                  borderRadius: '12px',
                  color: 'var(--color-text)',
                }}
                formatter={(value: unknown) => [
                  `${Number(value).toFixed(0)} ${t('units.percent')}`,
                ]}
              />
              <Area
                type="monotone"
                dataKey="renewable"
                stroke="var(--chart-1)"
                fill="url(#renewGrad)"
                strokeWidth={2}
                name={t('tariffs.renewableShare')}
              />
            </AreaChart>
          )}
        </ResponsiveContainer>
      </div>

      {/* Legend */}
      <div className="mt-3 flex flex-wrap items-center gap-4 text-(--color-muted) text-xs">
        <span className="flex items-center gap-1.5">
          <LegendSwatch color="var(--price-low)" /> {t('tariffs.legendCheap')}
        </span>
        <span className="flex items-center gap-1.5">
          <LegendSwatch color="var(--price-mid)" /> {t('tariffs.legendMid')}
        </span>
        <span className="flex items-center gap-1.5">
          <LegendSwatch color="var(--price-high)" /> {t('tariffs.legendExpensive')}
        </span>
        <span className="flex items-center gap-1.5">
          <LegendDash color="var(--price-mid)" /> {t('tariffs.legendAvg')}
        </span>
        <span className="flex items-center gap-1.5">
          <LegendDash color="var(--price-low)" /> {t('tariffs.legendThreshold')}
        </span>
      </div>
    </motion.section>
  );
}
