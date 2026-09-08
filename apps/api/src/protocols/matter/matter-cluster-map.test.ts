import { describe, expect, it } from 'vitest';
import {
  MATTER_CLUSTER,
  type MatterNodeMapping,
  parseMatterNumericValue,
  resolveMatterAttribute,
} from './matter-cluster-map.js';

describe('matter-cluster-map', () => {
  const staticMap = new Map<number, MatterNodeMapping>([[42, { nodeId: 42, role: 'grid' }]]);

  it('maps EPM activePower from milliwatts to watts', () => {
    const resolution = resolveMatterAttribute(
      {
        nodeId: 42,
        cluster: MATTER_CLUSTER.EPM,
        attribute: 'activePower',
        value: 2_500_000,
      },
      staticMap,
    );
    expect(resolution).toEqual({ metric: 'POWER_W', role: 'grid', scale: 0.001 });
    expect(parseMatterNumericValue(2_500_000, resolution!)).toBe(2500);
  });

  it('maps EEM cumulativeEnergyImported from milliwatt-hours to kWh', () => {
    const resolution = resolveMatterAttribute(
      {
        nodeId: 42,
        cluster: MATTER_CLUSTER.EEM,
        attribute: 'cumulativeEnergyImported',
        value: 5_000_000,
      },
      staticMap,
    );
    expect(resolution?.metric).toBe('ENERGY_KWH');
    expect(parseMatterNumericValue(5_000_000, resolution!)).toBe(5);
  });

  it('maps legacy electrical measurement activePower directly', () => {
    const resolution = resolveMatterAttribute(
      {
        nodeId: 7,
        cluster: MATTER_CLUSTER.ELECTRICAL_MEASUREMENT,
        attribute: 'activePower',
        value: 900,
      },
      staticMap,
    );
    expect(resolution?.metric).toBe('POWER_W');
    expect(parseMatterNumericValue(900, resolution!)).toBe(900);
  });
});
