import type { EnergyData } from '@nexus-hems/shared-types';
import type { EnergyData as LocalEnergyData } from '../types';
import type { EnergySnapshot } from './db';
import type { ForecastResult } from './ml-forecast';
import { runForecast } from './ml-forecast';

export const buildDemoForecastSnapshots = (
  energyData: EnergyData,
  now = Date.now(),
): EnergySnapshot[] =>
  Array.from({ length: 72 }, (_, i) => {
    const hour = new Date(now - (72 - i) * 3_600_000).getHours();
    const sunFactor = hour >= 6 && hour <= 20 ? Math.sin(((hour - 6) / 14) * Math.PI) : 0;
    return {
      timestamp: now - (72 - i) * 3_600_000,
      gridPower: 500 + Math.sin(i / 4) * 300 + Math.sin(i * 0.7) * 100,
      pvPower: Math.round(energyData.pvPower * sunFactor * (0.5 + Math.sin(i * 0.3) * 0.3)),
      batteryPower: Math.sin(i / 6) * 1500,
      houseLoad: 800 + Math.sin(i / 3) * 400 + (hour >= 17 && hour <= 21 ? 600 : 0),
      batterySoC: 40 + Math.sin(i / 12) * 30,
      heatPumpPower: hour >= 6 && hour <= 22 ? 800 + Math.sin(i / 5) * 400 : 200,
      evPower: hour >= 22 || hour <= 6 ? 3500 : 0,
      gridVoltage: 230 + Math.sin(i / 8) * 3,
      batteryVoltage: 51.2 + Math.sin(i / 10) * 1.5,
      pvYieldToday: energyData.pvYieldToday,
      priceCurrent: 0.25 + Math.sin(i / 6) * 0.08,
    };
  });

export const runDemoForecast = (energyData: EnergyData, selectedMetric: string): ForecastResult =>
  runForecast(buildDemoForecastSnapshots(energyData), selectedMetric as keyof LocalEnergyData, 24);
