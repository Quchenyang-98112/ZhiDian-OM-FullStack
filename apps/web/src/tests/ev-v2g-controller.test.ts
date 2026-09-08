import { describe, expect, it } from 'vitest';
import { EVV2GDischargeController } from '../core/energy-controllers';
import type { EnergyData, StoredSettings } from '../types';
import { SYSTEM_PRESETS } from '../types';

// ─── EVV2GDischargeController Unit Tests ──────────────────────────────────────

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

/** Base energy data with V2G capable EV connected */
const baseEnergyV2G: EnergyData = {
  pvPower: 0,
  gridPower: 1500,
  batteryPower: 0,
  houseLoad: 3000,
  batterySoC: 50,
  evPower: 0,
  heatPumpPower: 0,
  gridVoltage: 230,
  batteryVoltage: 51.2,
  pvYieldToday: 10,
  priceCurrent: 0.5, // high price — triggers discharge
  evSocPercent: 80, // EV SoC well above guardrail
  evMaxDischargePowerW: 7400,
  evDisabledBy14a: false,
};

const ctrl = new EVV2GDischargeController();

describe('EVV2GDischargeController — metadata', () => {
  it('has correct id', () => {
    expect(ctrl.id).toBe('ev-v2g-discharge');
  });

  it('is disabled by default (user must opt in)', () => {
    expect(ctrl.enabled).toBe(false);
  });

  it('has a recognised priority level', () => {
    expect(['high', 'medium', 'low']).toContain(ctrl.priority);
  });
});

describe('EVV2GDischargeController — SOC guardrails', () => {
  it('does not discharge when EV SoC is below 15%', () => {
    ctrl.enabled = true;
    const output = ctrl.run(
      { ...baseEnergyV2G, evSocPercent: 14, evMaxDischargePowerW: 7400 },
      baseSettings,
    );
    expect(output.evDischargePowerW ?? 0).toBe(0);
    ctrl.enabled = false;
  });

  it('does not discharge when EV SoC is exactly 15% (minimum is exclusive)', () => {
    ctrl.enabled = true;
    const output = ctrl.run(
      { ...baseEnergyV2G, evSocPercent: 15, evMaxDischargePowerW: 7400 },
      baseSettings,
    );
    expect(output.evDischargePowerW ?? 0).toBe(0);
    ctrl.enabled = false;
  });

  it('does not discharge when EV SoC is at 20% floor', () => {
    ctrl.enabled = true;
    const output = ctrl.run(
      { ...baseEnergyV2G, evSocPercent: 20, evMaxDischargePowerW: 7400 },
      baseSettings,
    );
    expect(output.evDischargePowerW ?? 0).toBe(0);
    ctrl.enabled = false;
  });

  it('allows discharge when EV SoC is above 20% with high tariff', () => {
    ctrl.enabled = true;
    // chargeThreshold=0.2, price=0.5 → 0.5 ≥ 2×0.2=0.4 → high tariff
    const output = ctrl.run(
      { ...baseEnergyV2G, evSocPercent: 60, evMaxDischargePowerW: 7400 },
      baseSettings,
    );
    expect(output.evDischargePowerW ?? 0).toBeGreaterThan(0);
    ctrl.enabled = false;
  });
});

describe('EVV2GDischargeController — §14a block', () => {
  it('does not discharge when §14a event is active', () => {
    ctrl.enabled = true;
    const output = ctrl.run(
      {
        ...baseEnergyV2G,
        evSocPercent: 85,
        evMaxDischargePowerW: 7400,
        evDisabledBy14a: true,
      },
      baseSettings,
    );
    expect(output.evDischargePowerW ?? 0).toBe(0);
    ctrl.enabled = false;
  });
});

describe('EVV2GDischargeController — BPT clamping', () => {
  it('clamps discharge to evMaxDischargePowerW', () => {
    ctrl.enabled = true;
    // Max discharge limited to 3000 W
    const output = ctrl.run(
      {
        ...baseEnergyV2G,
        evSocPercent: 80,
        evMaxDischargePowerW: 3000,
        priceCurrent: 1.0, // very high price
      },
      baseSettings,
    );
    expect(output.evDischargePowerW ?? 0).toBeLessThanOrEqual(3000);
    ctrl.enabled = false;
  });

  it('does not discharge when evMaxDischargePowerW is zero', () => {
    ctrl.enabled = true;
    const output = ctrl.run(
      { ...baseEnergyV2G, evSocPercent: 75, evMaxDischargePowerW: 0 },
      baseSettings,
    );
    expect(output.evDischargePowerW ?? 0).toBe(0);
    ctrl.enabled = false;
  });
});

describe('EVV2GDischargeController — disabled state', () => {
  it('returns zero discharge when evMaxDischargePowerW is 0 (V2G inactive)', () => {
    // run() blocks discharge when evMaxDischargePowerW=0 regardless of enabled flag.
    // The pipeline guards the enabled flag; the controller guards capability.
    ctrl.enabled = true;
    const output = ctrl.run({ ...baseEnergyV2G, evMaxDischargePowerW: 0 }, baseSettings);
    expect(output.evDischargePowerW ?? 0).toBe(0);
    ctrl.enabled = false;
  });

  it('returns zero discharge when no V2G data is available', () => {
    ctrl.enabled = true;
    // Omit evMaxDischargePowerW entirely (required for exactOptionalPropertyTypes)
    const { evMaxDischargePowerW: _omit, ...noV2GData } = baseEnergyV2G;
    const output = ctrl.run(noV2GData, baseSettings);
    expect(output.evDischargePowerW ?? 0).toBe(0);
    ctrl.enabled = false;
  });
});
