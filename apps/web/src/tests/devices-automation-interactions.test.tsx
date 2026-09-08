import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { DeviceInlineDetails } from '../components/devices-automation/cards/DeviceInlineDetails';
import { BuildingDetail } from '../components/devices-automation/detail/BuildingDetail';
import { EVDetail } from '../components/devices-automation/detail/EVDetail';
import { HeatPumpDetail } from '../components/devices-automation/detail/HeatPumpDetail';
import { StorageDetail } from '../components/devices-automation/detail/StorageDetail';
import type { UnifiedEnergyModel } from '../core/adapters/EnergyAdapter';
import type { EnergyData, StoredSettings } from '../types';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

const data = {
  pvPower: 4500,
  houseLoad: 2800,
  batteryPower: -800,
  batterySoC: 68,
  batteryVoltage: 52.4,
  heatPumpPower: 600,
  evPower: 100,
} as unknown as EnergyData;

const settings = {
  systemConfig: {
    pv: { peakPowerKWp: 10 },
    evCharger: { maxPowerKW: 11, model: 'Wallbox' },
  },
} as unknown as StoredSettings;

describe('devices-automation detail interactions', () => {
  it('StorageDetail force-charge and auto buttons dispatch battery commands', async () => {
    const user = userEvent.setup();
    const sendCommand = vi.fn();
    render(<StorageDetail data={data} sendCommand={sendCommand} />);

    await user.click(screen.getByRole('button', { name: 'control.forceCharge' }));
    expect(sendCommand).toHaveBeenCalledWith('SET_BATTERY_POWER', 3000);

    await user.click(screen.getByRole('button', { name: 'control.auto' }));
    expect(sendCommand).toHaveBeenCalledWith('SET_BATTERY_POWER', 0);
  });

  it('BuildingDetail toggles lights for both on and off rooms', async () => {
    const user = userEvent.setup();
    const sendCommand = vi.fn();
    const unified = {
      knx: {
        rooms: [
          { name: 'Living', lightsOn: true, temperature: 21.5 },
          { name: 'Hall', lightsOn: false, temperature: 19 },
        ],
      },
    } as unknown as UnifiedEnergyModel;
    render(<BuildingDetail unified={unified} sendCommand={sendCommand} />);

    await user.click(screen.getByRole('button', { name: 'floorplan.lights Living' }));
    expect(sendCommand).toHaveBeenCalledWith('TOGGLE_KNX_LIGHTS', 0);

    await user.click(screen.getByRole('button', { name: 'floorplan.lights Hall' }));
    expect(sendCommand).toHaveBeenCalledWith('TOGGLE_KNX_LIGHTS', 1);
  });

  it('EVDetail lets the user select a mode and submits the resolved power', async () => {
    const user = userEvent.setup();
    const sendCommand = vi.fn();
    render(<EVDetail data={data} settings={settings} sendCommand={sendCommand} />);

    // Select PV-surplus mode (selectable now that the radios track local state).
    await user.click(screen.getByRole('radio', { name: 'control.evPv' }));
    await user.click(screen.getByRole('button', { name: 'common.apply' }));
    // power = max(0, pvPower - houseLoad) = max(0, 4500 - 2800) = 1700
    await waitFor(() => expect(sendCommand).toHaveBeenCalledWith('SET_EV_POWER', 1700), {
      timeout: 3000,
    });
  });

  it('EVDetail fast mode submits full charger power', async () => {
    const user = userEvent.setup();
    const sendCommand = vi.fn();
    render(<EVDetail data={data} settings={settings} sendCommand={sendCommand} />);

    await user.click(screen.getByRole('radio', { name: 'control.evFast' }));
    await user.click(screen.getByRole('button', { name: 'common.apply' }));
    // power = maxPowerKW * 1000 = 11 * 1000 = 11000
    await waitFor(() => expect(sendCommand).toHaveBeenCalledWith('SET_EV_POWER', 11000), {
      timeout: 3000,
    });
  });

  it('EVDetail off mode (default) submits zero power', async () => {
    const user = userEvent.setup();
    const sendCommand = vi.fn();
    render(<EVDetail data={data} settings={settings} sendCommand={sendCommand} />);

    // No mode change → the default 'off' branch → power = 0.
    await user.click(screen.getByRole('button', { name: 'common.apply' }));
    await waitFor(() => expect(sendCommand).toHaveBeenCalledWith('SET_EV_POWER', 0), {
      timeout: 3000,
    });
  });

  it('DeviceInlineDetails full-details button invokes onOpenDetail exactly once', async () => {
    const user = userEvent.setup();
    const onOpenDetail = vi.fn();
    const unified = { knx: { rooms: [] } } as unknown as UnifiedEnergyModel;
    render(
      <DeviceInlineDetails
        deviceId="pv"
        data={data}
        unified={unified}
        settings={settings}
        onOpenDetail={onOpenDetail}
      />,
    );

    // Clicking runs the handler (including its e.stopPropagation()) and opens
    // the detail dialog exactly once — the card-expand toggle is not re-fired.
    await user.click(screen.getByRole('button', { name: 'devicesAuto.fullDetails' }));
    expect(onOpenDetail).toHaveBeenCalledTimes(1);
  });

  it('HeatPumpDetail submits the default SG-Ready mode as SET_HEAT_PUMP_MODE', async () => {
    const user = userEvent.setup();
    const sendCommand = vi.fn();
    render(<HeatPumpDetail data={data} sendCommand={sendCommand} />);

    // Default SG-Ready mode is '2' → SET_HEAT_PUMP_MODE with integer mode 2.
    await user.click(screen.getByRole('button', { name: 'common.apply' }));
    await waitFor(() => expect(sendCommand).toHaveBeenCalledWith('SET_HEAT_PUMP_MODE', 2), {
      timeout: 3000,
    });
  });
});
