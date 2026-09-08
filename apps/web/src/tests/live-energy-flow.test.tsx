import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import LiveEnergyFlow from '../pages/LiveEnergyFlow';

const mockEnergyData = {
  pvPower: 4500,
  houseLoad: 2800,
  gridPower: -1200,
  batteryPower: -800,
  batterySoC: 68,
  heatPumpPower: 600,
  evPower: 0,
  pvYieldToday: 12.5,
  priceCurrent: 0.22,
};

// Controllable viewport so we can exercise both the desktop (floating) and the
// mobile (bottom-sheet) layouts.
const viewport = vi.hoisted(() => ({ compact: false }));
vi.mock('../components/live-energy-flow/hooks/useIsCompactViewport', () => ({
  useIsCompactViewport: () => viewport.compact,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}));

vi.mock('../core/EnergyContext', () => ({
  useEnergyContext: () => ({
    data: mockEnergyData,
    connected: true,
    selfSufficiencyPercent: 75,
    isExporting: false,
    unified: { knx: { rooms: [] } },
  }),
}));

vi.mock('../core/useLegacySendCommand', () => ({
  useLegacySendCommand: () => ({ sendCommand: vi.fn(), ConfirmationDialog: () => null }),
}));

vi.mock('../components/SankeyDiagram', () => ({
  SankeyDiagram: () => <div data-testid="sankey" />,
}));

vi.mock('../store', () => {
  const mockState = {
    adapterMode: 'mock' as const,
    settings: {
      systemConfig: { evCharger: { maxPowerKW: 11 }, battery: { maxChargeRateKW: 5 } },
    },
  };
  return {
    useAppStore: (selector: (state: typeof mockState) => unknown) => selector(mockState),
    useAppStoreShallow: (selector: (state: typeof mockState) => unknown) => selector(mockState),
  };
});

describe('LiveEnergyFlow', () => {
  beforeEach(() => {
    viewport.compact = false;
  });

  it('renders the Sankey canvas and device toggle bar', () => {
    render(<LiveEnergyFlow />);
    expect(screen.getByTestId('sankey')).toBeInTheDocument();
    expect(screen.getByRole('toolbar', { name: 'liveEnergy.devicePanels' })).toBeInTheDocument();
  });

  it('opens and closes a device panel via its toggle (desktop)', async () => {
    const user = userEvent.setup();
    render(<LiveEnergyFlow />);

    const toolbar = screen.getByRole('toolbar', { name: 'liveEnergy.devicePanels' });
    const evToggle = within(toolbar).getAllByRole('button')[0] as HTMLElement;

    expect(evToggle).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByText('liveEnergy.currentPower')).not.toBeInTheDocument();

    await user.click(evToggle);
    expect(evToggle).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('liveEnergy.currentPower')).toBeInTheDocument();

    // Toggling off flips the pressed state back (panel closes).
    await user.click(evToggle);
    expect(evToggle).toHaveAttribute('aria-pressed', 'false');
  });

  it('shows open panels in an accessible bottom sheet on compact viewports', async () => {
    viewport.compact = true;
    const user = userEvent.setup();
    render(<LiveEnergyFlow />);

    const toolbar = screen.getByRole('toolbar', { name: 'liveEnergy.devicePanels' });
    // Open the heat-pump panel — one of the panels that was positioned off-screen
    // on mobile before this fix (fixed y-offset). It is the 2nd toggle.
    await user.click(within(toolbar).getAllByRole('button')[1] as HTMLElement);

    // It renders inside the bottom-sheet dialog, so it is reachable on mobile.
    const sheet = screen.getByRole('dialog', { name: 'liveEnergy.devicePanels' });
    expect(within(sheet).getByText('control.hpTitle')).toBeInTheDocument();
    expect(within(sheet).getByText('liveEnergy.currentPower')).toBeInTheDocument();
  });

  it('opens right-anchored panels (KNX, stats) on desktop', async () => {
    const user = userEvent.setup();
    render(<LiveEnergyFlow />);
    const toolbar = screen.getByRole('toolbar', { name: 'liveEnergy.devicePanels' });
    const buttons = within(toolbar).getAllByRole('button');

    // KNX (4th) and stats (5th) are right-anchored floating panels.
    await user.click(buttons[3] as HTMLElement);
    await user.click(buttons[4] as HTMLElement);

    expect(screen.getByText('liveEnergy.noKnxRooms')).toBeInTheDocument();
    expect(screen.getByText('liveEnergy.overview')).toBeInTheDocument();
  });
});
