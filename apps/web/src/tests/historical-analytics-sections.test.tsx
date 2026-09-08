import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ForecastHistorySection } from '../components/historical-analytics/sections/ForecastHistorySection';
import { ForecastTable } from '../components/historical-analytics/sections/ForecastTable';
import { HistoricalHeader } from '../components/historical-analytics/sections/HistoricalHeader';
import { InfrastructureSection } from '../components/historical-analytics/sections/InfrastructureSection';
import { SummaryCards } from '../components/historical-analytics/sections/SummaryCards';
import type { AIForecastRecord } from '../lib/db';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

function makeForecast(id: number, r2: number, persisted: boolean): AIForecastRecord {
  return {
    id,
    metric: 'pvPower',
    model: 'holt-winters',
    createdAt: 1_700_000_000_000 + id,
    horizonHours: 24,
    accuracy: { mae: 80, mape: 5, rmse: 100, r2 },
    points: [],
    persistedToInflux: persisted,
  };
}

describe('historical-analytics sections', () => {
  it('HistoricalHeader renders each InfluxDB status branch', () => {
    const noop = vi.fn();
    const { rerender } = render(
      <HistoricalHeader influxHealthy={true} timeRange="7d" onRangeChange={noop} />,
    );
    expect(screen.getByText('historicalAnalytics.influxConnected')).toBeInTheDocument();

    rerender(<HistoricalHeader influxHealthy={false} timeRange="7d" onRangeChange={noop} />);
    expect(screen.getByText('historicalAnalytics.influxDisconnected')).toBeInTheDocument();

    rerender(<HistoricalHeader influxHealthy={null} timeRange="7d" onRangeChange={noop} />);
    expect(screen.getByText('historicalAnalytics.influxNotConfigured')).toBeInTheDocument();
  });

  it('InfrastructureSection reflects healthy and unhealthy InfluxDB via the status icon', () => {
    // The service names render in both states — the branch difference is the
    // accessible status icon, so assert that.
    const { rerender } = render(<InfrastructureSection influxHealthy={true} />);
    expect(screen.getByLabelText('historicalAnalytics.serviceHealthyLabel')).toBeInTheDocument();

    rerender(<InfrastructureSection influxHealthy={false} />);
    expect(screen.getByLabelText('historicalAnalytics.serviceUnhealthyLabel')).toBeInTheDocument();
  });

  it('SummaryCards toggles the loading placeholder', () => {
    const stats = { avgPv: 100, avgLoad: 200, peakPv: 300, avgSoC: 50 };
    const { rerender } = render(<SummaryCards {...stats} isLoading />);
    expect(screen.getAllByText('...').length).toBeGreaterThan(0);

    rerender(<SummaryCards {...stats} isLoading={false} />);
    expect(screen.getByText('100 W')).toBeInTheDocument();
    expect(screen.getByText('50%')).toBeInTheDocument();
  });

  it('ForecastTable colours R² across all thresholds', () => {
    render(
      <ForecastTable
        forecasts={[
          makeForecast(1, 0.9, true),
          makeForecast(2, 0.6, false),
          makeForecast(3, 0.3, false),
        ]}
      />,
    );
    expect(screen.getByText('90.0%')).toBeInTheDocument();
    expect(screen.getByText('60.0%')).toBeInTheDocument();
    expect(screen.getByText('30.0%')).toBeInTheDocument();
    // Accessible sync-state icons (persisted true vs false).
    expect(screen.getByLabelText('historicalAnalytics.forecastSyncedLabel')).toBeInTheDocument();
    expect(screen.getAllByLabelText('historicalAnalytics.forecastPendingLabel').length).toBe(2);
  });

  it('ForecastHistorySection shows the empty state with sync controls', () => {
    render(
      <ForecastHistorySection
        forecastHistory={[]}
        accuracyData={[]}
        unsyncedCount={3}
        canSync
        syncing={false}
        syncResult={2}
        onSync={vi.fn()}
      />,
    );
    expect(screen.getByText('historicalAnalytics.noForecasts')).toBeInTheDocument();
    expect(screen.getByText('historicalAnalytics.syncToInflux')).toBeInTheDocument();
    expect(screen.getByText('historicalAnalytics.synced')).toBeInTheDocument();
  });
});
