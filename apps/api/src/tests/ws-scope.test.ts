import { WSCommandTypeSchema } from '@nexus-hems/shared-types';
import { describe, expect, it } from 'vitest';
import type { JWTScope } from '../middleware/auth.js';
import {
  getRequiredScopeForCommand,
  isScopeAuthorized,
  SCOPE_COMMAND_MAP,
} from '../ws/ws-scope.js';

describe('SCOPE_COMMAND_MAP (HIGH-11)', () => {
  it('covers every WSCommandTypeSchema variant', () => {
    for (const commandType of WSCommandTypeSchema.options) {
      expect(SCOPE_COMMAND_MAP[commandType]).toBeDefined();
    }
  });

  it('requires admin only for SET_GRID_LIMIT', () => {
    expect(SCOPE_COMMAND_MAP.SET_GRID_LIMIT).toBe('admin');
    const adminOnly = Object.entries(SCOPE_COMMAND_MAP).filter(([, scope]) => scope === 'admin');
    expect(adminOnly).toEqual([['SET_GRID_LIMIT', 'admin']]);
  });
});

describe('isScopeAuthorized', () => {
  const cases: [JWTScope, string, boolean][] = [
    ['read', 'SET_EV_POWER', false],
    ['readwrite', 'SET_EV_POWER', true],
    ['admin', 'SET_EV_POWER', true],
    ['read', 'SET_GRID_LIMIT', false],
    ['readwrite', 'SET_GRID_LIMIT', false],
    ['admin', 'SET_GRID_LIMIT', true],
    ['read', 'START_CHARGING', false],
    ['readwrite', 'START_CHARGING', true],
    ['read', 'SET_V2X_DISCHARGE', false],
    ['readwrite', 'SET_V2X_DISCHARGE', true],
    ['read', 'KNX_TOGGLE_LIGHTS', false],
    ['readwrite', 'KNX_SET_TEMPERATURE', true],
    ['read', 'SET_BATTERY_MODE', false],
    ['readwrite', 'SET_HEAT_PUMP_MODE', true],
  ];

  it.each(cases)('scope %s for %s => %s', (scope, cmd, expected) => {
    expect(isScopeAuthorized(scope, cmd)).toBe(expected);
  });

  it('denies unknown command types', () => {
    expect(isScopeAuthorized('admin', 'OPENADR_SUBMIT_OFFER')).toBe(false);
    expect(getRequiredScopeForCommand('NOT_A_COMMAND')).toBeUndefined();
  });
});
