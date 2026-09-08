import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import DevicesAutomation from '../pages/DevicesAutomation';

const mockData = {
  pvPower: 4500,
  houseLoad: 2800,
  gridPower: -1200,
  batteryPower: -800,
  batterySoC: 68,
  heatPumpPower: 600,
  evPower: 100,
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

// Populated KNX rooms so the building card / detail exercise the room-map branches.
const mockUnified = {
  knx: {
    rooms: [
      { name: 'Living', lightsOn: true, temperature: 21.5 },
      { name: 'Kitchen', lightsOn: false, temperature: 19.8 },
    ],
  },
};

const sendCommand = vi.fn();

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('../core/EnergyContext', () => ({
  useEnergyContext: () => ({ data: mockData, unified: mockUnified }),
}));
vi.mock('../core/useLegacySendCommand', () => ({
  useLegacySendCommand: () => ({ sendCommand, ConfirmationDialog: () => null }),
}));
vi.mock('../store', () => ({
  useAppStoreShallow: (selector: (s: { settings: typeof mockSettings }) => unknown) =>
    selector({ settings: mockSettings }),
}));

/** Open a device's detail dialog through the real card → grid → dialog path. */
async function openDetail(user: ReturnType<typeof userEvent.setup>, cardTitle: string) {
  // The card's details (with the "full details" button) are collapsed by
  // default — expand the header first, then open the dialog.
  const header = screen.getByText(cardTitle).closest('[role="button"]') as HTMLElement;
  await user.click(header);
  const card = header.closest('.energy-card') as HTMLElement;
  const trigger = await within(card).findByRole('button', {
    name: 'devicesAuto.fullDetails',
  });
  await user.click(trigger);
  return screen.findByRole('dialog');
}

describe('DevicesAutomation integration — detail dialogs and views', () => {
  beforeEach(() => {
    sendCommand.mockClear();
  });

  it('opens the PV detail dialog with utilization from live data', async () => {
    const user = userEvent.setup();
    render(<DevicesAutomation />);
    const dialog = await openDetail(user, 'devicesAuto.pvTitle');
    // PVDetail renders peak power + a utilization row derived from live pvPower.
    expect(within(dialog).getByText('devicesAuto.utilization')).toBeInTheDocument();
    expect(within(dialog).getByText('devicesAuto.peakPower')).toBeInTheDocument();
  });

  it('opens the storage detail dialog and dispatches a battery command', async () => {
    const user = userEvent.setup();
    render(<DevicesAutomation />);
    const dialog = await openDetail(user, 'devicesAuto.storageTitle');
    await user.click(within(dialog).getByRole('button', { name: 'control.forceCharge' }));
    expect(sendCommand).toHaveBeenCalledWith('SET_BATTERY_POWER', 3000);
  });

  it('opens the building detail dialog and toggles a room light', async () => {
    const user = userEvent.setup();
    render(<DevicesAutomation />);
    const dialog = await openDetail(user, 'devicesAuto.buildingTitle');
    // Living room lights are on → toggling sends 0 (off).
    await user.click(within(dialog).getByRole('button', { name: 'floorplan.lights Living' }));
    expect(sendCommand).toHaveBeenCalledWith('TOGGLE_KNX_LIGHTS', 0);
  });

  it('opens the EV detail dialog', async () => {
    const user = userEvent.setup();
    render(<DevicesAutomation />);
    const ev = await openDetail(user, 'devicesAuto.evTitle');
    expect(within(ev).getByText('control.evTitle')).toBeInTheDocument();
  });

  it('opens the heat-pump detail dialog', async () => {
    const user = userEvent.setup();
    render(<DevicesAutomation />);
    const hp = await openDetail(user, 'devicesAuto.heatpumpTitle');
    expect(within(hp).getByText('control.hpTitle')).toBeInTheDocument();
  });

  it('switches to the floorplan view and shows the lazy loader region', async () => {
    const user = userEvent.setup();
    render(<DevicesAutomation />);
    await user.click(screen.getByRole('tab', { name: 'devicesAuto.viewFloorplan' }));
    await waitFor(() =>
      expect(screen.getByRole('tab', { name: 'devicesAuto.viewFloorplan' })).toHaveAttribute(
        'aria-selected',
        'true',
      ),
    );
  });
});
