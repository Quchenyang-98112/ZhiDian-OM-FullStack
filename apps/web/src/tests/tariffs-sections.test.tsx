import { type RenderResult, render } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
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
} from '../components/tariffs';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('recharts', () => {
  const Pass = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  const Null = () => null;
  return {
    ResponsiveContainer: Pass,
    BarChart: Pass,
    AreaChart: Pass,
    Area: Null,
    Bar: Null,
    Cell: Null,
    CartesianGrid: Null,
    ReferenceLine: Null,
    Tooltip: Null,
    XAxis: Null,
    YAxis: Null,
  };
});

/** Render, run the assertion, and always unmount (even if the assertion throws). */
function check(node: ReactElement, assertion: (result: RenderResult) => void) {
  const result = render(node);
  try {
    assertion(result);
  } finally {
    result.unmount();
  }
}

describe('tariffs sections — both/all branch variants', () => {
  it('TariffHeaderActions renders each provider + price-zone branch', () => {
    check(
      <TariffHeaderActions
        tariffProvider="tibber"
        providerLabel="Tibber"
        priceZone="low"
        currentPrice={0.1}
      />,
      (r) => expect(r.getByText('Tibber')).toBeInTheDocument(),
    );
    check(
      <TariffHeaderActions
        tariffProvider="awattar"
        providerLabel="aWATTar"
        priceZone="mid"
        currentPrice={0.18}
      />,
      (r) => expect(r.getByText('aWATTar')).toBeInTheDocument(),
    );
    check(
      <TariffHeaderActions
        tariffProvider="none"
        providerLabel="settings.none"
        priceZone="high"
        currentPrice={0.5}
      />,
      (r) => expect(r.getByText('settings.none')).toBeInTheDocument(),
    );
  });

  it('TariffStatusBar distinguishes good and high price states', () => {
    check(<TariffStatusBar currentPrice={0.1} isGoodPrice />, (r) =>
      expect(r.getByText('tariffs.priceGood')).toBeInTheDocument(),
    );
    check(<TariffStatusBar currentPrice={0.5} isGoodPrice={false} />, (r) =>
      expect(r.getByText('tariffs.priceHigh')).toBeInTheDocument(),
    );
  });

  it('TariffKpiCards renders the KPI grid for both price states', () => {
    check(<TariffKpiCards currentPrice={0.1} isGoodPrice feedInTariff={0.082} />, (r) =>
      expect(r.getByText('tariffs.kpiCurrent')).toBeInTheDocument(),
    );
    check(<TariffKpiCards currentPrice={0.5} isGoodPrice={false} feedInTariff={0.082} />, (r) =>
      expect(r.getByText('tariffs.kpiFeedIn')).toBeInTheDocument(),
    );
  });

  it('PriceTimelineSection renders both chart views', () => {
    check(
      <PriceTimelineSection view48h="price" onView48h={vi.fn()} chargeThreshold={0.15} />,
      (r) =>
        expect(r.getByRole('button', { name: 'tariffs.viewPrice' })).toHaveAttribute(
          'aria-pressed',
          'true',
        ),
    );
    check(
      <PriceTimelineSection view48h="renewable" onView48h={vi.fn()} chargeThreshold={0.15} />,
      (r) =>
        expect(r.getByRole('button', { name: 'tariffs.viewRenewable' })).toHaveAttribute(
          'aria-pressed',
          'true',
        ),
    );
  });

  it('ChargeWindowsSection renders expanded and collapsed states', () => {
    check(<ChargeWindowsSection expandedWindow={0} onExpandedWindow={vi.fn()} />, (r) =>
      expect(r.getByText('tariffs.windowsTitle')).toBeInTheDocument(),
    );
    check(<ChargeWindowsSection expandedWindow={null} onExpandedWindow={vi.fn()} />, (r) =>
      expect(r.getByText('tariffs.windowsTitle')).toBeInTheDocument(),
    );
  });

  it('MonthlyCostSection renders the three budget-gauge colour branches', () => {
    check(<MonthlyCostSection monthlyBudget={80} monthlyBudgetPct={95} />, (r) =>
      expect(r.getByText('95%')).toBeInTheDocument(),
    );
    check(<MonthlyCostSection monthlyBudget={80} monthlyBudgetPct={80} />, (r) =>
      expect(r.getByText('80%')).toBeInTheDocument(),
    );
    check(<MonthlyCostSection monthlyBudget={80} monthlyBudgetPct={30} />, (r) =>
      expect(r.getByText('30%')).toBeInTheDocument(),
    );
  });

  it('ProviderInfoSection distinguishes alerts-on and alerts-off', () => {
    check(
      <ProviderInfoSection
        providerLabel="Tibber"
        chargeThreshold={0.15}
        priceAlerts
        priceAlertThreshold={0.1}
      />,
      (r) => expect(r.getByText('tariffs.alertsActive')).toBeInTheDocument(),
    );
    check(
      <ProviderInfoSection
        providerLabel="settings.none"
        chargeThreshold={0.15}
        priceAlerts={false}
        priceAlertThreshold={0.1}
      />,
      (r) => expect(r.getByText('tariffs.alertsInactive')).toBeInTheDocument(),
    );
  });

  it('FeedInSection renders feed-in revenue figures', () => {
    check(<FeedInSection feedInTariff={0.082} pvYieldToday={12.5} />, (r) =>
      expect(r.getByText('tariffs.feedInTitle')).toBeInTheDocument(),
    );
  });

  it('renders the propless data-driven sections', () => {
    check(<PriceHeatmapSection />, (r) =>
      expect(r.getByText('tariffs.heatmapTitle')).toBeInTheDocument(),
    );
    check(<DeviceScheduleSection />, (r) =>
      expect(r.getByText('tariffs.scheduleTitle')).toBeInTheDocument(),
    );
    check(<PriceDistributionSection />, (r) =>
      expect(r.getByText('tariffs.distributionTitle')).toBeInTheDocument(),
    );
    check(<InsightsSection />, (r) =>
      expect(r.getByText('tariffs.insightsTitle')).toBeInTheDocument(),
    );
  });
});
