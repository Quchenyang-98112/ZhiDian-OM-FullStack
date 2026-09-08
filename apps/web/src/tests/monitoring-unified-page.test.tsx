import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import MonitoringUnified from '../pages/Monitoring';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
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
  PageCrossLinks: () => <div data-testid="page-cross-links" />,
}));

vi.mock('../components/ui/HelpTooltip', () => ({
  HelpTooltip: () => null,
}));

vi.mock('../components/ui/EmptyState', () => ({
  EmptyState: () => <div data-testid="empty-state" />,
}));

const panelControl = vi.hoisted(() => ({ shouldThrow: false }));

vi.mock('../pages/MonitoringPage', () => ({
  default: () => {
    if (panelControl.shouldThrow) throw new Error('boom');
    return <div data-testid="monitoring-detail-panel" />;
  },
}));

const storeState = vi.hoisted(() => ({
  connected: true,
  debugMode: false,
  updateSettings: vi.fn<(data: { debugMode?: boolean }) => void>(),
}));

vi.mock('../store', () => ({
  useAppStoreShallow: (
    selector: (state: {
      connected: boolean;
      settings: { debugMode: boolean };
      updateSettings: (data: { debugMode?: boolean }) => void;
    }) => unknown,
  ) =>
    selector({
      connected: storeState.connected,
      settings: { debugMode: storeState.debugMode },
      updateSettings: storeState.updateSettings,
    }),
}));

describe('Monitoring unified page', () => {
  beforeEach(() => {
    storeState.connected = true;
    storeState.debugMode = false;
    storeState.updateSettings.mockClear();
    panelControl.shouldThrow = false;
  });

  it('renders connected status and cross-links', () => {
    render(<MonitoringUnified />);

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('monitoringUnified.title');
    expect(screen.getByText('common.connected')).toBeInTheDocument();
    expect(screen.getByText('monitoringUnified.systemHealthy')).toBeInTheDocument();
    expect(screen.getByTestId('page-cross-links')).toBeInTheDocument();
  });

  it('renders degraded status when disconnected', () => {
    storeState.connected = false;
    render(<MonitoringUnified />);

    expect(screen.getByText('common.disconnected')).toBeInTheDocument();
    expect(screen.getByText('monitoringUnified.systemDegraded')).toBeInTheDocument();
  });

  it('shows summary cards while power user mode is off', () => {
    render(<MonitoringUnified />);

    expect(screen.getByText('monitoringUnified.adaptersOnline')).toBeInTheDocument();
    expect(screen.getByText('5/5')).toBeInTheDocument();
    expect(screen.getByRole('checkbox')).not.toBeChecked();
    expect(screen.queryByTestId('monitoring-detail-panel')).not.toBeInTheDocument();
  });

  it('persists the power-user toggle to settings.debugMode (single source of truth)', async () => {
    const user = userEvent.setup();
    render(<MonitoringUnified />);

    await user.click(screen.getByRole('checkbox'));

    // The toggle no longer holds local state — it writes through to the store so
    // it stays in sync with the Advanced settings tab and survives navigation.
    expect(storeState.updateSettings).toHaveBeenCalledWith({ debugMode: true });
  });

  it('renders the detail panel when power user mode (debugMode) is on', async () => {
    storeState.debugMode = true;
    render(<MonitoringUnified />);

    expect(screen.getByRole('checkbox')).toBeChecked();
    expect(screen.queryByText('monitoringUnified.adaptersOnline')).not.toBeInTheDocument();
    // Lazy-loaded panel resolves after a microtask.
    expect(await screen.findByTestId('monitoring-detail-panel')).toBeInTheDocument();
  });

  it('shows the panel fallback and recovers via "back to summary" when the panel throws', async () => {
    // Guards the crash-fix wiring: if the ErrorBoundary or fallback is removed,
    // a throwing panel would tear down the whole route instead of degrading.
    panelControl.shouldThrow = true;
    storeState.debugMode = true;
    const user = userEvent.setup();
    render(<MonitoringUnified />);

    // ErrorBoundary catches the throw and renders the panel-sized fallback.
    const fallback = await screen.findByRole('alert');
    expect(fallback).toBeInTheDocument();
    expect(screen.getByText('monitoringUnified.panelErrorTitle')).toBeInTheDocument();
    expect(screen.queryByTestId('monitoring-detail-panel')).not.toBeInTheDocument();

    // "Back to summary" turns power-user mode off via the store (single source of truth).
    await user.click(screen.getByText('monitoringUnified.panelErrorSummary'));
    expect(storeState.updateSettings).toHaveBeenCalledWith({ debugMode: false });
  });
});
