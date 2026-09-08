import { useTranslation } from 'react-i18next';
import { getMetricFromSnapshot, useMetrics } from '../../../core/useMetrics';
import { useAppStoreShallow } from '../../../store';
import type { EnergyData } from '../../../types';
import { buildContribAdapters, buildCoreAdapters } from '../data/adapters';
import { buildAlertRules } from '../data/alertRules';
import { buildEventLog } from '../data/eventLog';
import { buildMetricCards } from '../data/metricCards';
import { calculateStatuses, generateSystemLoadHistory } from '../utils';

// Derive the slice directly from the store's `EnergyData` type so a rename or
// removal of any field surfaces here as a type error rather than silent drift.
type StoreEnergySlice = Pick<
  EnergyData,
  | 'pvPower'
  | 'gridPower'
  | 'batteryPower'
  | 'batterySoC'
  | 'houseLoad'
  | 'evPower'
  | 'heatPumpPower'
  | 'gridVoltage'
  | 'priceCurrent'
>;

type EnergyMetrics = {
  pvPower: number;
  gridPower: number;
  batteryPower: number;
  batterySoC: number;
  houseLoad: number;
  evPower: number;
  heatPump: number;
  voltage: number;
  price: number;
  uptime: number;
};

export function withFallback(value: number | null, fallback: number): number {
  return value ?? fallback;
}

// skipcq: JS-R1005
export function extractEnergyMetrics(
  get: (name: string, labels?: Record<string, string>) => number | null,
  energyData: StoreEnergySlice,
  health: { uptime: number },
): EnergyMetrics {
  return {
    pvPower: withFallback(get('hems_pv_power_watts'), energyData.pvPower),
    gridPower: withFallback(get('hems_grid_power_watts'), energyData.gridPower),
    batteryPower: withFallback(get('hems_battery_power_watts'), energyData.batteryPower),
    batterySoC: withFallback(get('hems_battery_soc_percent'), energyData.batterySoC),
    houseLoad: withFallback(get('hems_house_load_watts'), energyData.houseLoad),
    evPower: withFallback(get('hems_ev_charger_power_watts'), energyData.evPower),
    heatPump: withFallback(get('hems_heat_pump_power_watts'), energyData.heatPumpPower),
    voltage: withFallback(get('hems_grid_voltage_volts'), energyData.gridVoltage),
    price: withFallback(get('hems_tariff_price_eur_per_kwh'), energyData.priceCurrent),
    uptime: withFallback(get('hems_uptime_seconds'), health.uptime),
  };
}

// skipcq: JS-R1005
export function useMonitoringData() {
  const { t } = useTranslation();
  // Select the STORE'S stable refs. Returning a fresh `{ energyData: {…} }`
  // object here builds a new nested object on every call, which defeats
  // useShallow (its shallow compare sees `energyData` change every time). That
  // makes useSyncExternalStore's getSnapshot return a new value on every render
  // → React #185 "Maximum update depth exceeded" the moment this panel mounts.
  // This was the real cause of the Power User Mode crash.
  const { energyData, connected } = useAppStoreShallow((s) => ({
    energyData: s.energyData,
    connected: s.connected,
  }));
  const { families, health, lastUpdated, error } = useMetrics(5000);

  const get = (name: string, labels?: Record<string, string>) =>
    getMetricFromSnapshot(families, name, labels);

  const metrics = extractEnergyMetrics(get, energyData, health);
  const statuses = calculateStatuses(
    metrics.gridPower,
    metrics.batterySoC,
    metrics.voltage,
    metrics.price,
  );
  const adapters = buildCoreAdapters(t);
  const contribAdapters = buildContribAdapters(t);
  const metricCards = buildMetricCards(
    t,
    {
      pvPower: metrics.pvPower,
      gridPower: metrics.gridPower,
      batteryPower: metrics.batteryPower,
      batterySoC: metrics.batterySoC,
      houseLoad: metrics.houseLoad,
      evPower: metrics.evPower,
      heatPump: metrics.heatPump,
      voltage: metrics.voltage,
      price: metrics.price,
      connections: health.connections,
    },
    statuses,
  );
  const alertRules = buildAlertRules(t, {
    gridPower: metrics.gridPower,
    batterySoC: metrics.batterySoC,
    connected,
    price: metrics.price,
    voltage: metrics.voltage,
    pvPower: metrics.pvPower,
  });

  return {
    t,
    error,
    uptime: metrics.uptime,
    lastUpdated,
    connected,
    activeAlerts: alertRules.filter((rule) => rule.active).length,
    metricCards,
    loadHistory: generateSystemLoadHistory(metrics.houseLoad),
    cpuUsage: 18 + (metrics.houseLoad % 30),
    memUsage: 52 + (metrics.pvPower % 15),
    diskUsage: 34,
    networkIO: Math.round(metrics.pvPower / 100 + metrics.gridPower / 200),
    adapters,
    contribAdapters,
    get,
    alertRules,
    eventLog: buildEventLog(t),
  };
}
