import type { EnergyData } from '@nexus-hems/shared-types';
import { isMockAdapterMode } from '../config/adapter-mode.js';

/**
 * Mock data for the HEMS dashboard demo.
 * In production, replace with AdapterBridge for real adapter data.
 *
 * Mock simulation runs whenever effective adapter mode is mock (the default).
 * Live hardware requires ADAPTER_MODE=live and ALLOW_LIVE_HARDWARE=true.
 */

export const mockData: EnergyData = {
  gridPower: 0,
  pvPower: 2500,
  batteryPower: -500,
  houseLoad: 2000,
  batterySoC: 65,
  heatPumpPower: 800,
  evPower: 0,
  gridVoltage: 230,
  batteryVoltage: 51.2,
  pvYieldToday: 12.5,
  priceCurrent: 0.15,
};

/**
 * Update mock data with random noise (called on interval).
 */
export function updateMockData(): void {
  if (!isMockAdapterMode()) return;

  mockData.pvPower = Math.max(0, mockData.pvPower + (Math.random() * 200 - 100));
  mockData.houseLoad = Math.max(300, mockData.houseLoad + (Math.random() * 100 - 50));

  // Simple energy balance: Grid = House + Battery + EV + HeatPump - PV
  mockData.gridPower =
    mockData.houseLoad +
    mockData.batteryPower +
    mockData.evPower +
    mockData.heatPumpPower -
    mockData.pvPower;
}

/**
 * Returns whether the server is running in mock mode.
 */
export function isMockMode(): boolean {
  return isMockAdapterMode();
}
