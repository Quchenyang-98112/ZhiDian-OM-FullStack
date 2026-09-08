import type { ThemeName } from './design-tokens';

export interface EnergyData {
  gridPower: number;
  pvPower: number;
  batteryPower: number;
  houseLoad: number;
  batterySoC: number;
  heatPumpPower: number;
  evPower: number;
  gridVoltage: number;
  batteryVoltage: number;
  pvYieldToday: number;
  priceCurrent: number;
  /** EV battery state-of-charge from ISO 15118-20 PowerDelivery (0–100 %) */
  evSocPercent?: number;
  /** BPT maximum discharge power available from EV (W); from ISO 15118-20 negotiation */
  evMaxDischargePowerW?: number;
  /** True when §14a LOAD_CONTROL OpenADR event has blocked EV charging */
  evDisabledBy14a?: boolean;
}

export type TariffProvider =
  | 'tibber'
  | 'tibber-pulse'
  | 'awattar'
  | 'awattar-de'
  | 'awattar-at'
  | 'nordpool'
  | 'octopus'
  | 'none';

export type LocaleCode = 'de' | 'en' | 'zh';

export type CommandType =
  | 'SET_EV_POWER'
  | 'SET_HEAT_PUMP_MODE'
  | 'SET_HEAT_PUMP_POWER'
  | 'SET_BATTERY_POWER'
  | 'TOGGLE_KNX_LIGHTS'
  | 'TOGGLE_KNX_WINDOW'
  | 'SET_ROOM_TEMPERATURE';

export type EvMode = 'off' | 'pv' | 'fast';

export interface EvState {
  mode: EvMode;
  power: number;
  message: string;
}

export type GatewayType = 'cerbo-gx' | 'cerbo-gx-mk2' | 'raspberry-pi';

// ─── System Configuration (fully user-editable) ─────────────────────

export interface InverterConfig {
  model: string;
  count: number;
  ratedPowerW: number;
  /** Operating mode: parallel = single-phase parallel, three-phase = L1/L2/L3 split */
  mode: 'single' | 'parallel' | 'three-phase';
}

export interface PVConfig {
  peakPowerKWp: number;
  orientation: 'south' | 'east-west' | 'east' | 'west' | 'north';
  tiltDeg: number;
  strings: number;
  mpptCount: number;
}

export interface BatteryConfig {
  model: string;
  capacityKWh: number;
  modules: number;
  maxChargeRateKW: number;
  maxDischargeRateKW: number;
  minSoCPercent: number;
  maxSoCPercent: number;
  nominalVoltageV: number;
  strategy: 'self-consumption' | 'force-charge' | 'time-of-use' | 'auto';
}

export interface EVChargerConfig {
  model: string;
  maxPowerKW: number;
  phases: 1 | 3;
  ocppEnabled: boolean;
}

export interface HeatPumpConfig {
  model: string;
  ratedPowerKW: number;
  sgReadyEnabled: boolean;
}

export interface SystemConfig {
  presetId: string;
  presetName: string;
  inverter: InverterConfig;
  pv: PVConfig;
  battery: BatteryConfig;
  evCharger: EVChargerConfig;
  heatPump: HeatPumpConfig;
}

