import { Signal } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export function TariffHeaderActions({
  tariffProvider,
  providerLabel,
  priceZone,
  currentPrice,
}: {
  tariffProvider: string | undefined;
  providerLabel: string;
  priceZone: 'low' | 'mid' | 'high';
  currentPrice: number;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-3">
      <span
        className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-semibold text-xs ${
          tariffProvider !== 'none'
            ? 'bg-emerald-500/15 text-emerald-400'
            : 'bg-zinc-500/15 text-zinc-400'
        }`}
      >
        <Signal className="h-3 w-3" aria-hidden="true" />
        {providerLabel}
      </span>
      <span
        className={`price-pill text-lg ${
          priceZone === 'low'
            ? 'text-(--price-low)'
            : priceZone === 'high'
              ? 'text-(--price-high)'
              : ''
        }`}
      >
        {currentPrice.toFixed(3)} {t('units.euroPerKwh')}
      </span>
    </div>
  );
}
