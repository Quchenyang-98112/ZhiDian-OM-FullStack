import { Wallet } from 'lucide-react';
import { motion } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { sectionAnim } from '../constants';
import { NOW } from '../data/constants';
import { MONTHLY_DAYS, MONTHLY_SAVINGS, MONTHLY_TOTAL } from '../data/monthly';

export function MonthlyCostSection({
  monthlyBudget,
  monthlyBudgetPct,
}: {
  monthlyBudget: number;
  monthlyBudgetPct: number;
}) {
  const { t } = useTranslation();
  return (
    <motion.section
      className="glass-panel-strong hover-lift cv-auto-lg p-6"
      {...sectionAnim}
      transition={{ ...sectionAnim.transition, delay: 0.4 }}
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="fluid-text-lg font-semibold text-(--color-text)">
            <Wallet className="mr-2 inline h-5 w-5 text-amber-400" aria-hidden="true" />
            {t('tariffs.monthlyCostTitle')}
          </h2>
          <p className="mt-0.5 text-(--color-muted) text-sm">{t('tariffs.monthlyCostDesc')}</p>
        </div>

        {/* Budget gauge */}
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="text-(--color-muted) text-xs">{t('tariffs.budgetUsed')}</p>
            <p className="font-bold text-(--color-text) text-lg tabular-nums">
              €{MONTHLY_TOTAL.toFixed(2)}
              <span className="font-normal text-(--color-muted) text-sm"> / €{monthlyBudget}</span>
            </p>
          </div>
          <div className="relative h-12 w-12">
            <svg viewBox="0 0 36 36" className="h-12 w-12 -rotate-90">
              <title>{t('tariffs.budgetProgress')}</title>
              <circle
                cx="18"
                cy="18"
                r="15.5"
                fill="none"
                stroke="currentColor"
                className="text-(--color-surface)"
                strokeWidth="3"
              />
              <circle
                cx="18"
                cy="18"
                r="15.5"
                fill="none"
                stroke={
                  monthlyBudgetPct > 90
                    ? 'var(--price-high)'
                    : monthlyBudgetPct > 70
                      ? 'var(--price-mid)'
                      : 'var(--price-low)'
                }
                strokeWidth="3"
                pathLength={100}
                strokeDasharray={`${monthlyBudgetPct} ${100 - monthlyBudgetPct}`}
                strokeLinecap="round"
              />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center font-bold text-(--color-text) text-[9px]">
              {Math.round(monthlyBudgetPct)}%
            </span>
          </div>
        </div>
      </div>

      <div className="h-52" role="img" aria-label={t('tariffs.monthlyCostAria')}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={MONTHLY_DAYS}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" opacity={0.3} />
            <XAxis
              dataKey="day"
              stroke="var(--color-muted)"
              tick={{ fill: 'var(--color-muted)', fontSize: 10 }}
            />
            <YAxis
              stroke="var(--color-muted)"
              tick={{ fill: 'var(--color-muted)', fontSize: 10 }}
              tickFormatter={(v: number) => `€${v.toFixed(0)}`}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'var(--color-surface-strong)',
                border: '1px solid var(--color-border)',
                borderRadius: '12px',
                color: 'var(--color-text)',
              }}
              formatter={(value: unknown, name: unknown) => [
                `€${Number(value).toFixed(2)}`,
                name === 'actual'
                  ? t('tariffs.costActual')
                  : name === 'optimized'
                    ? t('tariffs.costOptimized')
                    : t('tariffs.costSavings'),
              ]}
            />
            <Bar
              dataKey="actual"
              fill="var(--chart-3)"
              radius={[4, 4, 0, 0]}
              opacity={0.6}
              name="actual"
            />
            <Bar dataKey="optimized" fill="var(--chart-1)" radius={[4, 4, 0, 0]} name="optimized" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Summary cards */}
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl bg-(--color-surface) p-3">
          <p className="text-(--color-muted) text-[10px]">{t('tariffs.costActual')}</p>
          <p className="font-bold text-lg text-orange-400">€{MONTHLY_TOTAL.toFixed(2)}</p>
        </div>
        <div className="rounded-xl bg-(--color-surface) p-3">
          <p className="text-(--color-muted) text-[10px]">{t('tariffs.costOptimized')}</p>
          <p className="font-bold text-emerald-400 text-lg">
            €{(MONTHLY_TOTAL - MONTHLY_SAVINGS).toFixed(2)}
          </p>
        </div>
        <div className="rounded-xl bg-(--color-surface) p-3">
          <p className="text-(--color-muted) text-[10px]">{t('tariffs.costSavings')}</p>
          <p className="font-bold text-green-400 text-lg">€{MONTHLY_SAVINGS.toFixed(2)}</p>
        </div>
        <div className="rounded-xl bg-(--color-surface) p-3">
          <p className="text-(--color-muted) text-[10px]">{t('tariffs.costProjected')}</p>
          <p className="font-bold text-(--color-text) text-lg">
            €{((MONTHLY_TOTAL / Math.max(1, NOW.getDate())) * 30).toFixed(0)}
          </p>
        </div>
      </div>
    </motion.section>
  );
}
