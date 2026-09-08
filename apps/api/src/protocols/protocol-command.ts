/**
 * Backend protocol command dispatch — shared types for live hardware control.
 *
 * Phase 5: bridges validated WS commands to command-capable IProtocolAdapter
 * instances (OCPP CSMS, OpenEMS, Home Assistant WS/MQTT). HA MQTT service publish
 * shipped in Phase 6.
 */

import {
  BatteryPowerValueSchema,
  EvCurrentValueSchema,
  EvPowerValueSchema,
  HEAT_PUMP_MODE_ERROR,
  HeatPumpModeValueSchema,
  MAX_BATTERY_POWER_W,
  MAX_EV_CURRENT_A,
  MAX_EV_POWER_W,
  SET_BATTERY_POWER_ERROR,
  SET_EV_CURRENT_ERROR,
  SET_EV_POWER_ERROR,
  WSCommandSchema,
  type WSCommandType,
} from '@nexus-hems/shared-types';
import { z } from 'zod';

export {
  BatteryPowerValueSchema,
  EvCurrentValueSchema,
  EvPowerValueSchema,
  HEAT_PUMP_MODE_ERROR,
  HeatPumpModeValueSchema,
  MAX_BATTERY_POWER_W,
  MAX_EV_CURRENT_A,
  MAX_EV_POWER_W,
  SET_BATTERY_POWER_ERROR,
  SET_EV_CURRENT_ERROR,
  SET_EV_POWER_ERROR,
};
/** V2X discharge power in watts (aligns with frontend command-safety 25 kW cap). */
export const EvDischargeValueSchema = z.number().finite().min(0).max(MAX_BATTERY_POWER_W);
/** OCPP §14a grid limit in watts (frontend OCPP21Adapter uses W; min 100 W avoids kW ambiguity). */
export const OcppGridLimitWattsSchema = z.number().finite().min(100).max(MAX_BATTERY_POWER_W);
/** OpenEMS ESS mode aliases accepted at the protocol boundary. */
export const BatteryModeValueSchema = z.union([z.literal('charge'), z.literal('discharge')]);
/** Peak-shaving limit in kW (OpenEMS maps ×1000 → watts). */
export const GridLimitValueSchema = z.number().finite().min(0).max(25);
/** HA entity id for SG Ready writes — must not be climate (hvac_mode is string-based). */
export const HeatPumpModeEntityIdSchema = z
  .string()
  .trim()
  .min(1)
  .refine((entityId) => {
    const dot = entityId.indexOf('.');
    if (dot <= 0 || dot >= entityId.length - 1) return false;
    const domain = entityId.slice(0, dot);
    const objectId = entityId.slice(dot + 1);
    return (
      objectId.length > 0 &&
      (domain === 'number' || domain === 'input_number' || domain === 'select')
    );
  }, 'HA_HEAT_PUMP_MODE_ENTITY must be a full domain.entity_id (number, input_number, or select) for SG Ready modes 1–4');
/** Mains voltage for SET_EV_POWER→amps conversion (typical EU: 230 V). */
export const MainsVoltageSchema = z.coerce.number().finite().positive();

/** Parse HA_WALLBOX_MAINS_VOLTAGE; returns undefined when unset or invalid. */
export function parseOptionalMainsVoltageEnv(raw: string | undefined): number | undefined {
  if (!raw?.trim()) return undefined;
  const parsed = MainsVoltageSchema.safeParse(raw.trim());
  return parsed.success ? parsed.data : undefined;
}

export const ProtocolCommandRequestSchema = WSCommandSchema.and(
  z.object({
    chargePointId: z.string().trim().min(1).max(128).optional(),
  }),
).superRefine((cmd, ctx) => {
  if (cmd.type === 'SET_EV_POWER' && !EvPowerValueSchema.safeParse(cmd.value).success) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: SET_EV_POWER_ERROR,
    });
  }
  if (cmd.type === 'SET_EV_CURRENT' && !EvCurrentValueSchema.safeParse(cmd.value).success) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: SET_EV_CURRENT_ERROR,
    });
  }
  if (cmd.type === 'SET_BATTERY_POWER' && !BatteryPowerValueSchema.safeParse(cmd.value).success) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: SET_BATTERY_POWER_ERROR,
    });
  }
  if (cmd.type === 'SET_BATTERY_MODE' && !BatteryModeValueSchema.safeParse(cmd.value).success) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'SET_BATTERY_MODE requires charge or discharge',
    });
  }
  if (cmd.type === 'SET_GRID_LIMIT') {
    const kWOk = GridLimitValueSchema.safeParse(cmd.value).success;
    const wattsOk = OcppGridLimitWattsSchema.safeParse(cmd.value).success;
    if (!kWOk && !wattsOk) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'SET_GRID_LIMIT requires 0–25 kW (OpenEMS) or 100–25000 W (OCPP §14a)',
      });
    }
  }
  if (cmd.type === 'SET_V2X_DISCHARGE' && !EvDischargeValueSchema.safeParse(cmd.value).success) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'SET_V2X_DISCHARGE requires a finite wattage between 0 and 25000',
    });
  }
  if (cmd.type === 'SET_HEAT_PUMP_MODE' && !HeatPumpModeValueSchema.safeParse(cmd.value).success) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: HEAT_PUMP_MODE_ERROR,
    });
  }
});
export type ValidatedProtocolCommandRequest = z.infer<typeof ProtocolCommandRequestSchema>;

export interface ProtocolCommandRequest {
  type: WSCommandType;
  value: number | string | boolean;
  /** OCPP CSMS: target charge point id when multiple sessions are connected. */
  chargePointId?: string;
}

export function validateProtocolCommandRequest(
  command: ProtocolCommandRequest,
): { valid: true; command: ValidatedProtocolCommandRequest } | { valid: false; error: string } {
  const parsed = ProtocolCommandRequestSchema.safeParse(command);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { valid: false, error: issue?.message ?? 'Invalid protocol command' };
  }
  return { valid: true, command: parsed.data };
}

export interface ProtocolCommandResult {
  /** True when a registered handler recognized the command type. */
  handled: boolean;
  /** True when the handler accepted and forwarded the command. */
  success: boolean;
  /** Adapter id that handled the command (when handled). */
  adapterId?: string;
  error?: string;
}

/** Optional capability mixed into backend protocol adapters. */
export interface IProtocolCommandHandler {
  supportsCommand(type: WSCommandType): boolean;
  sendCommand(command: ProtocolCommandRequest): Promise<ProtocolCommandResult>;
}

export function isProtocolCommandHandler(adapter: unknown): adapter is IProtocolCommandHandler {
  if (adapter === null || typeof adapter !== 'object') return false;
  const candidate = adapter as IProtocolCommandHandler;
  return (
    typeof candidate.supportsCommand === 'function' && typeof candidate.sendCommand === 'function'
  );
}
