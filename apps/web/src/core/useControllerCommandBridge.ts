/**
 * useControllerCommandBridge — runs ControllerPipeline on an interval and dispatches outputs.
 *
 * Exposed as a start/stop function (not a hook) so App bootstrap can dynamic-import this
 * module and keep energy-controllers out of the App Entry chunk.
 */

import { isReadOnlyModeActive } from '../lib/adapter-mode';
import { useAppStore } from '../store';
import { dispatchControllerOutputs } from './controller-command-bridge';
import { controllerPipeline } from './energy-controllers';
import { useEnergyStoreBase } from './useEnergyStore';

const CONTROLLER_LOOP_MS = 5_000;

let dispatchInFlight = false;

function legacyEnergyFromStore(): import('../types').EnergyData {
  const unified = useEnergyStoreBase.getState().unified;
  const appEnergy = useAppStore.getState().energyData;
  return {
    gridPower: unified.grid.powerW ?? appEnergy.gridPower,
    pvPower: unified.pv.totalPowerW ?? appEnergy.pvPower,
    batteryPower: unified.battery.powerW ?? appEnergy.batteryPower,
    houseLoad: unified.load.totalPowerW ?? appEnergy.houseLoad,
    batterySoC: unified.battery.socPercent ?? appEnergy.batterySoC,
    heatPumpPower: unified.load.heatPumpPowerW ?? appEnergy.heatPumpPower,
    evPower: unified.load.evPowerW ?? appEnergy.evPower,
    gridVoltage: unified.grid.voltageV ?? appEnergy.gridVoltage,
    batteryVoltage: unified.battery.voltageV ?? appEnergy.batteryVoltage,
    pvYieldToday: unified.pv.yieldTodayKWh ?? appEnergy.pvYieldToday,
    priceCurrent: unified.tariff?.currentPriceEurKWh ?? appEnergy.priceCurrent,
    ...(appEnergy.evSocPercent !== undefined ? { evSocPercent: appEnergy.evSocPercent } : {}),
    ...(appEnergy.evMaxDischargePowerW !== undefined
      ? { evMaxDischargePowerW: appEnergy.evMaxDischargePowerW }
      : {}),
    ...(appEnergy.evDisabledBy14a !== undefined
      ? { evDisabledBy14a: appEnergy.evDisabledBy14a }
      : {}),
  };
}

/** Start the controller command loop; returns a cleanup function. */
export function startControllerCommandBridge(): () => void {
  const intervalId = setInterval(() => {
    if (isReadOnlyModeActive() || dispatchInFlight) return;

    dispatchInFlight = true;
    void (async () => {
      try {
        const settings = useAppStore.getState().settings;
        const data = legacyEnergyFromStore();
        const output = controllerPipeline.run(data, settings);
        await dispatchControllerOutputs(output);
      } finally {
        dispatchInFlight = false;
      }
    })();
  }, CONTROLLER_LOOP_MS);

  return () => clearInterval(intervalId);
}
