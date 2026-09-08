import type { AlertRule } from '../types';

/**
 * Client-side daytime window (07:00–19:59 local) used to mirror the PromQL
 * `hour()` guard in the `NoSolarGeneration` demo rule. Read once so the check
 * cannot straddle an hour boundary between two `getHours()` calls.
 */
function isDaytime(): boolean {
  const hour = new Date().getHours();
  return hour >= 7 && hour < 20;
}

/** Build the Prometheus-style alert rules with live `active` evaluation. */
export function buildAlertRules(
  t: (key: string) => string,
  values: {
    gridPower: number;
    batterySoC: number;
    connected: boolean;
    price: number;
    voltage: number;
    pvPower: number;
  },
): AlertRule[] {
  return [
    {
      name: 'HighGridImport',
      expr: 'hems_grid_power_watts > 4200',
      for: '5m',
      severity: 'warning',
      desc: t('monitoring.ruleHighGrid'),
      active: values.gridPower > 4200,
    },
    {
      name: 'BatteryLow',
      expr: 'hems_battery_soc_percent < 10',
      for: '10m',
      severity: 'critical',
      desc: t('monitoring.ruleBatteryLow'),
      active: values.batterySoC < 10,
    },
    {
      name: 'AdapterDisconnected',
      expr: 'hems_adapter_connected == 0',
      for: '2m',
      severity: 'warning',
      desc: t('monitoring.ruleAdapterDown'),
      active: !values.connected,
    },
    {
      name: 'HighElectricityPrice',
      expr: 'hems_tariff_price > 0.40',
      for: '0m',
      severity: 'info',
      desc: t('monitoring.ruleHighPrice'),
      active: values.price > 0.4,
    },
    {
      name: 'GridVoltageAnomaly',
      expr: 'hems_grid_voltage < 210 or hems_grid_voltage > 250',
      for: '1m',
      severity: 'critical',
      desc: t('monitoring.ruleVoltage'),
      active: values.voltage < 210 || values.voltage > 250,
    },
    {
      name: 'NoSolarGeneration',
      expr: 'hems_pv_power_watts == 0 and hour() >= 7 and hour() < 20',
      for: '30m',
      severity: 'warning',
      desc: t('monitoring.ruleNoSolar'),
      active: values.pvPower === 0 && isDaytime(),
    },
  ];
}
