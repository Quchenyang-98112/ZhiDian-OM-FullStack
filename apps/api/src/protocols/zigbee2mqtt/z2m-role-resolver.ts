/**
 * @module z2m-role-resolver
 * Map Zigbee2MQTT devices to backend energy roles and metric types.
 */

import type { EnergyRole } from '@nexus-hems/shared-types';

/** Static device mapping loaded from z2m-device-map.json. */
export interface Z2mDeviceMapping {
  friendlyName: string;
  role: EnergyRole;
  /** Optional numeric scale factor (default 1). */
  scale?: number;
}

export interface Z2mBridgeDevice {
  friendly_name: string;
  type: 'Coordinator' | 'Router' | 'EndDevice';
  definition?: {
    model?: string;
    description?: string;
    exposes?: {
      type: string;
      name?: string;
      features?: { name?: string }[];
    }[];
  };
}

export interface Z2mRoleResolution {
  role: EnergyRole;
  scale: number;
}

const DEFAULT_HEAT_PUMP_HINTS = ['heat_pump', 'heatpump', 'wp_', 'boiler', 'waermepumpe'];
const DEFAULT_EV_HINTS = ['wallbox', 'ev_charger', 'evse', 'ladepunkt', 'charging'];

/**
 * Whether a bridge device exposes energy-related clusters.
 */
export function hasZ2mEnergyExpose(device: Z2mBridgeDevice): boolean {
  return Boolean(
    device.definition?.exposes?.some(
      (expose) =>
        expose.name === 'power' ||
        expose.name === 'energy' ||
        expose.name === 'voltage' ||
        expose.name === 'current' ||
        expose.features?.some((feature) => feature.name === 'power' || feature.name === 'energy'),
    ),
  );
}

/**
 * Classify a Zigbee device as grid/load/heatpump/ev based on name, model, and exposes.
 */
export function classifyZ2mDevice(
  device: Z2mBridgeDevice,
  heatPumpHints: string[] = DEFAULT_HEAT_PUMP_HINTS,
  evHints: string[] = DEFAULT_EV_HINTS,
): EnergyRole {
  const nameLower = device.friendly_name.toLowerCase();
  const model = device.definition?.model?.toLowerCase() ?? '';
  const desc = device.definition?.description?.toLowerCase() ?? '';

  if (heatPumpHints.some((hint) => nameLower.includes(hint) || model.includes(hint))) {
    return 'heatpump';
  }
  if (evHints.some((hint) => nameLower.includes(hint) || model.includes(hint))) {
    return 'ev';
  }

  const hasOnOff = device.definition?.exposes?.some(
    (expose) => expose.name === 'state' || expose.type === 'switch',
  );
  const hasMeter = device.definition?.exposes?.some(
    (expose) => expose.name === 'energy' || expose.name === 'power',
  );
  if (
    hasMeter &&
    !hasOnOff &&
    (nameLower.includes('meter') || nameLower.includes('grid') || desc.includes('energy meter'))
  ) {
    return 'grid';
  }

  return 'load';
}

/**
 * Resolve device role using static map first, then heuristics.
 */
export function resolveZ2mDeviceRole(
  friendlyName: string,
  device: Z2mBridgeDevice | undefined,
  staticMap: Map<string, Z2mDeviceMapping>,
  heatPumpHints?: string[],
  evHints?: string[],
): Z2mRoleResolution | null {
  const mapped = staticMap.get(friendlyName);
  if (mapped) {
    return { role: mapped.role, scale: mapped.scale ?? 1 };
  }
  if (!device) return null;
  return {
    role: classifyZ2mDevice(device, heatPumpHints, evHints),
    scale: 1,
  };
}
