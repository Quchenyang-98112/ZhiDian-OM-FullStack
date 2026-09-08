import { describe, expect, it } from 'vitest';
import {
  ControllerPipeline,
  EmergencyCapacityController,
  ESSSymmetricController,
  EVSmartChargeController,
  GridOptimizedChargeController,
  HeatPumpSGReadyController,
  PeakShavingController,
  SelfConsumptionController,
} from '../core/energy-controllers';
import type { EnergyData, StoredSettings } from '../types';
import { SYSTEM_PRESETS } from '../types';

const baseEnergy: EnergyData = {
  pvPower: 5000,
  gridPower: 500,
  batteryPower: 0,
  houseLoad: 3000,
  batterySoC: 50,
  evPower: 0,
  heatPumpPower: 1000,
  gridVoltage: 230,
  batteryVoltage: 51.2,
  pvYieldToday: 15,
  priceCurrent: 0.3,
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

describe('Energy Controllers', () => {
  describe('ESSSymmetricController', () => {
    it('should produce output with reason and confidence', () => {
      const ctrl = new ESSSymmetricController();
      const output = ctrl.run({ ...baseEnergy, gridPower: 2000 }, baseSettings);
      expect(output.reason).toBeTruthy();
      expect(output.confidence).toBeGreaterThanOrEqual(0);
    });

    it('should have correct id and priority', () => {
      const ctrl = new ESSSymmetricController();
      expect(ctrl.id).toBe('ess-symmetric');
      expect(ctrl.priority).toBe('high');
    });

    it('should expose state', () => {
      const ctrl = new ESSSymmetricController();
      ctrl.run(baseEnergy, baseSettings);
      const state = ctrl.getState();
      expect(state.id).toBe('ess-symmetric');
      expect(state.lastRun).toBeGreaterThan(0);
    });

    // LOW-11 — clamp is sourced from the configured battery, fails safe.
    const withBattery = (charge: number | undefined, discharge: number | undefined) =>
      ({
        ...baseSettings,
        systemConfig: {
          ...baseSettings.systemConfig,
          battery: {
            ...baseSettings.systemConfig.battery,
            maxChargeRateKW: charge as number,
            maxDischargeRateKW: discharge as number,
          },
        },
      }) satisfies StoredSettings;
    // gridPower ±50 kW drives the PID well past any clamp (kp+kd ≈ 0.6).
    const saturate = 50_000;

    it('clamps to the configured small-battery limit (3.55 kW)', () => {
      const s = withBattery(3.55, 3.55);
      const charge = new ESSSymmetricController().run({ ...baseEnergy, gridPower: saturate }, s);
      const discharge = new ESSSymmetricController().run(
        { ...baseEnergy, gridPower: -saturate },
        s,
      );
      expect(charge.essPowerW).toBe(3550);
      expect(discharge.essPowerW).toBe(-3550);
    });

    it('fails safe to ±10 kW when the battery limit is missing/zero/NaN', () => {
      for (const bad of [0, -5, Number.NaN, undefined]) {
        const s = withBattery(bad, bad);
        const charge = new ESSSymmetricController().run({ ...baseEnergy, gridPower: saturate }, s);
        const discharge = new ESSSymmetricController().run(
          { ...baseEnergy, gridPower: -saturate },
          s,
        );
        expect(charge.essPowerW).toBe(10_000);
        expect(discharge.essPowerW).toBe(-10_000);
      }
    });

    it('respects asymmetric charge/discharge limits', () => {
      const s = withBattery(5, 3);
      const charge = new ESSSymmetricController().run({ ...baseEnergy, gridPower: saturate }, s);
      const discharge = new ESSSymmetricController().run(
        { ...baseEnergy, gridPower: -saturate },
        s,
      );
      expect(charge.essPowerW).toBe(5000);
      expect(discharge.essPowerW).toBe(-3000);
    });

    it('never exceeds the 25 kW command-safety backstop even for an absurd rate', () => {
      const s = withBattery(999, 999);
      const charge = new ESSSymmetricController().run({ ...baseEnergy, gridPower: saturate }, s);
      const discharge = new ESSSymmetricController().run(
        { ...baseEnergy, gridPower: -saturate },
        s,
      );
      expect(charge.essPowerW).toBe(25_000);
      expect(discharge.essPowerW).toBe(-25_000);
      expect(Math.abs(charge.essPowerW ?? 0)).toBeLessThanOrEqual(25_000);
      expect(Math.abs(discharge.essPowerW ?? 0)).toBeLessThanOrEqual(25_000);
    });
  });

  describe('PeakShavingController', () => {
    it('should activate when grid exceeds limit', () => {
      const ctrl = new PeakShavingController();
      const output = ctrl.run(
        { ...baseEnergy, gridPower: 6000 },
        { ...baseSettings, maxGridImportKw: 4 },
      );
      expect(output.essPowerW).toBeDefined();
    });

    it('should have critical priority', () => {
      const ctrl = new PeakShavingController();
      expect(ctrl.priority).toBe('critical');
    });
  });

  describe('GridOptimizedChargeController', () => {
    it('should charge battery when price is below threshold', () => {
      const ctrl = new GridOptimizedChargeController();
      const output = ctrl.run(
        { ...baseEnergy, priceCurrent: 0.1, batterySoC: 30 },
        { ...baseSettings, chargeThreshold: 0.2 },
      );
      if (output.essPowerW !== undefined) {
        expect(output.essPowerW).toBeGreaterThan(0);
      }
    });
  });

  describe('SelfConsumptionController', () => {
    it('should use PV surplus for battery when available', () => {
      const ctrl = new SelfConsumptionController();
      const output = ctrl.run(
        { ...baseEnergy, pvPower: 8000, houseLoad: 2000, batterySoC: 40 },
        baseSettings,
      );
      expect(output.reason).toBeTruthy();
    });
  });

  describe('EmergencyCapacityController', () => {
    it('should protect reserve when SoC is critically low', () => {
      const ctrl = new EmergencyCapacityController();
      const output = ctrl.run({ ...baseEnergy, batterySoC: 8, batteryPower: -2000 }, baseSettings);
      expect(output.reason).toBeTruthy();
      expect(output.confidence).toBeGreaterThan(0);
    });
  });

  describe('HeatPumpSGReadyController', () => {
    it('should boost when price is very cheap and PV surplus exists', () => {
      const ctrl = new HeatPumpSGReadyController();
      const output = ctrl.run({ ...baseEnergy, priceCurrent: 0.05, pvPower: 10000 }, baseSettings);
      if (output.sgReadyMode !== undefined) {
        expect([3, 4]).toContain(output.sgReadyMode);
      }
    });
  });

  describe('EVSmartChargeController', () => {
    it('should produce output', () => {
      const ctrl = new EVSmartChargeController();
      const output = ctrl.run({ ...baseEnergy, pvPower: 10000, houseLoad: 2000 }, baseSettings);
      expect(output.reason).toBeTruthy();
    });
  });

  describe('ControllerPipeline', () => {
    it('should run all controllers and produce merged output', () => {
      const pipeline = new ControllerPipeline();
      const output = pipeline.run(baseEnergy, baseSettings);
      expect(output.reason).toBeTruthy();
    });

    it('should register default controllers', () => {
      const pipeline = new ControllerPipeline();
      const controllers = pipeline.getControllers();
      expect(controllers.length).toBeGreaterThanOrEqual(7);
    });

    it('should get states for all controllers', () => {
      const pipeline = new ControllerPipeline();
      pipeline.run(baseEnergy, baseSettings);
      const states = pipeline.getStates();
      expect(states.length).toBeGreaterThanOrEqual(7);
      for (const s of states) {
        expect(s.id).toBeTruthy();
        expect(s.name).toBeTruthy();
      }
    });

    it('should enable/disable controllers', () => {
      const pipeline = new ControllerPipeline();
      pipeline.setEnabled('ess-symmetric', false);
      const ess = pipeline.getControllers().find((c) => c.id === 'ess-symmetric');
      expect(ess?.enabled).toBe(false);
    });

    it('should reset all controllers', () => {
      const pipeline = new ControllerPipeline();
      pipeline.run(baseEnergy, baseSettings);
      pipeline.resetAll();
      const result = pipeline.getLastResult('ess-symmetric');
      expect(result).toBeUndefined();
    });
  });

  describe('Null guard safety', () => {
    it('should handle undefined energy data fields gracefully', () => {
      const pipeline = new ControllerPipeline();
      const sparseData = {} as unknown as EnergyData;
      const output = pipeline.run(sparseData, baseSettings);
      expect(output.reason).toBeTruthy();
      // Should not throw with missing fields
    });

    it('ESSSymmetric should handle undefined gridPower', () => {
      const ctrl = new ESSSymmetricController();
      const data = { ...baseEnergy, gridPower: undefined } as unknown as EnergyData;
      const output = ctrl.run(data, baseSettings);
      expect(output.reason).toBeTruthy();
    });

    it('PeakShaving should handle undefined batterySoC', () => {
      const ctrl = new PeakShavingController();
      const data = {
        ...baseEnergy,
        gridPower: 6000,
        batterySoC: undefined,
      } as unknown as EnergyData;
      const output = ctrl.run(data, { ...baseSettings, maxGridImportKw: 4 });
      expect(output.reason).toBeTruthy();
    });

    it('GridOptimized should handle undefined priceCurrent', () => {
      const ctrl = new GridOptimizedChargeController();
      const data = { ...baseEnergy, priceCurrent: undefined } as unknown as EnergyData;
      const output = ctrl.run(data, baseSettings);
      expect(output.reason).toBeTruthy();
    });

    it('EmergencyCapacity should handle undefined batterySoC', () => {
      const ctrl = new EmergencyCapacityController();
      const data = { ...baseEnergy, batterySoC: undefined } as unknown as EnergyData;
      const output = ctrl.run(data, baseSettings);
      expect(output.reason).toBeTruthy();
    });

    it('HeatPumpSGReady should handle all undefined fields', () => {
      const ctrl = new HeatPumpSGReadyController();
      const data = {
        ...baseEnergy,
        pvPower: undefined,
        houseLoad: undefined,
        evPower: undefined,
        priceCurrent: undefined,
        batterySoC: undefined,
      } as unknown as EnergyData;
      const output = ctrl.run(data, baseSettings);
      expect(output.reason).toBeTruthy();
    });

    it('EVSmartCharge should handle all undefined fields', () => {
      const ctrl = new EVSmartChargeController();
      const data = {
        ...baseEnergy,
        pvPower: undefined,
        houseLoad: undefined,
        heatPumpPower: undefined,
        gridPower: undefined,
        evPower: undefined,
        priceCurrent: undefined,
      } as unknown as EnergyData;
      const output = ctrl.run(data, baseSettings);
      expect(output.reason).toBeTruthy();
    });
  });

  describe('HeatPumpSGReadyController modes', () => {
    it('should set normal mode when no special condition', () => {
      const ctrl = new HeatPumpSGReadyController();
      const output = ctrl.run(
        { ...baseEnergy, pvPower: 3000, houseLoad: 3000, priceCurrent: 0.25 },
        baseSettings,
      );
      expect(output.reason).toBeTruthy();
    });

    it('should recommend block when price is very high', () => {
      const ctrl = new HeatPumpSGReadyController();
      const output = ctrl.run(
        { ...baseEnergy, priceCurrent: 0.8, pvPower: 0, batterySoC: 20 },
        baseSettings,
      );
      expect(output.reason).toBeTruthy();
      if (output.sgReadyMode !== undefined) {
        expect([1, 2]).toContain(output.sgReadyMode);
      }
    });
  });

  describe('EVSmartChargeController edge cases', () => {
    it('should handle zero PV surplus', () => {
      const ctrl = new EVSmartChargeController();
      const output = ctrl.run({ ...baseEnergy, pvPower: 2000, houseLoad: 3000 }, baseSettings);
      expect(output.reason).toBeTruthy();
    });

    it('should handle very high PV surplus', () => {
      const ctrl = new EVSmartChargeController();
      const output = ctrl.run(
        { ...baseEnergy, pvPower: 20000, houseLoad: 1000, heatPumpPower: 0 },
        baseSettings,
      );
      expect(output.reason).toBeTruthy();
    });
  });
});
