/**
 * useLegacySendCommand — Backward-compatible wrapper
 *
 * Bridges the old `sendCommand(type: CommandType, value: number)` API
 * to useSafeCommand with confirmation dialogs, validation, and audit trail.
 *
 * Usage: Drop-in replacement for `useWebSocket().sendCommand` in pages
 * that still use ControlPanel with the legacy signature.
 * Render `<ConfirmationDialog />` in the component tree.
 */

import type { CommandType } from '../types';
import type { AdapterCommand } from './adapters/EnergyAdapter';
import { useSafeCommand } from './useSafeCommand';

/** Map legacy CommandType to AdapterCommand */
function toLegacyCommand(type: CommandType, value: number): AdapterCommand {
  const mapping: Record<CommandType, AdapterCommand> = {
    SET_EV_POWER: { type: 'SET_EV_POWER', value },
    SET_HEAT_PUMP_MODE: { type: 'SET_HEAT_PUMP_MODE', value },
    SET_HEAT_PUMP_POWER: { type: 'SET_HEAT_PUMP_POWER', value },
    SET_BATTERY_POWER: { type: 'SET_BATTERY_POWER', value },
    TOGGLE_KNX_LIGHTS: { type: 'KNX_TOGGLE_LIGHTS', value: value === 1 },
    TOGGLE_KNX_WINDOW: { type: 'KNX_TOGGLE_WINDOW', value: value === 1 },
    SET_ROOM_TEMPERATURE: { type: 'KNX_SET_TEMPERATURE', value },
  };
  return mapping[type] ?? { type: 'SET_EV_POWER', value };
}

export function useLegacySendCommand() {
  const { execute, pending, lastError, ConfirmationDialog } = useSafeCommand();

  const sendCommand = (type: CommandType, value: number) => {
    execute(toLegacyCommand(type, value));
  };

  return { sendCommand, pending, lastError, ConfirmationDialog };
}
