import { describe, expect, it } from 'vitest';
import {
  classifyZ2mDevice,
  hasZ2mEnergyExpose,
  resolveZ2mDeviceRole,
  type Z2mBridgeDevice,
  type Z2mDeviceMapping,
} from './z2m-role-resolver.js';

describe('z2m-role-resolver', () => {
  const staticMap = new Map<string, Z2mDeviceMapping>([
    { friendlyName: 'custom_meter', role: 'grid' },
  ]);

  const heatPumpDevice: Z2mBridgeDevice = {
    friendly_name: 'heat_pump_plug',
    type: 'EndDevice',
    definition: {
      model: 'TS011F',
      exposes: [
        { type: 'switch', name: 'state' },
        { type: 'numeric', name: 'power' },
      ],
    },
  };

  const gridMeter: Z2mBridgeDevice = {
    friendly_name: 'grid_meter',
    type: 'EndDevice',
    definition: {
      description: 'Energy meter',
      exposes: [
        { type: 'numeric', name: 'power' },
        { type: 'numeric', name: 'energy' },
      ],
    },
  };

  it('detects energy exposes on bridge devices', () => {
    expect(hasZ2mEnergyExpose(gridMeter)).toBe(true);
    expect(hasZ2mEnergyExpose({ friendly_name: 'light', type: 'EndDevice' })).toBe(false);
  });

  it('prefers static map entries', () => {
    const result = resolveZ2mDeviceRole('custom_meter', gridMeter, staticMap);
    expect(result).toEqual({ role: 'grid', scale: 1 });
  });

  it('classifies heat pump plugs', () => {
    expect(classifyZ2mDevice(heatPumpDevice)).toBe('heatpump');
  });

  it('classifies pure meters as grid', () => {
    expect(classifyZ2mDevice(gridMeter)).toBe('grid');
  });

  it('classifies house_import style names as load when no meter pattern', () => {
    const device: Z2mBridgeDevice = {
      friendly_name: 'house_import_plug',
      type: 'EndDevice',
      definition: {
        exposes: [
          { type: 'switch', name: 'state' },
          { type: 'numeric', name: 'power' },
        ],
      },
    };
    expect(classifyZ2mDevice(device)).toBe('load');
  });
});
