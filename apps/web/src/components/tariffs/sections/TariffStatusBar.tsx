import { Target, TrendingDown, TrendingUp, Zap } from 'lucide-react';
import { motion } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { sectionAnim } from '../constants';
import { PRICE_AVG, PRICE_MAX, PRICE_MIN, PRICE_SPREAD } from '../data/constants';

export function TariffStatusBar({
  currentPrice,
  isGoodPrice,
}: {
  currentPrice: number;
  isGoodPrice: boolean;
}) {
  const { t } = useTranslation();
  return (
    <motion.div {...sectionAnim} className="glass-panel rounded-2xl p-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div
            className={`flex h-12 w-12 items-center justify-center rounded-xl ${
              isGoodPrice
                ? 'bg-emerald-500/20 text-emerald-400'
                : 'bg-orange-500/20 text-orange-400'
            }`}
          >
            <Zap className="h-6 w-6" aria-hidden="true" />
          </div>
          <div>
            <p className="text-(--color-muted) text-sm">{t('tariffs.currentStatus')}</p>
            <p className={`font-semibold ${isGoodPrice ? 'text-emerald-400' : 'text-orange-400'}`}>
              {isGoodPrice ? t('tariffs.priceGood') : t('tariffs.priceHigh')}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-(--color-muted) text-sm sm:gap-x-6">
          <span className="flex items-center gap-1.5">
            <TrendingDown className="h-4 w-4 text-(--price-low)" aria-hidden="true" />
            {t('tariffs.todayLow')}:{' '}
            <strong className="text-(--price-low)">{PRICE_MIN.toFixed(3)}</strong>
          </span>
          <span className="flex items-center gap-1.5">
            <Target className="h-4 w-4 text-(--price-mid)" aria-hidden="true" />
            {t('tariffs.todayAvg')}:{' '}
            <strong className="text-(--price-mid)">{PRICE_AVG.toFixed(3)}</strong>
          </span>
          <span className="flex items-center gap-1.5">
            <TrendingUp className="h-4 w-4 text-(--price-high)" aria-hidden="true" />
            {t('tariffs.todayHigh')}:{' '}
            <strong className="text-(--price-high)">{PRICE_MAX.toFixed(3)}</strong>
          </span>
        </div>
      </div>

      {/* Price position bar */}
      <div className="mt-4">
        <div className="relative h-2.5 overflow-hidden rounded-full bg-(--color-surface)">
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-linear-to-r from-emerald-500 via-yellow-500 to-red-500"
            style={{ width: '100%' }}
          />
          <motion.div
            className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-(--color-background) shadow-lg"
            style={{
              left: `${Math.min(100, Math.max(0, ((currentPrice - PRICE_MIN) / (PRICE_SPREAD || 1)) * 100))}%`,
            }}
            animate={{ scale: [1, 1.2, 1] }}
            transition={{ repeat: Infinity, duration: 2 }}
          />
        </div>
        <div className="mt-1 flex justify-between text-(--color-muted) text-[10px]">
          <span>{PRICE_MIN.toFixed(2)} €</span>
          <span>{PRICE_MAX.toFixed(2)} €</span>
        </div>
      </div>
    </motion.div>
  );
}
