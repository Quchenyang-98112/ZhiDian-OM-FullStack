/**
 * @module matter-cluster-map
 * Map Matter cluster attributes to backend energy metrics and roles.
 */

import type { EnergyRole, MetricType } from '@nexus-hems/shared-types';

export const MATTER_CLUSTER = {
  ELECTRICAL_MEASUREMENT: 0x0b04,
  SIMPLE_METERING: 0x0702,
  EPM: 0x0090,
  EEM: 0x0091,
} as const;

/** Static node mapping loaded from matter-node-map.json. */
export interface MatterNodeMapping {
  nodeId: number;
  role: EnergyRole;
  /** Optional numeric scale factor (default 1). */
  scale?: number;
}

export interface MatterAttributeUpdate {
  nodeId: number;
  cluster: number;
  attribute: string;
  value: number;
}

export interface MatterMetricResolution {
  metric: MetricType;
  role: EnergyRole;
  scale: number;
}

const DEFAULT_ROLE: EnergyRole = 'load';

/**
 * Resolve metric + role for a Matter attribute update.
 */
export function resolveMatterAttribute(
  update: MatterAttributeUpdate,
  staticMap: Map<number, MatterNodeMapping>,
): MatterMetricResolution | null {
  const mapped = staticMap.get(update.nodeId);
  const role = mapped?.role ?? DEFAULT_ROLE;
  const scale = mapped?.scale ?? 1;

  if (
    update.cluster === MATTER_CLUSTER.ELECTRICAL_MEASUREMENT &&
    update.attribute === 'activePower'
  ) {
    return { metric: 'POWER_W', role, scale };
  }
  if (update.cluster === MATTER_CLUSTER.EPM && update.attribute === 'activePower') {
    return { metric: 'POWER_W', role, scale: scale / 1000 };
  }
  if (
    update.cluster === MATTER_CLUSTER.SIMPLE_METERING &&
    update.attribute === 'currentSummationDelivered'
  ) {
    return { metric: 'ENERGY_KWH', role, scale };
  }
  if (update.cluster === MATTER_CLUSTER.EEM && update.attribute === 'cumulativeEnergyImported') {
    return { metric: 'ENERGY_KWH', role, scale: scale / 1_000_000 };
  }

  return null;
}

/**
 * Convert raw Matter attribute value to a backend numeric value.
 */
export function parseMatterNumericValue(value: number, resolution: MatterMetricResolution): number {
  return value * resolution.scale;
}
