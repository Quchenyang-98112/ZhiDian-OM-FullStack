import { useEnergyContext } from '../../../core/EnergyContext';
import { useAppStoreShallow } from '../../../store';

/**
 * Derives the CommandHub metric values (kW conversions, self-sufficiency, CO₂)
 * from the live energy snapshot + system config. Named to avoid confusion with
 * the Prometheus `useMetrics` in core/useMetrics.
 */
export function useCommandHubMetrics() {
  const { data: energyData, connected } = useEnergyContext();
  const settings = useAppStoreShallow((s) => s.settings);

  const pvKW = energyData.pvPower / 1000;
  const houseKW = energyData.houseLoad / 1000;
  const gridKW = energyData.gridPower / 1000;
  const battKW = energyData.batteryPower / 1000;
  const hpKW = energyData.heatPumpPower / 1000;
  const evKW = energyData.evPower / 1000;

  const gridImport = Math.max(0, energyData.gridPower);
  const selfSufficiency =
    energyData.houseLoad > 0
      ? Math.min(100, ((energyData.houseLoad - gridImport) / energyData.houseLoad) * 100)
      : 0;

  const peakKWp = settings.systemConfig.pv.peakPowerKWp;
  const co2SavedToday = energyData.pvYieldToday * 0.38;

  return {
    energyData,
    pvKW,
    houseKW,
    gridKW,
    battKW,
    hpKW,
    evKW,
    selfSufficiency,
    peakKWp,
    co2SavedToday,
    connected,
  };
}

export type CommandHubMetrics = ReturnType<typeof useCommandHubMetrics>;
