import { describe, expect, it } from 'vitest';
import { getDeviceStatus } from '../components/devices-automation/utils';
import type { UnifiedEnergyModel } from '../core/adapters/EnergyAdapter';
import type { EnergyData } from '../types';

function data(over: Partial<EnergyData> = {}): EnergyData {
  return {
    pvPower: 0,
    gridPower: 0,
    batteryPower: 0,
    batterySoC: 0,
    houseLoad: 0,
    evPower: 0,
    heatPumpPower: 0,
    gridVoltage: 0,
    batteryVoltage: 0,
    pvYieldToday: 0,
    priceCurrent: 0,
    ...over,
  } as unknown as EnergyData;
}

function unified(
  rooms: { name: string; lightsOn: boolean; temperature: number }[] = [],
): UnifiedEnergyModel {
  return { knx: { rooms } } as unknown as UnifiedEnergyModel;
}

describe('getDeviceStatus', () => {
  it('pv: producing above 50 W, else idle', () => {
    expect(getDeviceStatus('pv', data({ pvPower: 100 }), unified()).label).toBe(
      'devicesAuto.statusProducing',
    );
    expect(getDeviceStatus('pv', data({ pvPower: 50 }), unified()).label).toBe(
      'devicesAuto.statusIdle',
    );
  });

  it('storage: charging / discharging / standby', () => {
    expect(getDeviceStatus('storage', data({ batteryPower: 100 }), unified()).label).toBe(
      'devicesAuto.statusCharging',
    );
    expect(getDeviceStatus('storage', data({ batteryPower: -100 }), unified()).label).toBe(
      'devicesAuto.statusDischarging',
    );
    expect(getDeviceStatus('storage', data({ batteryPower: 0 }), unified()).label).toBe(
      'devicesAuto.statusStandby',
    );
  });

  it('ev: charging above 50 W, else ready', () => {
    expect(getDeviceStatus('ev', data({ evPower: 100 }), unified()).label).toBe(
      'devicesAuto.statusCharging',
    );
    expect(getDeviceStatus('ev', data({ evPower: 0 }), unified()).label).toBe(
      'devicesAuto.statusReady',
    );
  });

  it('heatpump: running above 50 W, else idle', () => {
    expect(getDeviceStatus('heatpump', data({ heatPumpPower: 100 }), unified()).label).toBe(
      'devicesAuto.statusRunning',
    );
    expect(getDeviceStatus('heatpump', data({ heatPumpPower: 0 }), unified()).label).toBe(
      'devicesAuto.statusIdle',
    );
  });

  it('building: active when any lights on, else idle', () => {
    expect(
      getDeviceStatus('building', data(), unified([{ name: 'a', lightsOn: true, temperature: 20 }]))
        .label,
    ).toBe('devicesAuto.statusActive');
    expect(getDeviceStatus('building', data(), unified([])).label).toBe('devicesAuto.statusIdle');
  });

  it('unknown device → idle', () => {
    expect(getDeviceStatus('mystery', data(), unified()).label).toBe('devicesAuto.statusIdle');
  });
});
