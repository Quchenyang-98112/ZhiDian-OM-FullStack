import {
  HEAT_PUMP_MODE_ERROR,
  MAX_EV_CURRENT_A,
  SET_EV_CURRENT_ERROR,
  SET_EV_POWER_ERROR,
} from '@nexus-hems/shared-types';
import { describe, expect, it } from 'vitest';
import {
  MAX_EV_CURRENT_A as apiMaxEvCurrentA,
  BatteryModeValueSchema,
  BatteryPowerValueSchema,
  GridLimitValueSchema,
  HeatPumpModeEntityIdSchema,
  HeatPumpModeValueSchema,
  isProtocolCommandHandler,
  MainsVoltageSchema,
  parseOptionalMainsVoltageEnv,
  validateProtocolCommandRequest,
} from './protocol-command.js';

describe('validateProtocolCommandRequest', () => {
  it('accepts valid EV power commands', () => {
    const result = validateProtocolCommandRequest({ type: 'SET_EV_POWER', value: 7200 });
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.command).toEqual({ type: 'SET_EV_POWER', value: 7200 });
    }
  });

  it('rejects non-numeric SET_EV_CURRENT values', () => {
    const result = validateProtocolCommandRequest({
      type: 'SET_EV_CURRENT',
      value: '16' as unknown as number,
    });
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toBe(SET_EV_CURRENT_ERROR);
    }
  });

  it('rejects negative SET_EV_POWER values', () => {
    const result = validateProtocolCommandRequest({ type: 'SET_EV_POWER', value: -1 });
    expect(result.valid).toBe(false);
  });

  it('rejects SET_EV_POWER above 22 kW', () => {
    const result = validateProtocolCommandRequest({ type: 'SET_EV_POWER', value: 22_001 });
    expect(result.valid).toBe(false);
  });

  it('rejects SET_EV_CURRENT above 80 A', () => {
    const result = validateProtocolCommandRequest({ type: 'SET_EV_CURRENT', value: 81 });
    expect(result.valid).toBe(false);
  });

  it('accepts optional chargePointId', () => {
    const result = validateProtocolCommandRequest({
      type: 'SET_EV_POWER',
      value: 5000,
      chargePointId: 'cp-1',
    });
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.command.chargePointId).toBe('cp-1');
    }
  });

  it('validates battery power within ±25 kW', () => {
    expect(BatteryPowerValueSchema.safeParse(20_000).success).toBe(true);
    expect(BatteryPowerValueSchema.safeParse(-20_000).success).toBe(true);
    expect(BatteryPowerValueSchema.safeParse(25_001).success).toBe(false);
    expect(BatteryPowerValueSchema.safeParse(-25_001).success).toBe(false);
  });

  it('accepts boolean charging commands', () => {
    const result = validateProtocolCommandRequest({ type: 'START_CHARGING', value: true });
    expect(result.valid).toBe(true);
  });

  it('validates SET_BATTERY_POWER via superRefine', () => {
    expect(validateProtocolCommandRequest({ type: 'SET_BATTERY_POWER', value: 10_000 }).valid).toBe(
      true,
    );
    expect(validateProtocolCommandRequest({ type: 'SET_BATTERY_POWER', value: 26_000 }).valid).toBe(
      false,
    );
  });

  it('validates SET_BATTERY_MODE charge and discharge', () => {
    expect(
      validateProtocolCommandRequest({ type: 'SET_BATTERY_MODE', value: 'charge' }).valid,
    ).toBe(true);
    expect(
      validateProtocolCommandRequest({ type: 'SET_BATTERY_MODE', value: 'discharge' }).valid,
    ).toBe(true);
    expect(
      validateProtocolCommandRequest({ type: 'SET_BATTERY_MODE', value: 'self-consumption' }).valid,
    ).toBe(false);
  });

  it('validates SET_GRID_LIMIT in kW and OCPP watts', () => {
    expect(validateProtocolCommandRequest({ type: 'SET_GRID_LIMIT', value: 4.2 }).valid).toBe(true);
    expect(validateProtocolCommandRequest({ type: 'SET_GRID_LIMIT', value: 4200 }).valid).toBe(
      true,
    );
    expect(validateProtocolCommandRequest({ type: 'SET_GRID_LIMIT', value: -1 }).valid).toBe(false);
    expect(validateProtocolCommandRequest({ type: 'SET_GRID_LIMIT', value: 26 }).valid).toBe(false);
    expect(validateProtocolCommandRequest({ type: 'SET_GRID_LIMIT', value: 50 }).valid).toBe(false);
  });

  it('validates SET_V2X_DISCHARGE wattage', () => {
    expect(validateProtocolCommandRequest({ type: 'SET_V2X_DISCHARGE', value: 5000 }).valid).toBe(
      true,
    );
    expect(validateProtocolCommandRequest({ type: 'SET_V2X_DISCHARGE', value: -1 }).valid).toBe(
      false,
    );
    expect(validateProtocolCommandRequest({ type: 'SET_V2X_DISCHARGE', value: 25_001 }).valid).toBe(
      false,
    );
  });

  it('validates SET_HEAT_PUMP_MODE SG Ready range', () => {
    expect(validateProtocolCommandRequest({ type: 'SET_HEAT_PUMP_MODE', value: 2 }).valid).toBe(
      true,
    );
    expect(validateProtocolCommandRequest({ type: 'SET_HEAT_PUMP_MODE', value: 0 }).valid).toBe(
      false,
    );
    expect(validateProtocolCommandRequest({ type: 'SET_HEAT_PUMP_MODE', value: 5 }).valid).toBe(
      false,
    );
    const fractional = validateProtocolCommandRequest({ type: 'SET_HEAT_PUMP_MODE', value: 2.5 });
    expect(fractional.valid).toBe(false);
    if (!fractional.valid) {
      expect(fractional.error).toBe(HEAT_PUMP_MODE_ERROR);
    }
  });

  it('keeps safety caps aligned with shared-types exports', () => {
    expect(apiMaxEvCurrentA).toBe(MAX_EV_CURRENT_A);
    expect(MAX_EV_CURRENT_A).toBe(80);

    const overCurrent = validateProtocolCommandRequest({ type: 'SET_EV_CURRENT', value: 81 });
    expect(overCurrent.valid).toBe(false);
    if (!overCurrent.valid) {
      expect(overCurrent.error).toBe(SET_EV_CURRENT_ERROR);
    }

    const overPower = validateProtocolCommandRequest({ type: 'SET_EV_POWER', value: 22_001 });
    expect(overPower.valid).toBe(false);
    if (!overPower.valid) {
      expect(overPower.error).toBe(SET_EV_POWER_ERROR);
    }

    const hpSchema = HeatPumpModeValueSchema.safeParse(2.5);
    expect(hpSchema.success).toBe(false);
    if (!hpSchema.success) {
      expect(hpSchema.error.issues[0]?.message).toBe(HEAT_PUMP_MODE_ERROR);
    }
  });

  it('exports value schemas for adapter reuse', () => {
    expect(BatteryModeValueSchema.safeParse('charge').success).toBe(true);
    expect(GridLimitValueSchema.safeParse(25).success).toBe(true);
    expect(HeatPumpModeValueSchema.safeParse(4).success).toBe(true);
    expect(HeatPumpModeEntityIdSchema.safeParse('number.hp_sg_ready').success).toBe(true);
    expect(HeatPumpModeEntityIdSchema.safeParse('number').success).toBe(false);
    expect(HeatPumpModeEntityIdSchema.safeParse('climate.heat_pump').success).toBe(false);
    expect(MainsVoltageSchema.safeParse('230').success).toBe(true);
    expect(MainsVoltageSchema.safeParse('invalid').success).toBe(false);
    expect(parseOptionalMainsVoltageEnv('400')).toBe(400);
    expect(parseOptionalMainsVoltageEnv('not-a-number')).toBeUndefined();
    expect(parseOptionalMainsVoltageEnv(undefined)).toBeUndefined();
  });
});

describe('isProtocolCommandHandler', () => {
  it('returns false for null and non-objects', () => {
    expect(isProtocolCommandHandler(null)).toBe(false);
    expect(isProtocolCommandHandler(undefined)).toBe(false);
    expect(isProtocolCommandHandler('adapter')).toBe(false);
  });

  it('returns false when supportsCommand or sendCommand is missing', () => {
    expect(isProtocolCommandHandler({ supportsCommand: () => true })).toBe(false);
    expect(
      isProtocolCommandHandler({ sendCommand: async () => ({ handled: true, success: true }) }),
    ).toBe(false);
  });

  it('returns true for a full command handler shape', () => {
    const handler = {
      supportsCommand: () => true,
      sendCommand: async () => ({ handled: true, success: true }),
    };
    expect(isProtocolCommandHandler(handler)).toBe(true);
  });
});
