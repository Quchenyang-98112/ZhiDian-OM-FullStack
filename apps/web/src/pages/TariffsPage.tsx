import { TrendingUp } from 'lucide-react';
import { motion } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { LivePriceWidget } from '../components/LivePriceWidget';
import { PageHeader } from '../components/layout/PageHeader';
import { PredictiveForecast } from '../components/PredictiveForecast';
import {
  ChargeWindowsSection,
  DeviceScheduleSection,
  FeedInSection,
  InsightsSection,
  MonthlyCostSection,
  PriceDistributionSection,
  PriceHeatmapSection,
  PriceTimelineSection,
  ProviderInfoSection,
  TariffHeaderActions,
  TariffKpiCards,
  TariffStatusBar,
  useTariffsData,
} from '../components/tariffs';
import { sectionAnim } from '../components/tariffs/constants';
import { PageCrossLinks } from '../components/ui/PageCrossLinks';

function TariffsPageComponent() {
  const { t } = useTranslation();
  const tariffs = useTariffsData();

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('nav.tariffs')}
        subtitle={t('tariffs.subtitle')}
        icon={<TrendingUp size={22} aria-hidden="true" />}
        actions={
          <TariffHeaderActions
            tariffProvider={tariffs.tariffProvider}
            providerLabel={tariffs.providerLabel}
            priceZone={tariffs.priceZone}
            currentPrice={tariffs.currentPrice}
          />
        }
      />

      <TariffStatusBar currentPrice={tariffs.currentPrice} isGoodPrice={tariffs.isGoodPrice} />

      <TariffKpiCards
        currentPrice={tariffs.currentPrice}
        isGoodPrice={tariffs.isGoodPrice}
        feedInTariff={tariffs.feedInTariff}
      />

      <PriceTimelineSection
        view48h={tariffs.view48h}
        onView48h={tariffs.setView48h}
        chargeThreshold={tariffs.chargeThreshold}
      />

      <PriceHeatmapSection />

      <ChargeWindowsSection
        expandedWindow={tariffs.expandedWindow}
        onExpandedWindow={tariffs.setExpandedWindow}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <DeviceScheduleSection />
        <PriceDistributionSection />
      </div>

      <MonthlyCostSection
        monthlyBudget={tariffs.monthlyBudget}
        monthlyBudgetPct={tariffs.monthlyBudgetPct}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <FeedInSection feedInTariff={tariffs.feedInTariff} pvYieldToday={tariffs.pvYieldToday} />
        <ProviderInfoSection
          providerLabel={tariffs.providerLabel}
          chargeThreshold={tariffs.chargeThreshold}
          priceAlerts={tariffs.priceAlerts}
          priceAlertThreshold={tariffs.priceAlertThreshold}
        />
      </div>

      <motion.div {...sectionAnim} transition={{ ...sectionAnim.transition, delay: 0.55 }}>
        <ErrorBoundary>
          <LivePriceWidget />
        </ErrorBoundary>
      </motion.div>

      <motion.div {...sectionAnim} transition={{ ...sectionAnim.transition, delay: 0.6 }}>
        <ErrorBoundary>
          <PredictiveForecast />
        </ErrorBoundary>
      </motion.div>

      <InsightsSection />

      <PageCrossLinks />
    </div>
  );
}

export default TariffsPageComponent;
