import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DeviceToggleBar } from '../components/live-energy-flow/layout/DeviceToggleBar';
import { LiveEnergyTopBar } from '../components/live-energy-flow/layout/LiveEnergyTopBar';
import { BatteryPanel } from '../components/live-energy-flow/panels/BatteryPanel';
import { KNXPanel } from '../components/live-energy-flow/panels/KNXPanel';
import { StatsPanel } from '../components/live-energy-flow/panels/StatsPanel';
import { GaugeBar } from '../components/live-energy-flow/shared/GaugeBar';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}));

vi.mock('../store', () => ({
  useAppStore: (
    selector: (state: {
      settings: {
        systemConfig: { evCharger: { maxPowerKW: number }; battery: { maxChargeRateKW: number } };
      };
    }) => unknown,
  ) =>
    selector({
      settings: {
        systemConfig: { evCharger: { maxPowerKW: 11 }, battery: { maxChargeRateKW: 5 } },
      },
    }),
}));

const knx = vi.hoisted(() => ({
  rooms: [] as { name?: string; temperature?: number }[],
}));
vi.mock('../core/EnergyContext', () => ({
  useEnergyContext: () => ({ unified: { knx: { rooms: knx.rooms } } }),
}));

const send = vi.fn();

function statsData(gridPower: number, batteryPower: number) {
  return {
    pvPower: 4000,
    houseLoad: 2000,
    batteryPower,
    batterySoC: 60,
    gridPower,
    heatPumpPower: 500,
    evPower: 0,
    pvYieldToday: 10,
    priceCurrent: 0.2,
  };
}

describe('live-energy-flow panels — branch coverage', () => {
  it('GaugeBar clamps out-of-range values', () => {
    const { rerender } = render(<GaugeBar label="a" value={150} color="#fff" />);
    expect(screen.getByText('100%')).toBeInTheDocument();
    rerender(<GaugeBar label="a" value={-10} color="#fff" />);
    expect(screen.getByText('0%')).toBeInTheDocument();
  });

  it('BatteryPanel reflects charging, discharging and idle states', () => {
    const { rerender } = render(
      <BatteryPanel sendCommand={send} data={{ batteryPower: -500, batterySoC: 50 }} />,
    );
    expect(screen.getByText('metrics.batteryCharging')).toBeInTheDocument();
    rerender(<BatteryPanel sendCommand={send} data={{ batteryPower: 500, batterySoC: 50 }} />);
    expect(screen.getByText('metrics.batteryDischarging')).toBeInTheDocument();
    rerender(<BatteryPanel sendCommand={send} data={{ batteryPower: 0, batterySoC: 50 }} />);
    expect(screen.getByText('metrics.batteryIdle')).toBeInTheDocument();
  });

  it('StatsPanel covers grid import/export/neutral and battery sub-states', () => {
    const base = {
      selfSufficiency: 70,
      selfConsumptionRate: 60,
      gridImport: 100,
      gridExport: 0,
      locale: 'en',
    };
    // grid import + battery charging
    const { rerender } = render(
      <StatsPanel
        {...base}
        energyData={statsData(500, -500)}
        batteryCharging
        isExporting={false}
      />,
    );
    expect(screen.getAllByText('metrics.import').length).toBeGreaterThan(0);
    // grid export + battery discharging
    rerender(
      <StatsPanel
        {...base}
        energyData={statsData(-500, 500)}
        batteryCharging={false}
        isExporting
      />,
    );
    expect(screen.getAllByText('metrics.export').length).toBeGreaterThan(0);
    // grid neutral-export off + battery idle
    rerender(
      <StatsPanel
        {...base}
        energyData={statsData(-500, 0)}
        batteryCharging={false}
        isExporting={false}
      />,
    );
    expect(screen.getByText('metrics.batteryIdle')).toBeInTheDocument();
  });

  it('KNXPanel renders empty, with-temperature and without-temperature rooms', () => {
    knx.rooms = [];
    const { rerender } = render(<KNXPanel sendCommand={send} />);
    expect(screen.getByText('liveEnergy.noKnxRooms')).toBeInTheDocument();

    knx.rooms = [{ name: 'Living', temperature: 21.5 }];
    rerender(<KNXPanel sendCommand={send} />);
    expect(screen.getByText('liveEnergy.temperature')).toBeInTheDocument();

    knx.rooms = [{ name: 'Hall' }];
    rerender(<KNXPanel sendCommand={send} />);
    expect(screen.getByText('Hall')).toBeInTheDocument();
  });

  it('LiveEnergyTopBar reflects connected, simulation, and disconnected states', () => {
    const energy = { pvPower: 1000, houseLoad: 800, gridPower: 200, priceCurrent: 0.25 };
    const { rerender } = render(
      <LiveEnergyTopBar
        connectionPresentation="connected"
        isFullscreen={false}
        onToggleFullscreen={vi.fn()}
        energyData={energy}
        locale="en"
      />,
    );
    expect(screen.getByText('common.live')).toBeInTheDocument();

    rerender(
      <LiveEnergyTopBar
        connectionPresentation="simulation"
        isFullscreen
        onToggleFullscreen={vi.fn()}
        energyData={{ ...energy, gridPower: -200 }}
        locale="en"
      />,
    );
    expect(screen.getByText('mode.simulationBadge')).toBeInTheDocument();

    rerender(
      <LiveEnergyTopBar
        connectionPresentation="disconnected"
        isFullscreen={false}
        onToggleFullscreen={vi.fn()}
        energyData={energy}
        locale="en"
      />,
    );
    expect(screen.getByText('common.disconnected')).toBeInTheDocument();
  });

  it('DeviceToggleBar marks open panels as pressed', () => {
    render(
      <DeviceToggleBar
        openPanels={new Set(['ev'])}
        onToggle={vi.fn()}
        energyData={{ evPower: 0, heatPumpPower: 0, batteryPower: 0, batterySoC: 50 }}
        locale="en"
        selfSufficiency={75}
      />,
    );
    const pressed = screen
      .getAllByRole('button')
      .filter((b) => b.getAttribute('aria-pressed') === 'true');
    expect(pressed.length).toBe(1);
  });
});
