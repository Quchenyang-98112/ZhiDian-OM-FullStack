import { BarChart3 } from 'lucide-react';
import { motion } from 'motion/react';
import { useTranslation } from 'react-i18next';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { sectionAnim } from '../constants';
import { PRICE_BINS } from '../data/histogram';
import { getPriceColor } from '../utils';

export function PriceDistributionSection() {
  const { t } = useTranslation();
  return (
    <motion.section
      className="glass-panel-strong hover-lift cv-auto p-6"
      {...sectionAnim}
      transition={{ ...sectionAnim.transition, delay: 0.35 }}
    >
      <h2 className="fluid-text-lg mb-1 font-semibold text-(--color-text)">
        <BarChart3 className="mr-2 inline h-5 w-5 text-purple-400" aria-hidden="true" />
        {t('tariffs.distributionTitle')}
      </h2>
      <p className="mb-4 text-(--color-muted) text-sm">{t('tariffs.distributionDesc')}</p>

      <div className="h-56" role="img" aria-label={t('tariffs.distributionAria')}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={PRICE_BINS}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" opacity={0.3} />
            <XAxis
              dataKey="range"
              stroke="var(--color-muted)"
              tick={{ fill: 'var(--color-muted)', fontSize: 9 }}
              label={{
                value: t('units.ctPerKwh'),
                position: 'insideBottom',
                fill: 'var(--color-muted)',
                fontSize: 10,
                offset: -2,
              }}
            />
            <YAxis
              stroke="var(--color-muted)"
              tick={{ fill: 'var(--color-muted)', fontSize: 10 }}
              label={{
                value: '#',
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
              formatter={(value: unknown) => [`${value} ${t('tariffs.hours')}`]}
              labelFormatter={(label: unknown) => `${label} ${t('units.ctPerKwh')}`}
            />
            <Bar dataKey="count" radius={[6, 6, 0, 0]}>
              {PRICE_BINS.map((entry) => (
                <Cell
                  key={entry.range}
                  fill={getPriceColor(parseFloat(entry.range) / 100)}
                  fillOpacity={0.8}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </motion.section>
  );
}
