/**
 * Shared mock energy-layer mutations for WS and HTTP command replay paths.
 */

import { mockData } from './mock-data.js';

/** Apply a validated control command to the in-memory mock energy layer. */
export function applyMockCommandMutation(cmd: { type: string; value?: number }): void {
  if (cmd.type === 'SET_EV_POWER') {
    mockData.evPower = cmd.value ?? mockData.evPower;
  } else if (cmd.type === 'SET_HEAT_PUMP_POWER') {
    mockData.heatPumpPower = cmd.value ?? mockData.heatPumpPower;
  } else if (cmd.type === 'SET_BATTERY_POWER') {
    mockData.batteryPower = cmd.value ?? mockData.batteryPower;
  }
}

/** Map offline queue action types to protocol WS command types. */
export const OFFLINE_ACTION_WS_TYPE: Record<string, string> = {
  'ev-control': 'SET_EV_POWER',
  'hp-control': 'SET_HEAT_PUMP_POWER',
  'battery-control': 'SET_BATTERY_POWER',
};

const DEFAULT_HEAT_PUMP_W = 800;

/** Normalize heterogeneous offline payloads to a watt setpoint when possible. */
export function extractOfflineCommandWatts(payload: Record<string, unknown>): number | undefined {
  if (typeof payload.powerW === 'number' && Number.isFinite(payload.powerW)) {
    return payload.powerW;
  }
  if (typeof payload.value === 'number' && Number.isFinite(payload.value)) {
    return payload.value;
  }
  if (typeof payload.currentA === 'number' && Number.isFinite(payload.currentA)) {
    return Math.round(payload.currentA * 230);
  }
  if (payload.mode === 'heat' || payload.mode === 'cool') {
    return DEFAULT_HEAT_PUMP_W;
  }
  return undefined;
}
