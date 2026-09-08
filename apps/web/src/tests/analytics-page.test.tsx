import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import AnalyticsPage from '../pages/AnalyticsPage';

const mockEnergyData = {
  gridPower: -1200,
  pvPower: 4500,
  batteryPower: -800,
  houseLoad: 2800,
  batterySoC: 68,
  heatPumpPower: 600,
  evPower: 0,
  gridVoltage: 231,
  batteryVoltage: 52.4,
  pvYieldToday: 12.5,
  priceCurrent: 0.22,
};

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => fallback ?? key,
  }),
}));

vi.mock('../store', () => ({
  useAppStoreShallow: (selector: (state: { energyData: typeof mockEnergyData }) => unknown) =>
    selector({ energyData: mockEnergyData }),
}));

vi.mock('../components/layout/PageHeader', () => ({
  PageHeader: ({ title, actions }: { title: string; actions?: React.ReactNode }) => (
    <div>
      <h1>{title}</h1>
      {actions}
    </div>
  ),
}));

vi.mock('../components/ui/PageCrossLinks', () => ({
  PageCrossLinks: () => <div data-testid="page-cross-links" />,
}));

vi.mock('../components/ExportAndSharing', () => ({
  ExportAndSharing: () => <div data-testid="export-and-sharing" />,
}));

vi.mock('../components/PredictiveForecast', () => ({
  PredictiveForecast: () => <div data-testid="predictive-forecast" />,
}));

vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AreaChart: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  BarChart: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  LineChart: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  PieChart: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Area: () => null,
  Bar: () => null,
  Line: () => null,
  Pie: () => null,
  Cell: () => null,
  CartesianGrid: () => null,
  Legend: () => null,
  Tooltip: () => null,
  XAxis: () => null,
  YAxis: () => null,
}));

describe('AnalyticsPage', () => {
  it('renders KPI cards, charts, and supporting sections from live energy data', () => {
    render(<AnalyticsPage />);

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Analytics');
    expect(screen.getByText('common.live')).toBeInTheDocument();
    expect(screen.getByText('€2.75')).toBeInTheDocument();
    expect(screen.getAllByText('analytics.selfConsumptionRate').length).toBeGreaterThan(0);
    expect(screen.getAllByText('analytics.autarky').length).toBeGreaterThan(0);
    expect(screen.getByRole('img', { name: 'analytics.balanceChartAria' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'analytics.monthlyChartAria' })).toBeInTheDocument();
    expect(screen.getByTestId('predictive-forecast')).toBeInTheDocument();
    expect(screen.getByTestId('export-and-sharing')).toBeInTheDocument();
    expect(screen.getByTestId('page-cross-links')).toBeInTheDocument();
  });

  it('runs the ML forecast workflow when the user selects a metric and clicks run', async () => {
    const user = userEvent.setup();
    render(<AnalyticsPage />);

    await user.click(screen.getByRole('radio', { name: /Hausverbrauch/ }));
    await user.click(screen.getByRole('button', { name: 'analytics.mlForecastRun' }));

    await waitFor(() => {
      expect(screen.getByText(/analytics.mlForecastModel/i)).toBeInTheDocument();
      expect(screen.getByText(/R²/i)).toBeInTheDocument();
      expect(screen.getByText(/MAPE/i)).toBeInTheDocument();
      expect(screen.getByText(/RMSE/i)).toBeInTheDocument();
    });
  });
});
