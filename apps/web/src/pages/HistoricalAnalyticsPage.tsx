import { Activity, Battery, Database } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  BatterySoCChart,
  ChartCard,
  EnergyOverviewChart,
  ForecastHistorySection,
  HistoricalHeader,
  InfrastructureSection,
  SummaryCards,
  useHistoricalAnalytics,
} from '../components/historical-analytics';
import { PageHeader } from '../components/layout/PageHeader';
import { PageCrossLinks } from '../components/ui/PageCrossLinks';

/**
 * @param embedded When rendered as a tab panel inside the unified Analytics
 *   wrapper, the wrapper supplies the page header + cross-links footer; this
 *   page suppresses its own to avoid a duplicate <h1> and duplicate panels.
 */
export default function HistoricalAnalyticsPage({ embedded = false }: { embedded?: boolean }) {
  const { t } = useTranslation();
  const {
    timeRange,
    setTimeRange,
    influxHealthy,
    isLoading,
    sampledTimeSeriesData,
    forecastHistory,
    forecastAccuracyData,
    syncing,
    syncResult,
    handleSync,
    influxConfigured,
    avgPv,
    avgLoad,
    peakPv,
    avgSoC,
    unsyncedCount,
  } = useHistoricalAnalytics();

  return (
    <div className="space-y-6">
      {!embedded && (
        <PageHeader
          title={t('historicalAnalytics.title')}
          subtitle={t('historicalAnalytics.subtitle')}
          icon={<Database size={28} />}
        />
      )}

      <HistoricalHeader
        influxHealthy={influxHealthy}
        timeRange={timeRange}
        onRangeChange={setTimeRange}
      />

      <SummaryCards
        avgPv={avgPv}
        avgLoad={avgLoad}
        peakPv={peakPv}
        avgSoC={avgSoC}
        isLoading={isLoading}
      />

      <ChartCard
        titleKey="historicalAnalytics.energyOverview"
        ariaKey="historicalAnalytics.energyOverviewAria"
        icon={<Activity size={20} className="text-(--color-primary)" aria-hidden="true" />}
        heightClass="h-72 sm:h-80"
        delay={0.1}
      >
        <EnergyOverviewChart data={sampledTimeSeriesData} />
      </ChartCard>

      <ChartCard
        titleKey="historicalAnalytics.batterySoCHistory"
        ariaKey="historicalAnalytics.batterySoCAria"
        icon={<Battery size={20} className="text-purple-400" aria-hidden="true" />}
        heightClass="h-56 sm:h-64"
        delay={0.2}
      >
        <BatterySoCChart data={sampledTimeSeriesData} />
      </ChartCard>

      <ForecastHistorySection
        forecastHistory={forecastHistory}
        accuracyData={forecastAccuracyData}
        unsyncedCount={unsyncedCount}
        canSync={influxConfigured}
        syncing={syncing}
        syncResult={syncResult}
        onSync={handleSync}
      />

      <InfrastructureSection influxHealthy={influxHealthy} />

      {!embedded && <PageCrossLinks />}
    </div>
  );
}
