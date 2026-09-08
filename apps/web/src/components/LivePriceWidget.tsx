import { TrendingDown, TrendingUp, Zap } from 'lucide-react';
import { motion } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { usePriceForecast } from '../lib/queries';
import { useAppStore } from '../store';

export function LivePriceWidget() {
  const { t, i18n } = useTranslation();
  const dateLocale = i18n.language === 'de' ? 'de-DE' : 'en-US';
  const priceCurrent = useAppStore((s) => s.energyData.priceCurrent);
  const tariffProvider = useAppStore((s) => s.settings.tariffProvider);
  const chargeThreshold = useAppStore((s) => s.settings.chargeThreshold);

  // Forecast via TanStack Query + AI Worker (cached 15 min, off-main-thread)
  const { data: forecastData } = usePriceForecast(
    tariffProvider === 'none' ? 'tibber' : tariffProvider,
  );

  const forecast = forecastData?.prices ?? [];
  const nextBestSlot =
    forecast.length > 0 ? [...forecast].sort((a, b) => a.price - b.price)[0] : null;

  const currentPrice = priceCurrent;
  const isGoodPrice = currentPrice < chargeThreshold;
  const trend = nextBestSlot && currentPrice > nextBestSlot.price ? 'down' : 'up';

  const chartSlice = forecast.slice(0, 12);
  const { maxPrice, minPrice } = (() => {
    if (chartSlice.length === 0) return { maxPrice: 1, minPrice: 0 };
    const prices = chartSlice.map((s) => s.price);
    return { maxPrice: Math.max(...prices), minPrice: Math.min(...prices) };
  })();

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-panel p-5"
    >
      <div
        className="flex items-center justify-between gap-4"
        aria-live="polite"
        aria-atomic="true"
      >
        <div>
          <p className="eyebrow mb-2">
            <Zap className="inline h-4 w-4" aria-hidden="true" />
            {tariffProvider === 'tibber'
              ? t('settings.tibber')
              : tariffProvider === 'awattar'
                ? t('settings.awattar')
                : t('settings.none')}
          </p>
          <div className="flex items-baseline gap-2">
            <span className="font-semibold text-(--color-text) text-3xl tabular-nums">
              {currentPrice.toFixed(3)}
            </span>
            <span className="text-(--color-muted) text-sm">{t('units.euroPerKwh')}</span>
          </div>
        </div>

        <div
          className={`flex h-16 w-16 items-center justify-center rounded-full ${
            isGoodPrice ? 'bg-emerald-500/20 text-emerald-400' : 'bg-orange-500/20 text-orange-400'
          }`}
        >
          <span className="sr-only">
            {isGoodPrice ? t('tariffs.priceGood') : t('tariffs.priceHigh')}
          </span>
          {trend === 'down' ? (
            <TrendingDown className="h-8 w-8" aria-hidden="true" />
          ) : (
            <TrendingUp className="h-8 w-8" aria-hidden="true" />
          )}
        </div>
      </div>

      {nextBestSlot && (
        <div className="mt-4 border-(--color-border) border-t pt-4">
          <p className="text-(--color-muted) text-xs">
            {t('ai.nextBestAction')}:{' '}
            <span className="font-semibold text-(--color-primary)">
              {nextBestSlot.timestamp.toLocaleTimeString(dateLocale, {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>{' '}
            ({nextBestSlot.price.toFixed(3)} {t('units.euroPerKwh')})
          </p>
        </div>
      )}

      {/* Mini Chart */}
      <div
        className="mt-4 flex h-12 items-end gap-0.5"
        role="img"
        aria-label={t('chart.priceAriaLabel', 'Price forecast chart for the next 12 hours')}
      >
        {chartSlice.map((slot, _i) => {
          const range = maxPrice - minPrice || 1;
          const height = ((slot.price - minPrice) / range) * 100;

          return (
            <div
              key={slot.timestamp.getTime()}
              className="flex-1 rounded-t-sm bg-(--color-primary)/40 transition-all hover:bg-(--color-primary)"
              style={{ height: `${height}%` }}
              title={`${slot.timestamp.toLocaleTimeString(dateLocale, { hour: '2-digit' })}: ${slot.price.toFixed(3)} ${t('units.euroPerKwh')}`}
            />
          );
        })}
      </div>
    </motion.div>
  );
}
