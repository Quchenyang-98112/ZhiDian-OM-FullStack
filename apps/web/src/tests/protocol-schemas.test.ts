/**
 * protocol-schemas.test.ts — Property-based fuzz tests for Zod protocol schemas
 *
 * Uses fast-check to generate arbitrary data and verifies that Zod schemas
 * reject invalid inputs (type safety at runtime boundary) and accept valid ones.
 */

import {
  type EnergyData,
  EnergyDataSchema,
  SET_EV_POWER_ERROR,
  WSCommandSchema,
} from '@nexus-hems/shared-types';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

// ── Helpers ────────────────────────────────────────────────────────────────

/** Generates valid EnergyData using fast-check */
const validEnergyDataArb = fc.record<EnergyData>({
  gridPower: fc.float({ min: -50_000, max: 50_000, noNaN: true, noDefaultInfinity: true }),
  pvPower: fc.float({ min: 0, max: 50_000, noNaN: true, noDefaultInfinity: true }),
  batteryPower: fc.float({ min: -30_000, max: 30_000, noNaN: true, noDefaultInfinity: true }),
  houseLoad: fc.float({ min: 0, max: 100_000, noNaN: true, noDefaultInfinity: true }),
  batterySoC: fc.float({ min: 0, max: 100, noNaN: true, noDefaultInfinity: true }),
  heatPumpPower: fc.float({ min: 0, max: 20_000, noNaN: true, noDefaultInfinity: true }),
  evPower: fc.float({ min: 0, max: 22_000, noNaN: true, noDefaultInfinity: true }),
  gridVoltage: fc.float({ min: 0, max: 600, noNaN: true, noDefaultInfinity: true }),
  batteryVoltage: fc.float({ min: 0, max: 800, noNaN: true, noDefaultInfinity: true }),
  pvYieldToday: fc.float({ min: 0, max: 1_000, noNaN: true, noDefaultInfinity: true }),
  priceCurrent: fc.float({ min: -2, max: 5, noNaN: true, noDefaultInfinity: true }),
});

describe('EnergyDataSchema — property-based', () => {
  it('accepts all valid EnergyData objects', () => {
    fc.assert(
      fc.property(validEnergyDataArb, (data) => {
        const result = EnergyDataSchema.safeParse(data);
        return result.success;
      }),
      { numRuns: 500 },
    );
  });

  it('rejects NaN in any numeric field', () => {
    fc.assert(
      fc.property(
        validEnergyDataArb,
        fc.constantFrom(
          'gridPower',
          'pvPower',
          'batteryPower',
          'houseLoad',
          'batterySoC',
          'heatPumpPower',
          'evPower',
          'gridVoltage',
          'batteryVoltage',
          'pvYieldToday',
          'priceCurrent',
        ),
        (data, field) => {
          const corrupted = { ...data, [field]: Number.NaN };
          return !EnergyDataSchema.safeParse(corrupted).success;
        },
      ),
      { numRuns: 200 },
    );
  });

  it('rejects Infinity in any numeric field', () => {
    fc.assert(
      fc.property(
        validEnergyDataArb,
        fc.constantFrom('gridPower', 'pvPower', 'batteryPower', 'houseLoad'),
        fc.constantFrom(Infinity, -Infinity),
        (data, field, badValue) => {
          const corrupted = { ...data, [field]: badValue };
          return !EnergyDataSchema.safeParse(corrupted).success;
        },
      ),
      { numRuns: 100 },
    );
  });

  it('rejects batterySoC outside [0, 100]', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.float({ min: -1000, max: Math.fround(-0.001), noNaN: true, noDefaultInfinity: true }),
          fc.float({ min: Math.fround(100.001), max: 1000, noNaN: true, noDefaultInfinity: true }),
        ),
        (badSoC) => {
          const result = EnergyDataSchema.safeParse({
            gridPower: 0,
            pvPower: 0,
            batteryPower: 0,
            houseLoad: 0,
            batterySoC: badSoC,
            heatPumpPower: 0,
            evPower: 0,
            gridVoltage: 230,
            batteryVoltage: 48,
            pvYieldToday: 0,
            priceCurrent: 0.25,
          });
          return !result.success;
        },
      ),
      { numRuns: 100 },
    );
  });

  it('rejects non-object payloads', async () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.string(),
          fc.integer(),
          fc.boolean(),
          fc.constant(null),
          fc.constant(undefined),
          fc.array(fc.integer()),
        ),
        (badPayload) => {
          return !EnergyDataSchema.safeParse(badPayload).success;
        },
      ),
      { numRuns: 200 },
    );
  });

  it('rejects string values for numeric fields', () => {
    fc.assert(
      fc.property(fc.string(), (badValue) => {
        const result = EnergyDataSchema.safeParse({
          gridPower: badValue,
          pvPower: 0,
          batteryPower: 0,
          houseLoad: 0,
          batterySoC: 50,
          heatPumpPower: 0,
          evPower: 0,
          gridVoltage: 230,
          batteryVoltage: 48,
          pvYieldToday: 0,
          priceCurrent: 0.25,
        });
        return !result.success;
      }),
      { numRuns: 100 },
    );
  });
});

