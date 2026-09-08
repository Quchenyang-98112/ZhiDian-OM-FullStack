import type { WSCommandType } from '@nexus-hems/shared-types';
import { WSCommandTypeSchema } from '@nexus-hems/shared-types';
import type { JWTScope } from '../middleware/auth.js';

/**
 * Minimum JWT scope required per WebSocket command type (HIGH-11).
 * Every variant in `WSCommandTypeSchema` must appear here — enforced by unit test.
 */
export const SCOPE_COMMAND_MAP: Record<WSCommandType, JWTScope> = {
  SET_EV_POWER: 'readwrite',
  SET_HEAT_PUMP_POWER: 'readwrite',
  SET_BATTERY_POWER: 'readwrite',
  SET_EV_CURRENT: 'readwrite',
  START_CHARGING: 'readwrite',
  STOP_CHARGING: 'readwrite',
  SET_V2X_DISCHARGE: 'readwrite',
  SET_HEAT_PUMP_MODE: 'readwrite',
  SET_BATTERY_MODE: 'readwrite',
  SET_GRID_LIMIT: 'admin',
  KNX_TOGGLE_LIGHTS: 'readwrite',
  KNX_SET_TEMPERATURE: 'readwrite',
  KNX_TOGGLE_WINDOW: 'readwrite',
};

export const SCOPE_ORDER: Record<JWTScope, number> = { read: 0, readwrite: 1, admin: 2 };

export function getRequiredScopeForCommand(commandType: string): JWTScope | undefined {
  if (!(commandType in SCOPE_COMMAND_MAP)) return undefined;
  return SCOPE_COMMAND_MAP[commandType as WSCommandType];
}

export function isScopeAuthorized(clientScope: JWTScope, commandType: string): boolean {
  const required = getRequiredScopeForCommand(commandType);
  if (!required) return false;
  return SCOPE_ORDER[clientScope] >= SCOPE_ORDER[required];
}

/** Fail CI if a new WS command type is added without a scope mapping. */
export function assertScopeMapExhaustive(): void {
  for (const commandType of WSCommandTypeSchema.options) {
    if (!(commandType in SCOPE_COMMAND_MAP)) {
      throw new Error(`SCOPE_COMMAND_MAP missing entry for ${commandType}`);
    }
  }
}

assertScopeMapExhaustive();
