/**
 * @module ha-role-resolver
 * Map Home Assistant entities to backend energy roles and metric types.
 */

import type { EnergyRole, MetricType } from '@nexus-hems/shared-types';

/** Static entity mapping loaded from ha-entity-map.json. */
export interface HAEntityMapping {
  entityId: string;
  metric: MetricType;
  role: EnergyRole;
  /** Optional numeric scale factor (default 1). */
  scale?: number;
}

/** Resolved mapping for a single HA entity state update. */
export interface HARoleResolution {
  metric: MetricType;
  role: EnergyRole;
  scale: number;
}

const DEVICE_CLASS_ROLE: Record<string, { role: EnergyRole; metric: MetricType }> = {
  solar_power: { role: 'pv', metric: 'POWER_W' },
  solar_energy: { role: 'pv', metric: 'ENERGY_KWH' },
  pv_power: { role: 'pv', metric: 'POWER_W' },
  battery_power: { role: 'battery', metric: 'POWER_W' },
  battery_charging_power: { role: 'battery', metric: 'POWER_W' },
  battery_soc: { role: 'battery', metric: 'SOC_PERCENT' },
  grid_power: { role: 'grid', metric: 'POWER_W' },
  net_meter_power: { role: 'grid', metric: 'POWER_W' },
  house_power: { role: 'load', metric: 'POWER_W' },
  home_consumption: { role: 'load', metric: 'POWER_W' },
  ev_power: { role: 'ev', metric: 'POWER_W' },
  wallbox_power: { role: 'ev', metric: 'POWER_W' },
  heat_pump_power: { role: 'heatpump', metric: 'POWER_W' },
};

const ENTITY_ID_KEYWORDS: { keywords: string[]; role: EnergyRole; metric: MetricType }[] = [
  { keywords: ['solar', 'pv'], role: 'pv', metric: 'POWER_W' },
  { keywords: ['battery', 'bat'], role: 'battery', metric: 'POWER_W' },
  { keywords: ['soc'], role: 'battery', metric: 'SOC_PERCENT' },
  { keywords: ['house', 'home', 'total', 'consumption'], role: 'load', metric: 'POWER_W' },
  { keywords: ['grid', 'net'], role: 'grid', metric: 'POWER_W' },
  { keywords: ['wallbox', 'ev', 'charger'], role: 'ev', metric: 'POWER_W' },
  { keywords: ['heat', 'pump', 'hvac'], role: 'heatpump', metric: 'POWER_W' },
];

/**
 * Resolve an entity to a backend role using static map first, then heuristics.
 */
export function resolveHAEntityRole(
  entityId: string,
  deviceClass: string,
  unit: string,
  staticMap: Map<string, HAEntityMapping>,
): HARoleResolution | null {
  const mapped = staticMap.get(entityId);
  if (mapped) {
    return { metric: mapped.metric, role: mapped.role, scale: mapped.scale ?? 1 };
  }

  const byClass = DEVICE_CLASS_ROLE[deviceClass];
  if (byClass) {
    return { ...byClass, scale: unit === 'kW' ? 1000 : 1 };
  }

  const lower = entityId.toLowerCase();
  for (const entry of ENTITY_ID_KEYWORDS) {
    if (entry.keywords.some((kw) => lower.includes(kw))) {
      return { role: entry.role, metric: entry.metric, scale: unit === 'kW' ? 1000 : 1 };
    }
  }

  return null;
}

/**
 * Parse HA state string to a finite numeric value (kW → W when needed).
 */
export function parseHANumericState(
  state: string,
  unit: string,
  metric: MetricType,
  scale: number,
): number | null {
  const parsed = Number.parseFloat(state);
  if (!Number.isFinite(parsed)) return null;

  if (unit === 'kW' && metric === 'POWER_W') {
    return parsed * 1000 * scale;
  }
  if (unit === 'kWh' && metric === 'ENERGY_KWH') {
    return parsed * scale;
  }
  return parsed * scale;
}
