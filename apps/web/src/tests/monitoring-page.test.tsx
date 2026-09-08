import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import MonitoringPage from '../pages/MonitoringPage';

// Data sources — deterministic snapshot so the hook resolves to known counts.
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('../core/useMetrics', () => ({
  useMetrics: () => ({
    families: [],
    health: { uptime: 3600, connections: 2 },
    lastUpdated: 1_700_000_000_000,
    error: null,
  }),
  getMetricFromSnapshot: () => null,
}));

vi.mock('../store', () => ({
  useAppStoreShallow: (
    selector: (s: { energyData: Record<string, number>; connected: boolean }) => unknown,
  ) =>
    selector({
      energyData: {
        pvPower: 1000,
        gridPower: 500,
        batteryPower: 0,
        batterySoC: 50,
        houseLoad: 800,
        evPower: 0,
        heatPumpPower: 0,
        gridVoltage: 230,
        priceCurrent: 0.3,
      },
      connected: true,
    }),
}));

vi.mock('../components/layout/PageHeader', () => ({
  PageHeader: ({ title, actions }: { title: string; actions?: ReactNode }) => (
    <div>
      <h1>{title}</h1>
      {actions}
    </div>
  ),
}));

vi.mock('../components/ui/PageCrossLinks', () => ({
  PageCrossLinks: () => <div data-testid="cross-links" />,
}));

// Lightweight section stubs echo the data the hook wired in (avoids recharts).
vi.mock('../components/monitoring', () => ({
  AdapterHealthSection: ({
    adapters,
    contribAdapters,
  }: {
    adapters: unknown[];
    contribAdapters: unknown[];
  }) => <div data-testid="adapters">{`${adapters.length}-${contribAdapters.length}`}</div>,
  AlertRulesSection: ({ alertRules }: { alertRules: unknown[] }) => (
    <div data-testid="alerts">{alertRules.length}</div>
  ),
  EventLogSection: ({ eventLog }: { eventLog: unknown[] }) => (
    <div data-testid="events">{eventLog.length}</div>
  ),
  GrafanaSection: () => <div data-testid="grafana" />,
  LoadChartSection: ({ loadHistory }: { loadHistory: unknown[] }) => (
    <div data-testid="load">{loadHistory.length}</div>
  ),
  MetricCardsGrid: ({ cards }: { cards: unknown[] }) => (
    <div data-testid="cards">{cards.length}</div>
  ),
  PageActions: ({ activeAlerts }: { activeAlerts: number }) => (
    <div data-testid="page-actions">{activeAlerts}</div>
  ),
  ResourceSection: () => <div data-testid="resources" />,
  SystemHealthBanner: ({ uptime }: { uptime: number }) => <div data-testid="banner">{uptime}</div>,
}));

describe('MonitoringPage', () => {
  it('wires the useMonitoringData hook through to every section without crashing', () => {
    render(<MonitoringPage />);
    // 10 metric cards, 5 core + 4 contrib adapters, 6 events, 6 alert rules,
    // 24-point load history — proves the extracted hook + data modules resolve.
    expect(screen.getByTestId('cards')).toHaveTextContent('10');
    expect(screen.getByTestId('adapters')).toHaveTextContent('5-4');
    expect(screen.getByTestId('events')).toHaveTextContent('6');
    expect(screen.getByTestId('alerts')).toHaveTextContent('6');
    expect(screen.getByTestId('load')).toHaveTextContent('24');
    expect(screen.getByTestId('banner')).toHaveTextContent('3600');
  });

  it('suppresses the page header and cross-links when embedded', () => {
    render(<MonitoringPage embedded />);
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull();
    expect(screen.queryByTestId('cross-links')).toBeNull();
  });
});
