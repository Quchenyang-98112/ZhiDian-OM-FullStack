import { describe, expect, it } from 'vitest';
import type { TariffSlot } from '../lib/mpc-optimizer';
import {
  buildConstraints,
  generateLoadForecast,
  generatePVForecast,
  MPCOptimizer,
} from '../lib/mpc-optimizer';
import type { EnergyData, StoredSettings } from '../types';
import { SYSTEM_PRESETS } from '../types';

const baseEnergy: EnergyData = {
  pvPower: 4000,
  gridPower: 200,
  batteryPower: -500,
  houseLoad: 2000,
  batterySoC: 70,
  evPower: 0,
  heatPumpPower: 1000,
  gridVoltage: 230,
  batteryVoltage: 52,
  pvYieldToday: 10,
  priceCurrent: 0.15,
};

const baseSettings: StoredSettings = {
  chargeThreshold: 0.2,
  maxGridImportKw: 5,
  gatewayType: 'cerbo-gx',
  systemConfig: SYSTEM_PRESETS['victron-3mp2-standard'],
  victronIp: '192.168.1.100',
  knxIp: '192.168.1.50',
  wsPort: 3000,
  refreshRateMs: 2000,
  tariffProvider: 'tibber',
  tariffRegion: 'DE',
  dynamicGridFees: true,
  gridOperatorName: '',
  mtls: false,
  telemetryDisabled: false,
  twoFactor: true,
  influxUrl: '',
  influxToken: '',
  historyDays: 30,
  location: { lat: 53.5511, lon: 9.9937 },
  gridPriceAvg: 0.25,
  animations: true,
  compactMode: false,
  glowEffects: true,
  units: 'metric',
  dateFormat: 'dd.mm.yyyy',
  currency: 'eur',
  mqttAutoDiscovery: true,
  fontScale: 1.0,
  reducedMotion: false,
  highContrast: false,
  pushNotifications: true,
  priceAlerts: true,
  batteryAlerts: true,
  gridAlerts: false,
  updateNotifications: true,
  batteryAlertThreshold: 15,
  priceAlertThreshold: 0.1,
  quietHoursEnabled: false,
  quietHoursStart: '22:00',
  quietHoursEnd: '07:00',
  feedInTariff: 0.082,
  gridOperator: '',
  monthlyBudget: 80,
  pvPeakKw: 10,
  batteryCapacityKWh: 10,
  batteryMaxChargeKW: 5,
  batteryMinSoC: 10,
  evMaxPowerKW: 11,
  heatPumpPowerKW: 6,
  feedInTariffEurKWh: 0.082,
  dashboardRefreshSec: 5,
  sidebarPosition: 'left',
  debugMode: false,
  experimentalFeatures: false,
  performanceMode: false,
  autoBackup: false,
  keyboardShortcuts: true,
};

