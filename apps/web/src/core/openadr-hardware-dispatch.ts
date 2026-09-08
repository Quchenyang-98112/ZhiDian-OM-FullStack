/**
 * OpenADR Hardware Dispatch — translates active DR events into hardware commands.
 *
 * Called by OpenADR31Adapter when LOAD_CONTROL or SIMPLE events change aggregate state.
 * Dispatches SET_HEAT_PUMP_MODE / SET_HEAT_PUMP_POWER / SET_EV_POWER to connected adapters.
 */

import type { ActiveDREvent } from './adapters/contrib/openadr-3-1';
import type { AdapterCommand } from './adapters/EnergyAdapter';
import { sendAdapterCommand } from './useEnergyStore';

interface DispatchSnapshot {
  sgReadyMode?: number;
  evMaxPowerW?: number;
  hvacMaxPowerW?: number;
}

let lastSnapshot: DispatchSnapshot = {};

/** @internal Test helper */
export function resetOpenADRHardwareDispatchState(): void {
  lastSnapshot = {};
}

function snapshotFromEvent(event: ActiveDREvent): DispatchSnapshot {
  const snap: DispatchSnapshot = {};

  if (event.eventType === 'SIMPLE' && event.simpleLevel !== undefined) {
    snap.sgReadyMode = Math.min(4, Math.max(1, event.simpleLevel + 1));
  }

  if (event.eventType === 'LOAD_CONTROL') {
    if (event.evMaxPowerW !== undefined) snap.evMaxPowerW = event.evMaxPowerW;
    if (event.hvacMaxPowerW !== undefined) snap.hvacMaxPowerW = event.hvacMaxPowerW;
  }

  return snap;
}

function commandsFromSnapshot(snap: DispatchSnapshot): AdapterCommand[] {
  const commands: AdapterCommand[] = [];

  if (snap.sgReadyMode !== undefined) {
    commands.push({ type: 'SET_HEAT_PUMP_MODE', value: snap.sgReadyMode });
  }
  if (snap.hvacMaxPowerW !== undefined) {
    commands.push({ type: 'SET_HEAT_PUMP_POWER', value: snap.hvacMaxPowerW });
  }
  if (snap.evMaxPowerW !== undefined) {
    commands.push({ type: 'SET_EV_POWER', value: snap.evMaxPowerW });
  }

  return commands;
}

function snapshotChanged(a: DispatchSnapshot, b: DispatchSnapshot): boolean {
  return (
    a.sgReadyMode !== b.sgReadyMode ||
    a.evMaxPowerW !== b.evMaxPowerW ||
    a.hvacMaxPowerW !== b.hvacMaxPowerW
  );
}

/**
 * Dispatch hardware commands for a single DR event when values change.
 */
export async function dispatchOpenADRHardwareActions(event: ActiveDREvent): Promise<number> {
  const snap = snapshotFromEvent(event);
  if (!snapshotChanged(lastSnapshot, snap)) return 0;

  let accepted = 0;
  for (const command of commandsFromSnapshot(snap)) {
    const ok = await sendAdapterCommand(command);
    if (ok) accepted++;
  }

  if (accepted > 0) {
    lastSnapshot = { ...snap };
  }
  return accepted;
}

/**
 * Dispatch aggregate DR state rebuilt from all active events.
 */
export async function dispatchOpenADRAggregateState(state: {
  sgReady?: 1 | 2 | 3 | 4;
  evMaxPowerW?: number;
  hvacMaxPowerW?: number;
}): Promise<number> {
  const snap: DispatchSnapshot = {
    ...(state.sgReady !== undefined ? { sgReadyMode: state.sgReady } : {}),
    ...(state.evMaxPowerW !== undefined ? { evMaxPowerW: state.evMaxPowerW } : {}),
    ...(state.hvacMaxPowerW !== undefined ? { hvacMaxPowerW: state.hvacMaxPowerW } : {}),
  };

  if (!snapshotChanged(lastSnapshot, snap)) return 0;

  let accepted = 0;
  for (const command of commandsFromSnapshot(snap)) {
    const ok = await sendAdapterCommand(command);
    if (ok) accepted++;
  }

  if (accepted > 0) {
    lastSnapshot = { ...snap };
  }
  return accepted;
}
