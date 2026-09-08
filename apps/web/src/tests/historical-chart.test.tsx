import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HistoricalChart } from '../components/HistoricalChart';
import { render, screen } from './test-utils';

const mockUseQuery = vi.fn();

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: (...args: unknown[]) => mockUseQuery(...args),
}));

vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  ComposedChart: ({ children, data }: { children: React.ReactNode; data: unknown[] }) => (
    <div data-testid="composed-chart" data-points={data.length}>
      {children}
    </div>
  ),
  Area: () => null,
  CartesianGrid: () => null,
  Legend: () => null,
  Line: () => null,
  ReferenceArea: () => null,
  Tooltip: () => null,
  XAxis: () => null,
  YAxis: () => null,
}));

describe('HistoricalChart', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('downsamples large timestamp-based series before passing them to Recharts', () => {
    const largeSeries = Array.from({ length: 800 }, (_, index) => ({
      timestamp: index * 60_000,
      pvProduction: index,
      gridImport: index / 2,
      gridExport: index / 3,
      batterySoC: index % 100,
    }));

    mockUseQuery.mockReturnValue({
      data: largeSeries,
      isLoading: false,
      isError: false,
    });

    render(<HistoricalChart />);

    expect(screen.getByTestId('composed-chart')).toHaveAttribute('data-points', '300');
  });
});
