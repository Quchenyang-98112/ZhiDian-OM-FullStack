/**
 * Controller Command Bridge — dispatches merged ControllerPipeline outputs to hardware.
 *
 * Maps controller outputs (sgReadyMode, essPowerW, evCurrentA) to AdapterCommand types
 * and sends them via sendAdapterCommand. Tracks last-dispatched values to avoid
 * oscillation spam (minimum interval per command type).
 */

import type { AdapterCommand } from './adapters/EnergyAdapter';
import type { ControllerOutput } from './energy-controllers';
import { sendAdapterCommand } from './useEnergyStore';

const MIN_DISPATCH_INTERVAL_MS = 60_000;

interface DispatchState {
  sgReadyMode?: number;
  essPowerW?: number;
  evCurrentA?: number;
  lastSgReadyAt: number;
  lastEssAt: number;
  lastEvAt: number;
}

const state: DispatchState = {
  lastSgReadyAt: 0,
  lastEssAt: 0,
  lastEvAt: 0,
};

/** @internal Test helper — resets debounce state. */
export function resetControllerCommandBridgeState(): void {
  delete state.sgReadyMode;
  delete state.essPowerW;
  delete state.evCurrentA;
  state.lastSgReadyAt = 0;
  state.lastEssAt = 0;
  state.lastEvAt = 0;
}

function commandsFromOutput(output: ControllerOutput): AdapterCommand[] {
  const commands: AdapterCommand[] = [];

  if (output.sgReadyMode !== undefined) {
    commands.push({ type: 'SET_HEAT_PUMP_MODE', value: output.sgReadyMode });
  }
  if (output.essPowerW !== undefined) {
    commands.push({ type: 'SET_BATTERY_POWER', value: output.essPowerW });
  }
  if (output.evCurrentA !== undefined) {
    commands.push({ type: 'SET_EV_CURRENT', value: output.evCurrentA });
  }

  return commands;
}

function shouldDispatch(
  key: 'sgReadyMode' | 'essPowerW' | 'evCurrentA',
  value: number,
  now: number,
): boolean {
  const lastValue = state[key];
  const lastAt =
    key === 'sgReadyMode'
      ? state.lastSgReadyAt
      : key === 'essPowerW'
        ? state.lastEssAt
        : state.lastEvAt;

  if (lastValue === value && now - lastAt < MIN_DISPATCH_INTERVAL_MS) return false;
  return true;
}

/**
 * Dispatch controller pipeline outputs to connected adapters.
 * Returns the number of commands successfully accepted.
 */
export async function dispatchControllerOutputs(output: ControllerOutput): Promise<number> {
  const now = Date.now();
  let accepted = 0;

  for (const command of commandsFromOutput(output)) {
    const key =
      command.type === 'SET_HEAT_PUMP_MODE' && typeof command.value === 'number'
        ? ('sgReadyMode' as const)
        : command.type === 'SET_BATTERY_POWER' && typeof command.value === 'number'
          ? ('essPowerW' as const)
          : command.type === 'SET_EV_CURRENT' && typeof command.value === 'number'
            ? ('evCurrentA' as const)
            : null;

    if (key === null || typeof command.value !== 'number') continue;
    if (!shouldDispatch(key, command.value, now)) continue;

    const ok = await sendAdapterCommand(command);
    if (!ok) continue;

    accepted++;
    state[key] = command.value;
    if (key === 'sgReadyMode') state.lastSgReadyAt = now;
    else if (key === 'essPowerW') state.lastEssAt = now;
    else state.lastEvAt = now;
  }

  return accepted;
}
