/**
 * Realistic demo/mock energy data for showcase mode.
 * Used when no live connection is established (connected === false).
 * Values represent a typical sunny afternoon scenario for a 15 kWp system.
 */
import type { EnergyData } from '../types';

export const DEMO_ENERGY_DATA: EnergyData = {
  pvPower: 7850, // 7.85 kW — sunny afternoon, not peak
  gridPower: -1420, // negative = exporting 1.42 kW to grid
  batteryPower: -2100, // negative = charging at 2.1 kW
  houseLoad: 3180, // 3.18 kW house consumption
  batterySoC: 72, // 72% state of charge
  heatPumpPower: 850, // 0.85 kW heat pump running
  evPower: 3700, // 3.7 kW EV charging (single phase)
  gridVoltage: 232.4,
  batteryVoltage: 52.1,
  pvYieldToday: 32.6, // 32.6 kWh produced today
  priceCurrent: 0.128, // 12.8 ct/kWh — low tariff window
};

/**
 * Returns demo data or the real store data depending on connection status.
 */
export function getDisplayData(storeData: EnergyData, connected: boolean): EnergyData {
  if (connected) return storeData;

  // Check if store has any real data (non-default)
  const hasRealData =
    storeData.pvPower !== 0 ||
    storeData.gridPower !== 0 ||
    storeData.batteryPower !== 0 ||
    storeData.houseLoad !== 0;

  return hasRealData ? storeData : DEMO_ENERGY_DATA;
}
