import type { EnergyData } from '@nexus-hems/shared-types';
import type { TFunction } from 'i18next';
import { isPeakElectricityHour, isSolarPeakHour } from './analytics-chart-data';
import { getUbaFactor } from './co2-report';
import { calculateCo2Savings } from './format';

/** Derived KPI and efficiency metrics for the Analytics dashboard. */
export interface AnalyticsDashboardMetrics {
  selfConsumed: number;
  selfRate: number;
  autarky: number;
  co2Total: number;
  savingsToday: number;
  gridImport: number;
  gridExport: number;
  feedInRevenue: number;
  gridCost: number;
  netCost: number;
  isPeakHour: boolean;
  isSolarPeak: boolean;
  systemEfficiency: number;
  inverterEfficiency: number;
  batteryRoundTrip: number;
  costAllocation: { name: string; value: number; color: string }[];
  monthlyCo2: {
    gridEmissions: number;
    selfSavings: number;
    feedInSavings: number;
    netBalance: number;
    totalSaved: number;
    treesEquiv: number;
    carKmEquiv: number;
    flightsEquiv: number;
  };
}

/** Compute dashboard KPIs, cost allocation, and CO₂ figures from live energy data. */
export const computeAnalyticsDashboardMetrics = (
  energyData: EnergyData,
  t: TFunction,
): AnalyticsDashboardMetrics => {
  const selfConsumed = Math.min(
    energyData.pvPower,
    energyData.houseLoad + energyData.heatPumpPower + energyData.evPower,
  );
  const selfRate = energyData.pvPower > 0 ? (selfConsumed / energyData.pvPower) * 100 : 0;
  const autarky =
    energyData.houseLoad > 0 ? Math.min(100, (selfConsumed / energyData.houseLoad) * 100) : 0;
  const co2Total = calculateCo2Savings(energyData.pvYieldToday);
  const savingsToday = energyData.pvYieldToday * energyData.priceCurrent;
  const gridImport = Math.max(0, energyData.gridPower);
  const gridExport = Math.max(0, -energyData.gridPower);
  const feedInRevenue = (gridExport / 1000) * 0.0811;
  const gridCost = (gridImport / 1000) * energyData.priceCurrent;
  const netCost = gridCost - feedInRevenue;
  const hour = new Date().getHours();
  const selfSavings = (selfConsumed / 1000) * energyData.priceCurrent;
  const costAllocation = [
    {
      name: t('analytics.selfConsumptionSavings'),
      value: Math.round(selfSavings * 100),
      color: 'var(--chart-1)',
    },
    {
      name: t('analytics.gridCostLabel'),
      value: Math.round(gridCost * 100),
      color: 'var(--chart-3)',
    },
    {
      name: t('analytics.feedInRevenue'),
      value: Math.round(feedInRevenue * 100),
      color: 'var(--chart-6)',
    },
  ].filter((d) => d.value > 0);

  const pvKwh = energyData.pvYieldToday * 30;
  const selfConsumedKwh = pvKwh * (selfRate / 100);
  const exportedKwh = pvKwh - selfConsumedKwh;
  const importedKwh = (gridImport / 1000) * 24 * 30;
  const factorKg = getUbaFactor(new Date().getFullYear()) / 1000;
  const gridEmissions = importedKwh * factorKg;
  const selfSavingsCo2 = selfConsumedKwh * factorKg;
  const feedInSavings = exportedKwh * factorKg;
  const netBalance = gridEmissions - selfSavingsCo2 - feedInSavings;
  const totalSaved = selfSavingsCo2 + feedInSavings;

  return {
    selfConsumed,
    selfRate,
    autarky,
    co2Total,
    savingsToday,
    gridImport,
    gridExport,
    feedInRevenue,
    gridCost,
    netCost,
    isPeakHour: isPeakElectricityHour(hour),
    isSolarPeak: isSolarPeakHour(hour),
    systemEfficiency:
      energyData.pvPower > 0
        ? Math.min(99, ((selfConsumed + gridExport) / energyData.pvPower) * 100)
        : 0,
    inverterEfficiency: energyData.pvPower > 0 ? 96.2 + (energyData.pvPower % 100) / 100 : 0,
    batteryRoundTrip: energyData.batterySoC > 10 ? 92.5 + (energyData.batterySoC % 10) / 5 : 0,
    costAllocation,
    monthlyCo2: {
      gridEmissions,
      selfSavings: selfSavingsCo2,
      feedInSavings,
      netBalance,
      totalSaved,
      treesEquiv: totalSaved / (22 / 12),
      carKmEquiv: totalSaved / 0.12,
      flightsEquiv: totalSaved / 250,
    },
  };
};

const efficiencyBarColor = (value: number, green: number, yellow: number) =>
  value > green ? 'bg-emerald-500/70' : value > yellow ? 'bg-yellow-500/70' : 'bg-red-500/70';

/** Efficiency progress-bar rows for the Analytics efficiency section. */
export const buildEfficiencySectionMetrics = (
  t: TFunction,
  selfRate: number,
  autarky: number,
  inverterEfficiency: number,
  batteryRoundTrip: number,
) => [
  {
    label: t('analytics.inverterEfficiency'),
    value: inverterEfficiency,
    max: 100,
    suffix: '%',
    color: inverterEfficiency > 95 ? 'bg-emerald-500/70' : 'bg-yellow-500/70',
  },
  {
    label: t('analytics.batteryRoundTrip'),
    value: batteryRoundTrip,
    max: 100,
    suffix: '%',
    color: batteryRoundTrip > 90 ? 'bg-emerald-500/70' : 'bg-yellow-500/70',
  },
  {
    label: t('analytics.selfConsumptionRate'),
    value: selfRate,
    max: 100,
    suffix: '%',
    color: efficiencyBarColor(selfRate, 60, 30),
  },
  {
    label: t('analytics.autarky'),
    value: autarky,
    max: 100,
    suffix: '%',
    color: efficiencyBarColor(autarky, 70, 40),
  },
];

/** Data-quality status rows for the Analytics efficiency section. */
export const buildDataQualityItems = (t: TFunction) => [
  {
    label: t('analytics.dataCompleteness'),
    value: 98.7,
    desc: t('analytics.dataCompletenessDesc'),
    status: 'ok' as const,
  },
  {
    label: t('analytics.sensorAccuracy'),
    value: 99.2,
    desc: t('analytics.sensorAccuracyDesc'),
    status: 'ok' as const,
  },
  {
    label: t('analytics.updateFrequency'),
    value: 100,
    desc: t('analytics.updateFrequencyDesc'),
    status: 'ok' as const,
  },
  {
    label: t('analytics.dataRetention'),
    value: 85,
    desc: t('analytics.dataRetentionDesc'),
    status: 'warn' as const,
  },
];
