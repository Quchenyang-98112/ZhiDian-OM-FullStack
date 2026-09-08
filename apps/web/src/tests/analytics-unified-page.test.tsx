import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import AnalyticsUnified from '../pages/Analytics';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => fallback ?? key,
  }),
}));

vi.mock('../components/layout/PageHeader', () => ({
  PageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
}));

vi.mock('../components/ui/PageCrossLinks', () => ({
  PageCrossLinks: () => <div data-testid="page-cross-links" />,
}));

vi.mock('../components/ui/HelpTooltip', () => ({
  HelpTooltip: () => null,
}));

vi.mock('../pages/AnalyticsPage', () => ({
  default: () => <div data-testid="analytics-realtime-panel" />,
}));

vi.mock('../pages/HistoricalAnalyticsPage', () => ({
  default: () => <div data-testid="analytics-historical-panel" />,
}));

describe('Analytics unified page', () => {
  it('renders quick links, realtime tab, and cross-links by default', async () => {
    render(<AnalyticsUnified />);

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('analyticsUnified.title');
    expect(screen.getByText('analyticsUnified.co2Report')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /analyticsUnified.realtimeTab/i })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(await screen.findByTestId('analytics-realtime-panel')).toBeInTheDocument();
    expect(screen.getByTestId('page-cross-links')).toBeInTheDocument();
  });

  it('switches to the historical tab from quick links and tab controls', async () => {
    const user = userEvent.setup();
    render(<AnalyticsUnified />);

    await user.click(screen.getByRole('button', { name: /analyticsUnified.timeSeries/i }));

    await waitFor(() => {
      expect(screen.getByRole('tab', { name: /analyticsUnified.historicalTab/i })).toHaveAttribute(
        'aria-selected',
        'true',
      );
      expect(screen.getByTestId('analytics-historical-panel')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('tab', { name: /analyticsUnified.realtimeTab/i }));

    await waitFor(() => {
      expect(screen.getByTestId('analytics-realtime-panel')).toBeInTheDocument();
    });
  });
});
