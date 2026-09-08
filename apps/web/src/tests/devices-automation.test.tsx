import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import DevicesAutomation from '../pages/DevicesAutomation';

const mockData = {
  pvPower: 4500,
  houseLoad: 2800,
  gridPower: -1200,
  batteryPower: -800,
  batterySoC: 68,
  heatPumpPower: 600,
  evPower: 0,
  pvYieldToday: 12.5,
  priceCurrent: 0.22,
  batteryVoltage: 52.4,
  gridVoltage: 230,
};

const mockSettings = {
  systemConfig: {
    pv: { peakPowerKWp: 10, orientation: 'S', strings: 2, mpptCount: 2 },
    evCharger: { maxPowerKW: 11, model: 'Wallbox' },
    battery: { maxChargeRateKW: 5 },
  },
};

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('../core/EnergyContext', () => ({
  useEnergyContext: () => ({ data: mockData, unified: { knx: { rooms: [] } } }),
}));
vi.mock('../core/useLegacySendCommand', () => ({
  useLegacySendCommand: () => ({ sendCommand: vi.fn(), ConfirmationDialog: () => null }),
}));
vi.mock('../store', () => ({
  useAppStoreShallow: (selector: (s: { settings: typeof mockSettings }) => unknown) =>
    selector({ settings: mockSettings }),
}));

describe('DevicesAutomation', () => {
  it('renders a card per device with the filter bar', () => {
    render(<DevicesAutomation />);
    expect(screen.getByRole('radiogroup', { name: 'devicesAuto.filterLabel' })).toBeInTheDocument();
    expect(screen.getByText('devicesAuto.pvTitle')).toBeInTheDocument();
    expect(screen.getByText('devicesAuto.storageTitle')).toBeInTheDocument();
    expect(screen.getByText('devicesAuto.buildingTitle')).toBeInTheDocument();
  });

  it('filters devices by category', async () => {
    const user = userEvent.setup();
    render(<DevicesAutomation />);
    const pvFilter = screen.getByRole('radio', { name: 'devicesAuto.filterPV' });
    await user.click(pvFilter);
    // The filter state flips deterministically (card removal is animated, so we
    // assert the selection rather than racing the AnimatePresence exit).
    expect(pvFilter).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByText('devicesAuto.pvTitle')).toBeInTheDocument();
  });

  it('filters devices by search', async () => {
    const user = userEvent.setup();
    render(<DevicesAutomation />);
    await user.type(screen.getByRole('searchbox'), 'devicesAuto.evTitle');
    expect(screen.getByText('devicesAuto.evTitle')).toBeInTheDocument();
    // Non-matching cards animate out; poll until removed.
    await waitFor(() => expect(screen.queryByText('devicesAuto.pvTitle')).not.toBeInTheDocument());
  });

  it('shows the empty state and resets filters when nothing matches', async () => {
    const user = userEvent.setup();
    render(<DevicesAutomation />);
    await user.type(screen.getByRole('searchbox'), 'no-such-device-xyz');
    expect(await screen.findByText('devicesAuto.noResults')).toBeInTheDocument();
    // Reset via the empty-state action clears the search.
    await user.click(screen.getByRole('button', { name: 'devicesAuto.filterAll' }));
    await waitFor(() => expect(screen.getByText('devicesAuto.pvTitle')).toBeInTheDocument());
  });

  it('switches to the floorplan view', async () => {
    const user = userEvent.setup();
    render(<DevicesAutomation />);
    await user.click(screen.getByRole('tab', { name: 'devicesAuto.viewFloorplan' }));
    expect(screen.getByRole('tab', { name: 'devicesAuto.viewFloorplan' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });
});
