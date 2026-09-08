import { render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import HistoricalAnalyticsPage from '../pages/HistoricalAnalyticsPage';

const chartLengths = vi.hoisted(() => ({
  composed: [] as number[],
  area: [] as number[],
  bar: [] as number[],
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('../components/layout/PageHeader', () => ({
  PageHeader: () => <div data-testid="page-header" />,
}));

vi.mock('../components/ui/PageCrossLinks', () => ({
  PageCrossLinks: () => <div data-testid="page-cross-links" />,
}));

vi.mock('../store', () => ({
  useAppStoreShallow: (
    selector: (state: { settings: { influxUrl: string; influxToken: string } }) => unknown,
  ) => selector({ settings: { influxUrl: '', influxToken: '' } }),
}));

vi.mock('../lib/influxdb-client', () => ({
  checkInfluxHealth: vi.fn().mockResolvedValue(false),
  queryTimeSeries: vi.fn(),
}));

vi.mock('../lib/ai-forecast-persistence', () => ({
  getForecastHistory: vi.fn().mockResolvedValue(
    Array.from({ length: 40 }, (_, index) => ({
      id: index + 1,
      metric: `metric-${index}`,
      model: 'holt-winters',
      createdAt: 1_700_000_000_000 + index * 3_600_000,
      horizonHours: 24,
      accuracy: {
        mae: 80,
        mape: 5 + index,
        rmse: 100,
        r2: 0.75,
      },
      points: [],
      persistedToInflux: index % 2 === 0,
    })),
  ),
  syncPendingForecasts: vi.fn().mockResolvedValue(0),
}));

vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  ComposedChart: ({ children, data }: { children: React.ReactNode; data: unknown[] }) => {
    chartLengths.composed.push(data.length);
    return <div>{children}</div>;
  },
  AreaChart: ({ children, data }: { children: React.ReactNode; data: unknown[] }) => {
    chartLengths.area.push(data.length);
    return <div>{children}</div>;
  },
  BarChart: ({ children, data }: { children: React.ReactNode; data: unknown[] }) => {
    chartLengths.bar.push(data.length);
    return <div>{children}</div>;
  },
  Area: () => null,
  Bar: () => null,
  Brush: () => null,
  CartesianGrid: () => null,
  Legend: () => null,
  Line: () => null,
  ResponsiveContainerProps: {},
  Tooltip: () => null,
  XAxis: () => null,
  YAxis: () => null,
}));

describe('HistoricalAnalyticsPage', () => {
  beforeEach(() => {
    chartLengths.composed.length = 0;
    chartLengths.area.length = 0;
    chartLengths.bar.length = 0;
  });

  it('downsamples large history datasets before rendering charts', async () => {
    render(<HistoricalAnalyticsPage />);

    await waitFor(() => {
      expect(chartLengths.composed.some((length) => length === 96)).toBe(true);
      expect(chartLengths.area.some((length) => length === 96)).toBe(true);
      expect(chartLengths.bar.some((length) => length === 18)).toBe(true);
    });
  });
});