describe('WSCommandSchema — property-based', () => {
  // Non-power commands with type-appropriate values
  it('accepts valid ws commands', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.record({ type: fc.constant('KNX_TOGGLE_LIGHTS' as const), value: fc.boolean() }),
          fc.record({ type: fc.constant('KNX_TOGGLE_WINDOW' as const), value: fc.boolean() }),
          fc.record({
            type: fc.constant('SET_BATTERY_MODE' as const),
            value: fc.oneof(
              fc.constant('auto'),
              fc.constant('self-consumption'),
              fc.constant('charge'),
              fc.constant('discharge'),
            ),
          }),
          fc.record({
            type: fc.constant('SET_HEAT_PUMP_MODE' as const),
            value: fc.integer({ min: 1, max: 4 }),
          }),
          fc.record({
            type: fc.constant('SET_EV_CURRENT' as const),
            value: fc.integer({ min: 0, max: 80 }),
          }),
          // START/STOP accept boolean or any finite number — no upper cap in WSCommandSchema
          fc.record({
            type: fc.constant('START_CHARGING' as const),
            value: fc.oneof(fc.boolean(), fc.integer()),
          }),
          fc.record({
            type: fc.constant('STOP_CHARGING' as const),
            value: fc.oneof(fc.boolean(), fc.integer()),
          }),
        ),
        (cmd) => {
          const result = WSCommandSchema.safeParse(cmd);
          return result.success;
        },
      ),
      { numRuns: 200 },
    );
  });

  it('rejects fractional SET_HEAT_PUMP_MODE', () => {
    expect(WSCommandSchema.safeParse({ type: 'SET_HEAT_PUMP_MODE', value: 2.5 }).success).toBe(
      false,
    );
  });

  it('rejects SET_EV_CURRENT above 80 A', () => {
    expect(WSCommandSchema.safeParse({ type: 'SET_EV_CURRENT', value: 81 }).success).toBe(false);
  });

  it('rejects SET_EV_POWER above 22 kW', () => {
    const result = WSCommandSchema.safeParse({ type: 'SET_EV_POWER', value: 22_001 });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.message === SET_EV_POWER_ERROR)).toBe(true);
    }
  });

  it('rejects NaN for actuator numeric commands', () => {
    expect(
      WSCommandSchema.safeParse({ type: 'SET_BATTERY_POWER', value: Number.NaN }).success,
    ).toBe(false);
    expect(
      WSCommandSchema.safeParse({ type: 'KNX_SET_TEMPERATURE', value: Number.NaN }).success,
    ).toBe(false);
  });

  it('rejects missing type field', () => {
    fc.assert(
      fc.property(
        fc.dictionary(fc.string({ minLength: 1, maxLength: 20 }), fc.jsonValue()),
        (obj) => {
          const noType = { ...obj };
          delete (noType as Record<string, unknown>).type;
          return !WSCommandSchema.safeParse(noType).success;
        },
      ),
      { numRuns: 100 },
    );
  });

  it('rejects non-string type values', () => {
    fc.assert(
      fc.property(fc.oneof(fc.integer(), fc.boolean(), fc.constant(null)), (badType) => {
        return !WSCommandSchema.safeParse({ type: badType, payload: {} }).success;
      }),
      { numRuns: 100 },
    );
  });
});
