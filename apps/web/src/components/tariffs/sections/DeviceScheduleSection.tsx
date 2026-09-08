import { Gauge } from 'lucide-react';
import { motion } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { DEVICE_ICONS, sectionAnim } from '../constants';
import { DEVICE_SCHEDULES } from '../data/schedules';

export function DeviceScheduleSection() {
  const { t } = useTranslation();
  return (
    <motion.section
      className="glass-panel-strong hover-lift cv-auto p-6"
      {...sectionAnim}
      transition={{ ...sectionAnim.transition, delay: 0.3 }}
    >
      <h2 className="fluid-text-lg mb-1 font-semibold text-(--color-text)">
        <Gauge className="mr-2 inline h-5 w-5 text-(--color-primary)" aria-hidden="true" />
        {t('tariffs.scheduleTitle')}
      </h2>
      <p className="mb-4 text-(--color-muted) text-sm">{t('tariffs.scheduleDesc')}</p>

      <div className="space-y-3">
        {DEVICE_SCHEDULES.map((sched) => (
          <div
            key={`${sched.device}-${sched.time}`}
            className="flex items-center gap-4 rounded-2xl border border-(--color-border) bg-(--color-surface)/50 p-3"
          >
            <div
              className={`flex h-10 w-10 items-center justify-center rounded-xl ${
                sched.priority === 'high'
                  ? 'bg-emerald-500/15 text-emerald-400'
                  : sched.priority === 'medium'
                    ? 'bg-blue-500/15 text-blue-400'
                    : 'bg-zinc-500/15 text-zinc-400'
              }`}
            >
              {DEVICE_ICONS[sched.icon]}
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-medium text-(--color-text) text-sm">
                {t(`tariffs.device_${sched.device}`)}
              </p>
              <p className="text-(--color-muted) text-xs">
                {sched.time} · {(sched.price * 100).toFixed(1)} {t('units.ctPerKwh')}
              </p>
            </div>
            <div className="text-right">
              <p className="font-semibold text-emerald-400 text-sm">-€{sched.savings.toFixed(2)}</p>
              <p
                className={`font-bold text-[10px] uppercase ${
                  sched.priority === 'high'
                    ? 'text-emerald-400'
                    : sched.priority === 'medium'
                      ? 'text-blue-400'
                      : 'text-zinc-400'
                }`}
              >
                {t(`tariffs.priority_${sched.priority}`)}
              </p>
            </div>
          </div>
        ))}

        <div className="rounded-2xl border border-(--color-primary)/20 bg-(--color-primary)/5 p-3 text-center">
          <p className="font-medium text-(--color-primary) text-sm">
            {t('tariffs.totalDailySavings')}: €
            {DEVICE_SCHEDULES.reduce((s, d) => s + d.savings, 0).toFixed(2)}
          </p>
        </div>
      </div>
    </motion.section>
  );
}
