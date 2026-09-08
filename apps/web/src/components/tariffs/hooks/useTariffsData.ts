import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppStoreShallow } from '../../../store';
import { PRICE_AVG } from '../data/constants';
import { MONTHLY_TOTAL } from '../data/monthly';
import type { View48h } from '../types';

/**
 * Tariff page store selectors + derived pricing state + local view state, so
 * the page component stays a thin orchestrator.
 */
export function useTariffsData() {
  const { t } = useTranslation();
  // Granular selectors — only re-render when these specific fields change.
  const {
    priceCurrent,
    pvYieldToday,
    chargeThreshold,
    tariffProvider,
    feedInTariff,
    monthlyBudget,
    priceAlerts,
    priceAlertThreshold,
  } = useAppStoreShallow((s) => ({
    priceCurrent: s.energyData.priceCurrent,
    pvYieldToday: s.energyData.pvYieldToday,
    chargeThreshold: s.settings.chargeThreshold ?? 0.15,
    tariffProvider: s.settings.tariffProvider,
    feedInTariff: s.settings.feedInTariff ?? 0.082,
    monthlyBudget: s.settings.monthlyBudget ?? 80,
    priceAlerts: s.settings.priceAlerts,
    priceAlertThreshold: s.settings.priceAlertThreshold ?? 0.1,
  }));

  const [expandedWindow, setExpandedWindow] = useState<number | null>(null);
  const [view48h, setView48h] = useState<View48h>('price');

  const currentPrice = priceCurrent ?? 0.18;
  const isGoodPrice = currentPrice < chargeThreshold;
  const priceZone: 'low' | 'mid' | 'high' =
    currentPrice < PRICE_AVG * 0.7 ? 'low' : currentPrice < PRICE_AVG * 1.2 ? 'mid' : 'high';
  const providerLabel =
    tariffProvider === 'tibber'
      ? 'Tibber'
      : tariffProvider === 'awattar'
        ? 'aWATTar'
        : t('settings.none');
  const monthlyBudgetPct = Math.min(100, (MONTHLY_TOTAL / monthlyBudget) * 100);

  return {
    pvYieldToday,
    chargeThreshold,
    tariffProvider,
    feedInTariff,
    monthlyBudget,
    priceAlerts,
    priceAlertThreshold,
    currentPrice,
    isGoodPrice,
    priceZone,
    providerLabel,
    monthlyBudgetPct,
    expandedWindow,
    setExpandedWindow,
    view48h,
    setView48h,
  };
}