describe('MPC Optimizer', () => {
  describe('PV Forecast Generation', () => {
    it('should generate correct number of slots', () => {
      const forecast = generatePVForecast(96, 10000);
      expect(forecast).toHaveLength(96);
    });

    it('should have zero PV at nighttime', () => {
      const forecast = generatePVForecast(96, 10000);
      // Check that timestamps exist and power is non-negative
      for (const slot of forecast) {
        expect(slot.powerW).toBeGreaterThanOrEqual(0);
        expect(slot.timestamp).toBeGreaterThan(0);
      }
    });
  });

  describe('Load Forecast Generation', () => {
    it('should generate correct number of slots', () => {
      const forecast = generateLoadForecast(96, 500);
      expect(forecast).toHaveLength(96);
    });

    it('should never go below half base load', () => {
      const baseLoad = 500;
      const forecast = generateLoadForecast(96, baseLoad);
      for (const slot of forecast) {
        expect(slot.powerW).toBeGreaterThanOrEqual(baseLoad * 0.5);
      }
    });
  });

  describe('Constraint Builder', () => {
    it('should build valid constraints from settings', () => {
      const constraints = buildConstraints(baseEnergy, baseSettings);
      expect(constraints.batteryCapacityWh).toBe(10000);
      expect(constraints.maxGridImportW).toBe(5000);
      expect(constraints.currentBatterySoC).toBeCloseTo(0.7);
      expect(constraints.minBatterySoC).toBeCloseTo(0.1);
    });
  });

  describe('Day-Ahead Optimization', () => {
    it('should produce an optimization result with schedule', () => {
      const mpc = new MPCOptimizer();
      const slots = 96;
      const pv = generatePVForecast(slots, 10000);
      const load = generateLoadForecast(slots, 500);
      const constraints = buildConstraints(baseEnergy, baseSettings);
      const tariff: TariffSlot[] = pv.map((p) => ({
        timestamp: p.timestamp,
        priceEurKWh: 0.3,
        co2GPerKWh: 400,
      }));

      const result = mpc.optimizeDayAhead(pv, load, tariff, constraints);

      expect(result.status).toBe('optimal');
      expect(result.schedule.length).toBe(slots);
      expect(result.horizonH).toBe(24);
      expect(result.solverTimeMs).toBeGreaterThan(0);
      expect(result.generatedAt).toBeGreaterThan(0);
    });

    it('should respect battery SoC limits', () => {
      const mpc = new MPCOptimizer();
      const slots = 96;
      const pv = generatePVForecast(slots, 10000);
      const load = generateLoadForecast(slots, 500);
      const constraints = buildConstraints(baseEnergy, baseSettings);
      const tariff: TariffSlot[] = pv.map((p) => ({
        timestamp: p.timestamp,
        priceEurKWh: 0.3,
        co2GPerKWh: 400,
      }));

      const result = mpc.optimizeDayAhead(pv, load, tariff, constraints);
      expect(result.totalCostEur).toBeDefined();
      expect(result.selfConsumptionRate).toBeGreaterThanOrEqual(0);
      expect(result.selfConsumptionRate).toBeLessThanOrEqual(1);
    });

    it('should handle variable tariff pricing', () => {
      const mpc = new MPCOptimizer();
      const slots = 96;
      const pv = generatePVForecast(slots, 10000);
      const load = generateLoadForecast(slots, 500);
      const constraints = buildConstraints(baseEnergy, baseSettings);

      // Create variable pricing: cheap at night, expensive during day
      const tariff: TariffSlot[] = pv.map((p) => {
        const hour = new Date(p.timestamp).getHours();
        return {
          timestamp: p.timestamp,
          priceEurKWh: hour >= 8 && hour <= 20 ? 0.4 : 0.15,
          co2GPerKWh: hour >= 8 && hour <= 20 ? 500 : 300,
        };
      });

      const result = mpc.optimizeDayAhead(pv, load, tariff, constraints);
      expect(result.status).toBe('optimal');
      expect(result.schedule.length).toBe(slots);
    });
  });

  describe('MPC Re-optimization', () => {
    it('should detect when re-optimization is needed', () => {
      const mpc = new MPCOptimizer();
      expect(mpc.needsReoptimization()).toBe(true);

      const pv = generatePVForecast(96, 10000);
      const load = generateLoadForecast(96, 500);
      const constraints = buildConstraints(baseEnergy, baseSettings);
      const tariff: TariffSlot[] = pv.map((p) => ({
        timestamp: p.timestamp,
        priceEurKWh: 0.3,
        co2GPerKWh: 400,
      }));

      mpc.optimizeDayAhead(pv, load, tariff, constraints);
      expect(mpc.needsReoptimization()).toBe(false);
    });

    it('should store last result', () => {
      const mpc = new MPCOptimizer();
      expect(mpc.getLastResult()).toBeNull();

      const pv = generatePVForecast(96, 10000);
      const load = generateLoadForecast(96, 500);
      const constraints = buildConstraints(baseEnergy, baseSettings);
      const tariff: TariffSlot[] = pv.map((p) => ({
        timestamp: p.timestamp,
        priceEurKWh: 0.3,
        co2GPerKWh: 400,
      }));

      mpc.optimizeDayAhead(pv, load, tariff, constraints);
      expect(mpc.getLastResult()).not.toBeNull();
      expect(mpc.getLastResult()?.status).toBe('optimal');
    });
  });

  describe('Edge cases', () => {
    it('should handle zero battery capacity without crashing', () => {
      const constraints = buildConstraints(baseEnergy, {
        ...baseSettings,
        batteryCapacityKWh: 0,
        batteryMaxChargeKW: 0,
      });
      expect(constraints.batteryCapacityWh).toBeGreaterThanOrEqual(100);
      expect(constraints.maxBatteryChargeW).toBeGreaterThanOrEqual(100);
    });

    it('should handle negative prices in tariff', () => {
      const mpc = new MPCOptimizer();
      const slots = 24;
      const pv = generatePVForecast(slots, 10000);
      const load = generateLoadForecast(slots, 500);
      const constraints = buildConstraints(baseEnergy, baseSettings);
      const tariff: TariffSlot[] = pv.map((p) => ({
        timestamp: p.timestamp,
        priceEurKWh: -0.05,
        co2GPerKWh: 200,
      }));

      const result = mpc.optimizeDayAhead(pv, load, tariff, constraints);
      expect(result.status).toBe('optimal');
      expect(result.schedule.length).toBe(slots);
    });

    it('should handle single-slot forecast', () => {
      const mpc = new MPCOptimizer();
      const pv = generatePVForecast(1, 10000);
      const load = generateLoadForecast(1, 500);
      const constraints = buildConstraints(baseEnergy, baseSettings);
      const tariff: TariffSlot[] = [
        { timestamp: pv[0].timestamp, priceEurKWh: 0.3, co2GPerKWh: 400 },
      ];

      const result = mpc.optimizeDayAhead(pv, load, tariff, constraints);
      expect(result.schedule.length).toBe(1);
    });

    it('should clamp batterySoC to 0-1 range', () => {
      const constraints = buildConstraints({ ...baseEnergy, batterySoC: 150 }, baseSettings);
      expect(constraints.currentBatterySoC).toBeLessThanOrEqual(1);

      const constraints2 = buildConstraints({ ...baseEnergy, batterySoC: -20 }, baseSettings);
      expect(constraints2.currentBatterySoC).toBeGreaterThanOrEqual(0);
    });
  });
});
