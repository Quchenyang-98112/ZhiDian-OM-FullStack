import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { generateEnergyBalance, generateMonthlyComparison } from '../lib/analytics-chart-data';
import { computeAnalyticsDashboardMetrics } from '../lib/analytics-derived-metrics';
import { runDemoForecast } from '../lib/analytics-forecast-demo';
import { buildAnalyticsKpiCards } from '../lib/analytics-kpi-cards';
import { getUbaFactor } from '../lib/co2-report';
import type { ForecastResult } from '../lib/ml-forecast';
import { useAppStoreShallow } from '../store';
import { AnalyticsBalanceCostSection } from './analytics/AnalyticsBalanceCostSection';
import { AnalyticsCo2ReportSection } from './analytics/AnalyticsCo2ReportSection';
import { AnalyticsCrossLinksSection } from './analytics/AnalyticsCrossLinksSection';
import { AnalyticsEfficiencySection } from './analytics/AnalyticsEfficiencySection';
import { AnalyticsExportSharingSection } from './analytics/AnalyticsExportSharingSection';
import { AnalyticsKpiGridSection } from './analytics/AnalyticsKpiGridSection';
import { AnalyticsMlForecastSection } from './analytics/AnalyticsMlForecastSection';
import { AnalyticsMonthlyComparisonSection } from './analytics/AnalyticsMonthlyComparisonSection';
import { AnalyticsPageHeaderSection } from './analytics/AnalyticsPageHeaderSection';
import { AnalyticsPredictiveForecastSection } from './analytics/AnalyticsPredictiveForecastSection';

/**
 * @param embedded When rendered inside the unified Analytics wrapper (as a tab
 *   panel), the wrapper already supplies the page header and cross-links footer,
 *   so this page suppresses its own to avoid a duplicate <h1> and duplicate
 *   "related sections" panels. Defaults to false for standalone use.
 */
const AnalyticsPageComponent = ({ embedded = false }: { embedded?: boolean }) => {
  const { t } = useTranslation();
  const energyData = useAppStoreShallow((s) => s.energyData);
  const metrics = computeAnalyticsDashboardMetrics(energyData, t);
  const currentYear = new Date().getFullYear();
  const ubaFactor = getUbaFactor(currentYear);
  const {
    selfRate,
    autarky,
    feedInRevenue,
    gridCost,
    netCost,
    costAllocation,
    monthlyCo2,
    isPeakHour,
    isSolarPeak,
    inverterEfficiency,
    batteryRoundTrip,
  } = metrics;

  const [selectedMetric, setSelectedMetric] = useState<string>('pvPower');
  const [forecastResult, setForecastResult] = useState<ForecastResult | null>(null);
  const [forecastLoading, setForecastLoading] = useState(false);

  const handleRunForecast = () => {
    setForecastLoading(true);
    setForecastResult(runDemoForecast(energyData, selectedMetric));
    setForecastLoading(false);
  };

  const balanceData = generateEnergyBalance(energyData.pvPower, energyData.houseLoad);
  const monthlyData = generateMonthlyComparison(energyData.pvYieldToday);
  const kpiCards = buildAnalyticsKpiCards(metrics, energyData, t);

  return (
    <div className="space-y-6">
      {!embedded && (
        <AnalyticsPageHeaderSection t={t} isPeakHour={isPeakHour} isSolarPeak={isSolarPeak} />
      )}

      <AnalyticsKpiGridSection kpiCards={kpiCards} />

      <AnalyticsBalanceCostSection
        t={t}
        balanceData={balanceData}
        costAllocation={costAllocation}
        netCost={netCost}
        gridCost={gridCost}
        feedInRevenue={feedInRevenue}
      />

      <AnalyticsMonthlyComparisonSection t={t} monthlyData={monthlyData} />

      <AnalyticsEfficiencySection
        t={t}
        energyData={energyData}
        selfRate={selfRate}
        autarky={autarky}
        inverterEfficiency={inverterEfficiency}
        batteryRoundTrip={batteryRoundTrip}
      />

      <AnalyticsMlForecastSection
        t={t}
        selectedMetric={selectedMetric}
        onSelectedMetricChange={setSelectedMetric}
        forecastResult={forecastResult}
        forecastLoading={forecastLoading}
        onRunForecast={handleRunForecast}
      />

      <AnalyticsCo2ReportSection
        t={t}
        currentYear={currentYear}
        ubaFactor={ubaFactor}
        monthlyCo2={monthlyCo2}
      />

      <AnalyticsPredictiveForecastSection />

      <AnalyticsExportSharingSection />

      {!embedded && <AnalyticsCrossLinksSection />}
    </div>
  );
};

export default AnalyticsPageComponent;
