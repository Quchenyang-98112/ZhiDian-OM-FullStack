import { describe, expect, it } from 'vitest';
import { buildOptimizerRecommendations, runMpcOptimization } from '../lib/optimizer';
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

describe('Optimizer Recommendations', () => {
  it('should recommend battery charge when price is below threshold', () => {
    const recs = buildOptimizerRecommendations({ ...baseEnergy, priceCurrent: 0.1 }, baseSettings);
    const chargeRec = recs.find((r) => r.id === 'charge-window');
    expect(chargeRec).toBeDefined();
    expect(chargeRec?.severity).toBe('positive');
  });

  it('should NOT recommend battery charge when price is above threshold', () => {
    const recs = buildOptimizerRecommendations({ ...baseEnergy, priceCurrent: 0.25 }, baseSettings);
    expect(recs.find((r) => r.id === 'charge-window')).toBeUndefined();
  });

  it('should recommend EV charging on PV surplus > 1800W', () => {
    // pvSurplus = pvPower - houseLoad - heatPumpPower - evPower
    // 5000 - 2000 - 1000 - 0 = 2000 > 1800 ✓
    const recs = buildOptimizerRecommendations({ ...baseEnergy, pvPower: 5000 }, baseSettings);
    expect(recs.find((r) => r.id === 'pv-surplus')).toBeDefined();
  });

  it('should NOT recommend EV with low PV surplus', () => {
    const recs = buildOptimizerRecommendations({ ...baseEnergy, pvPower: 2500 }, baseSettings);
    expect(recs.find((r) => r.id === 'pv-surplus')).toBeUndefined();
  });

  it('should recommend SG Ready heat pump when battery > 65% and price low', () => {
    const recs = buildOptimizerRecommendations(
      { ...baseEnergy, batterySoC: 80, priceCurrent: 0.15 },
      baseSettings,
    );
    expect(recs.find((r) => r.id === 'sg-ready')).toBeDefined();
  });

  it('should warn on grid import exceeding limit', () => {
    const recs = buildOptimizerRecommendations({ ...baseEnergy, gridPower: 6000 }, baseSettings);
    const gridRec = recs.find((r) => r.id === 'grid-limit');
    expect(gridRec).toBeDefined();
    expect(gridRec?.severity).toBe('critical');
  });

  it('should return balanced fallback when no conditions fire', () => {
    const recs = buildOptimizerRecommendations(
      { ...baseEnergy, pvPower: 2000, priceCurrent: 0.25, batterySoC: 50, gridPower: 1000 },
      baseSettings,
    );
    expect(recs.find((r) => r.id === 'balanced')).toBeDefined();
  });
});

describe('runMpcOptimization()', () => {
  it('returns an optimization result for valid energy data', () => {
    const result = runMpcOptimization(baseEnergy, baseSettings);
    expect(result).not.toBeNull();
    expect(result?.schedule.length).toBeGreaterThan(0);
    expect(result?.totalCostEur).toBeTypeOf('number');
  });

  it('reuses cached MPC result within the 15-minute interval', () => {
    const first = runMpcOptimization(baseEnergy, baseSettings);
    const second = runMpcOptimization(baseEnergy, baseSettings);
    expect(second).toBe(first);
  });
});
