import { CheckCircle2 } from 'lucide-react';
import { motion } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { Disclosure } from '../../ui/Disclosure';
import { sectionAnim } from '../constants';
import { CHARGE_WINDOWS } from '../data/chargeWindows';
import type { WindowCategory } from '../types';

function categoryLabelKey(category: WindowCategory): string {
  if (category === 'optimal') return 'tariffs.catOptimal';
  if (category === 'good') return 'tariffs.catGood';
  return 'tariffs.catAcceptable';
}

export function ChargeWindowsSection({
  expandedWindow,
  onExpandedWindow,
}: {
  expandedWindow: number | null;
  onExpandedWindow: (index: number | null) => void;
}) {
  const { t } = useTranslation();
  return (
    <motion.section
      className="glass-panel-strong hover-lift p-6"
      {...sectionAnim}
      transition={{ ...sectionAnim.transition, delay: 0.25 }}
    >
      <h2 className="fluid-text-lg mb-1 font-semibold text-(--color-text)">
        <CheckCircle2 className="mr-2 inline h-5 w-5 text-emerald-400" aria-hidden="true" />
        {t('tariffs.windowsTitle')}
      </h2>
      <p className="mb-4 text-(--color-muted) text-sm">{t('tariffs.windowsDesc')}</p>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {CHARGE_WINDOWS.map((win, i) => (
          <div
            key={`${win.start}-${win.end}`}
            className={`group relative overflow-hidden rounded-2xl border p-4 transition-all ${
              win.category === 'optimal'
                ? 'border-emerald-500/30 bg-emerald-500/5 hover:bg-emerald-500/10'
                : win.category === 'good'
                  ? 'border-blue-500/30 bg-blue-500/5 hover:bg-blue-500/10'
                  : 'border-zinc-500/20 bg-zinc-500/5 hover:bg-zinc-500/10'
            }`}
          >
            <span
              className={`absolute top-3 right-3 rounded-full px-2 py-0.5 font-bold text-[10px] uppercase ${
                win.category === 'optimal'
                  ? 'bg-emerald-500/20 text-emerald-400'
                  : win.category === 'good'
                    ? 'bg-blue-500/20 text-blue-400'
                    : 'bg-zinc-500/20 text-zinc-400'
              }`}
            >
              {t(categoryLabelKey(win.category))}
            </span>

            <Disclosure
              variant="nested"
              className="border-0 bg-transparent shadow-none"
              open={expandedWindow === i}
              onOpenChange={(open) => onExpandedWindow(open ? i : null)}
              title={`${win.start} – ${win.end}`}
              subtitle={`Ø ${(win.avgPrice * 100).toFixed(1)} ${t('units.ctPerKwh')} · ${win.duration}h`}
            >
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <p className="text-(--color-muted) text-[10px]">
                    {t('tariffs.potentialSavings')}
                  </p>
                  <p className="font-semibold text-emerald-400">€{win.savings.toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-(--color-muted) text-[10px]">{t('tariffs.renewableShare')}</p>
                  <p className="font-semibold text-green-400">{win.renewable}%</p>
                </div>
              </div>
            </Disclosure>
          </div>
        ))}
      </div>
    </motion.section>
  );
}
