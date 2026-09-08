import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MONTHLY_TOTAL } from '../components/tariffs/data/monthly';
import TariffsPage from '../pages/TariffsPage';

interface StoreState {
  energyData: { priceCurrent: number; pvYieldToday: number };
  settings: {
    chargeThreshold: number;
    tariffProvider: string;
    feedInTariff: number;
    monthlyBudget: number;
    priceAlerts: boolean;
    priceAlertThreshold: number;
  };
}

const store = vi.hoisted(() => ({ value: null as StoreState | null }));

function setStore(over: Partial<StoreState['settings']> & { priceCurrent?: number } = {}) {
  const { priceCurrent, ...settings } = over;
  store.value = {
    energyData: { priceCurrent: priceCurrent ?? 0.1, pvYieldToday: 12 },
    settings: {
      chargeThreshold: 0.15,
      tariffProvider: 'tibber',
      feedInTariff: 0.082,
      monthlyBudget: 80,
      priceAlerts: true,
      priceAlertThreshold: 0.1,
      ...settings,
    },
  };
}

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('../store', () => ({
  useAppStoreShallow: (selector: (s: StoreState) => unknown) => selector(store.value as StoreState),
}));
vi.mock('../components/layout/PageHeader', () => ({
  PageHeader: ({ title, actions }: { title: string; actions: React.ReactNode }) => (
    <div data-testid="page-header">
      <span>{title}</span>
      {actions}
    </div>
  ),
}));
vi.mock('../components/ui/PageCrossLinks', () => ({
  PageCrossLinks: () => <div data-testid="cross-links" />,
}));
vi.mock('../components/LivePriceWidget', () => ({
  LivePriceWidget: () => <div data-testid="lpw" />,
}));
vi.mock('../components/PredictiveForecast', () => ({
  PredictiveForecast: () => <div data-testid="pf" />,
}));
vi.mock('recharts', () => {
  const Pass = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>;
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

describe('TariffsPage', () => {
  beforeEach(() => {
    setStore();
  });

  it('renders all major sections and the active provider label', () => {
    render(<TariffsPage />);
    expect(screen.getByText('tariffs.timeline48h')).toBeInTheDocument();
    expect(screen.getByText('tariffs.heatmapTitle')).toBeInTheDocument();
    expect(screen.getByText('tariffs.windowsTitle')).toBeInTheDocument();
    expect(screen.getByText('tariffs.scheduleTitle')).toBeInTheDocument();
    expect(screen.getByText('tariffs.monthlyCostTitle')).toBeInTheDocument();
    expect(screen.getByText('tariffs.providerTitle')).toBeInTheDocument();
    expect(screen.getByText('tariffs.insightsTitle')).toBeInTheDocument();
    expect(screen.getAllByText('Tibber').length).toBeGreaterThan(0);
  });

  it('toggles the 48h timeline between price and renewable views', async () => {
    const user = userEvent.setup();
    render(<TariffsPage />);
    const renewableBtn = screen.getByRole('button', { name: 'tariffs.viewRenewable' });
    const priceBtn = screen.getByRole('button', { name: 'tariffs.viewPrice' });
    expect(priceBtn).toHaveAttribute('aria-pressed', 'true');

    await user.click(renewableBtn);
    expect(renewableBtn).toHaveAttribute('aria-pressed', 'true');
    await user.click(priceBtn);
    expect(priceBtn).toHaveAttribute('aria-pressed', 'true');
  });

  it('renders the high-price / no-provider / alerts-off branch', () => {
    setStore({ priceCurrent: 0.5, tariffProvider: 'none', priceAlerts: false });
    render(<TariffsPage />);
    expect(screen.getByText('tariffs.priceHigh')).toBeInTheDocument();
    expect(screen.getByText('tariffs.alertsInactive')).toBeInTheDocument();
    expect(screen.getAllByText('settings.none').length).toBeGreaterThan(0);
  });

  it('renders the aWATTar provider label', () => {
    setStore({ tariffProvider: 'awattar' });
    render(<TariffsPage />);
    expect(screen.getAllByText('aWATTar').length).toBeGreaterThan(0);
  });

  it('renders the over-budget gauge branch (>90%)', () => {
    setStore({ monthlyBudget: MONTHLY_TOTAL / 0.95 });
    render(<TariffsPage />);
    // 95% rounds to the budget gauge label.
    expect(screen.getAllByText('95%').length).toBeGreaterThan(0);
  });

  it('renders the mid-budget gauge branch (70–90%)', () => {
    setStore({ monthlyBudget: MONTHLY_TOTAL / 0.8 });
    render(<TariffsPage />);
    expect(screen.getAllByText('80%').length).toBeGreaterThan(0);
  });
});