/** Pre-defined system configurations */
export const SYSTEM_PRESETS: Record<string, SystemConfig> = {
  'victron-3mp2-standard': {
    presetId: 'victron-3mp2-standard',
    presetName: '3× Victron MultiPlus-II 48/5000 (Standard)',
    inverter: {
      model: 'Victron MultiPlus-II 48/5000/70-50',
      count: 3,
      ratedPowerW: 5000,
      mode: 'three-phase',
    },
    pv: { peakPowerKWp: 15.0, orientation: 'south', tiltDeg: 30, strings: 4, mpptCount: 2 },
    battery: {
      model: 'BYD Battery-Box Premium HVS 12.8',
      capacityKWh: 12.8,
      modules: 4,
      maxChargeRateKW: 12.8,
      maxDischargeRateKW: 12.8,
      minSoCPercent: 10,
      maxSoCPercent: 95,
      nominalVoltageV: 51.2,
      strategy: 'self-consumption',
    },
    evCharger: {
      model: 'Victron EV Charging Station',
      maxPowerKW: 22,
      phases: 3,
      ocppEnabled: true,
    },
    heatPump: { model: 'SG Ready Heat Pump', ratedPowerKW: 6, sgReadyEnabled: true },
  },
  'victron-3mp2-large': {
    presetId: 'victron-3mp2-large',
    presetName: '3× Victron MultiPlus-II 48/10000 (Large)',
    inverter: {
      model: 'Victron MultiPlus-II 48/10000/140-100',
      count: 3,
      ratedPowerW: 10000,
      mode: 'three-phase',
    },
    pv: { peakPowerKWp: 30.0, orientation: 'east-west', tiltDeg: 15, strings: 8, mpptCount: 4 },
    battery: {
      model: 'BYD Battery-Box Premium HVS 25.6',
      capacityKWh: 25.6,
      modules: 8,
      maxChargeRateKW: 25.6,
      maxDischargeRateKW: 25.6,
      minSoCPercent: 10,
      maxSoCPercent: 95,
      nominalVoltageV: 51.2,
      strategy: 'self-consumption',
    },
    evCharger: {
      model: 'Victron EV Charging Station',
      maxPowerKW: 22,
      phases: 3,
      ocppEnabled: true,
    },
    heatPump: { model: 'SG Ready Heat Pump', ratedPowerKW: 12, sgReadyEnabled: true },
  },
  'victron-1mp2-compact': {
    presetId: 'victron-1mp2-compact',
    presetName: '1× Victron MultiPlus-II 48/3000 (Compact)',
    inverter: {
      model: 'Victron MultiPlus-II 48/3000/35-32',
      count: 1,
      ratedPowerW: 3000,
      mode: 'single',
    },
    pv: { peakPowerKWp: 6.0, orientation: 'south', tiltDeg: 35, strings: 2, mpptCount: 1 },
    battery: {
      model: 'Pylontech US3000C',
      capacityKWh: 3.55,
      modules: 2,
      maxChargeRateKW: 3.55,
      maxDischargeRateKW: 3.55,
      minSoCPercent: 15,
      maxSoCPercent: 95,
      nominalVoltageV: 48,
      strategy: 'self-consumption',
    },
    evCharger: { model: 'go-eCharger', maxPowerKW: 11, phases: 3, ocppEnabled: false },
    heatPump: { model: 'SG Ready Heat Pump', ratedPowerKW: 4, sgReadyEnabled: true },
  },
  custom: {
    presetId: 'custom',
    presetName: 'Custom',
    inverter: { model: '', count: 1, ratedPowerW: 5000, mode: 'single' },
    pv: { peakPowerKWp: 10.0, orientation: 'south', tiltDeg: 30, strings: 2, mpptCount: 1 },
    battery: {
      model: '',
      capacityKWh: 10.0,
      modules: 1,
      maxChargeRateKW: 5.0,
      maxDischargeRateKW: 5.0,
      minSoCPercent: 10,
      maxSoCPercent: 100,
      nominalVoltageV: 51.2,
      strategy: 'self-consumption',
    },
    evCharger: { model: '', maxPowerKW: 11, phases: 3, ocppEnabled: false },
    heatPump: { model: '', ratedPowerKW: 6, sgReadyEnabled: true },
  },
};

export interface StoredSettings {
  gatewayType: GatewayType;
  systemConfig: SystemConfig;
  victronIp: string;
  knxIp: string;
  wsPort: number;
  refreshRateMs: number;
  tariffProvider: TariffProvider;
  tariffRegion: string;
  dynamicGridFees: boolean;
  gridOperatorName: string;
  chargeThreshold: number;
  maxGridImportKw: number;
  mtls: boolean;
  telemetryDisabled: boolean;
  twoFactor: boolean;
  influxUrl: string;
  influxToken: string;
  historyDays: number;
  location: { lat: number; lon: number };
  gridPriceAvg: number;
  // Appearance
  animations: boolean;
  compactMode: boolean;
  glowEffects: boolean;
  // Language & Region
  units: 'metric' | 'imperial';
  dateFormat: 'dd.mm.yyyy' | 'mm/dd/yyyy' | 'yyyy-mm-dd';
  currency: 'eur' | 'chf' | 'gbp';
  // System
  mqttAutoDiscovery: boolean;
  // Accessibility
  fontScale: number;
  reducedMotion: boolean;
  highContrast: boolean;
  // Notifications
  pushNotifications: boolean;
  priceAlerts: boolean;
  batteryAlerts: boolean;
  gridAlerts: boolean;
  updateNotifications: boolean;
  batteryAlertThreshold: number;
  priceAlertThreshold: number;
  quietHoursEnabled: boolean;
  quietHoursStart: string;
  quietHoursEnd: string;
  // Energy extras
  feedInTariff: number;
  gridOperator: string;
  monthlyBudget: number;
  // PV/Battery/EV sizing
  pvPeakKw: number;
  batteryCapacityKWh: number;
  batteryMaxChargeKW: number;
  batteryMinSoC: number;
  evMaxPowerKW: number;
  heatPumpPowerKW: number;
  feedInTariffEurKWh: number;
  // Dashboard
  dashboardRefreshSec: number;
  sidebarPosition: 'left' | 'right';
  // Advanced
  debugMode: boolean;
  experimentalFeatures: boolean;
  performanceMode: boolean;
  autoBackup: boolean;
  keyboardShortcuts: boolean;
}

export interface FloorplanState {
  lightsOn: boolean;
  windowOpen: boolean;
  roomTemperature: number;
}

export interface OptimizerRecommendation {
  id: string;
  severity: 'positive' | 'warning' | 'critical' | 'neutral';
  titleKey: string;
  descriptionKey: string;
  value: string;
}

export interface ThemeOption {
  value: ThemeName;
  label: string;
}

export type HpMode = '1' | '2' | '3' | '4';

export interface HpState {
  mode: HpMode;
  power: number;
  message: string;
}
