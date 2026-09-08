import { Receipt, Sun } from 'lucide-react';
import { motion } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { sectionAnim } from '../constants';

export function FeedInSection({
  feedInTariff,
  pvYieldToday,
}: {
  feedInTariff: number;
  pvYieldToday: number;
}) {
  const { t } = useTranslation();
  return (
    <motion.section
      className="glass-panel-strong hover-lift cv-auto-sm p-6"
      {...sectionAnim}
      transition={{ ...sectionAnim.transition, delay: 0.45 }}
    >
      <h2 className="fluid-text-lg mb-4 font-semibold text-(--color-text)">
        <Receipt className="mr-2 inline h-5 w-5 text-amber-400" aria-hidden="true" />
        {t('tariffs.feedInTitle')}
      </h2>

      <div className="space-y-4">
        <div className="flex items-center justify-between rounded-2xl bg-amber-500/10 p-4">
          <div>
            <p className="text-(--color-muted) text-sm">{t('tariffs.feedInRate')}</p>
            <p className="font-bold text-2xl text-amber-400">
              {(feedInTariff * 100).toFixed(1)}{' '}
              <span className="font-normal text-sm">{t('units.ctPerKwh')}</span>
            </p>
          </div>
          <Sun className="h-10 w-10 text-amber-400/40" aria-hidden="true" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-(--color-surface) p-3">
            <p className="text-(--color-muted) text-[10px]">{t('tariffs.feedInToday')}</p>
            <p className="font-bold text-amber-400 text-lg">
              €{(pvYieldToday * feedInTariff).toFixed(2)}
            </p>
            <p className="text-(--color-muted) text-[10px]">{pvYieldToday.toFixed(1)} kWh</p>
          </div>
          <div className="rounded-xl bg-(--color-surface) p-3">
            <p className="text-(--color-muted) text-[10px]">{t('tariffs.feedInMonthly')}</p>
            <p className="font-bold text-amber-400 text-lg">
              €{(pvYieldToday * feedInTariff * 30 * 0.4).toFixed(2)}
            </p>
            <p className="text-(--color-muted) text-[10px]">{t('tariffs.estimated')}</p>
          </div>
        </div>

        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-center">
          <p className="text-(--color-muted) text-xs">{t('tariffs.feedInAnnual')}</p>
          <p className="font-bold text-amber-400 text-xl">
            €{(pvYieldToday * feedInTariff * 365 * 0.4).toFixed(0)}
          </p>
        </div>
      </div>
    </motion.section>
  );
}
