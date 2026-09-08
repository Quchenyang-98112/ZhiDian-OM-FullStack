import { AlertTriangle, CheckCircle2, CircleDot, Signal } from 'lucide-react';
import { motion } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { sectionAnim } from '../constants';

export function ProviderInfoSection({
  providerLabel,
  chargeThreshold,
  priceAlerts,
  priceAlertThreshold,
}: {
  providerLabel: string;
  chargeThreshold: number;
  priceAlerts: boolean | undefined;
  priceAlertThreshold: number;
}) {
  const { t } = useTranslation();
  return (
    <motion.section
      className="glass-panel-strong hover-lift cv-auto-sm p-6"
      {...sectionAnim}
      transition={{ ...sectionAnim.transition, delay: 0.5 }}
    >
      <h2 className="fluid-text-lg mb-4 font-semibold text-(--color-text)">
        <Signal className="mr-2 inline h-5 w-5 text-(--color-primary)" aria-hidden="true" />
        {t('tariffs.providerTitle')}
      </h2>

      <div className="space-y-4">
        {/* Active provider */}
        <div className="rounded-2xl border border-(--color-primary)/20 bg-(--color-primary)/5 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-(--color-muted) text-sm">{t('tariffs.activeProvider')}</p>
              <p className="font-bold text-(--color-text) text-xl">{providerLabel}</p>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/20">
              <CircleDot className="h-5 w-5 text-emerald-400" aria-hidden="true" />
            </div>
          </div>
          <div className="mt-2 flex items-center gap-2 text-emerald-400 text-xs">
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
            {t('tariffs.apiConnected')}
          </div>
        </div>

        {/* Provider stats */}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-(--color-surface) p-3">
            <p className="text-(--color-muted) text-[10px]">{t('tariffs.updateFreq')}</p>
            <p className="font-semibold text-(--color-text)">{t('tariffs.hourly')}</p>
          </div>
          <div className="rounded-xl bg-(--color-surface) p-3">
            <p className="text-(--color-muted) text-[10px]">{t('tariffs.dataPoints')}</p>
            <p className="font-semibold text-(--color-text)">48h</p>
          </div>
          <div className="rounded-xl bg-(--color-surface) p-3">
            <p className="text-(--color-muted) text-[10px]">{t('tariffs.priceModel')}</p>
            <p className="font-semibold text-(--color-text)">{t('tariffs.spotMarket')}</p>
          </div>
          <div className="rounded-xl bg-(--color-surface) p-3">
            <p className="text-(--color-muted) text-[10px]">{t('tariffs.chargeThreshold')}</p>
            <p className="font-semibold text-emerald-400">
              {(chargeThreshold * 100).toFixed(1)} {t('units.ct')}
            </p>
          </div>
        </div>

        {/* Alert config */}
        <div
          className={`flex items-center gap-3 rounded-xl p-3 ${
            priceAlerts ? 'bg-emerald-500/10 text-emerald-400' : 'bg-zinc-500/10 text-zinc-400'
          }`}
        >
          {priceAlerts ? (
            <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
          ) : (
            <AlertTriangle className="h-4 w-4" aria-hidden="true" />
          )}
          <span className="text-sm">
            {priceAlerts ? t('tariffs.alertsActive') : t('tariffs.alertsInactive')}
          </span>
          {priceAlerts && (
            <span className="ml-auto font-medium text-xs">
              &lt; {(priceAlertThreshold * 100).toFixed(0)} {t('units.ct')}
            </span>
          )}
        </div>
      </div>
    </motion.section>
  );
}
