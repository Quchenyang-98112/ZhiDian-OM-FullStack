import type { UnifiedEnergyModel } from '../../core/adapters/EnergyAdapter';
import type { EnergyData } from '../../types';

const MUTED = 'bg-(--color-muted)/15 text-(--color-muted)';

const IDLE = {
  label: 'devicesAuto.statusIdle',
  color: MUTED,
};

/** Derives a device's status pill (i18n key + colour) from live energy data. */
export function getDeviceStatus(
  deviceId: string,
  data: EnergyData,
  unified: UnifiedEnergyModel,
): { label: string; color: string } {
  switch (deviceId) {
    case 'pv':
      return data.pvPower > 50
        ? { label: 'devicesAuto.statusProducing', color: 'bg-emerald-500/15 text-emerald-400' }
        : IDLE;
    case 'storage':
      return data.batteryPower > 10
        ? { label: 'devicesAuto.statusCharging', color: 'bg-blue-500/15 text-blue-400' }
        : data.batteryPower < -10
          ? { label: 'devicesAuto.statusDischarging', color: 'bg-amber-500/15 text-amber-400' }
          : { label: 'devicesAuto.statusStandby', color: MUTED };
    case 'ev':
      return data.evPower > 50
        ? { label: 'devicesAuto.statusCharging', color: 'bg-purple-500/15 text-purple-400' }
        : { label: 'devicesAuto.statusReady', color: MUTED };
    case 'heatpump':
      return data.heatPumpPower > 50
        ? { label: 'devicesAuto.statusRunning', color: 'bg-orange-500/15 text-orange-400' }
        : IDLE;
    case 'building': {
      const rooms = unified.knx?.rooms ?? [];
      return rooms.some((r) => r.lightsOn)
        ? { label: 'devicesAuto.statusActive', color: 'bg-sky-500/15 text-sky-400' }
        : IDLE;
    }
    default:
      return IDLE;
  }
}
