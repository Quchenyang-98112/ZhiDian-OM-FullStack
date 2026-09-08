import { Gauge } from 'lucide-react';
import { motion } from 'motion/react';
import { useTranslation } from 'react-i18next';
import type { UnifiedEnergyModel } from '../../../core/adapters/EnergyAdapter';
import type { EnergyData, StoredSettings } from '../../../types';
import { LiveMetric } from '../../ui/LiveMetric';

export function DeviceMetricRow({
  deviceId,
  data,
  unified,
  settings,
}: {
  deviceId: string;
  data: EnergyData;
  unified: UnifiedEnergyModel;
  settings: StoredSettings;
}) {
  const { t } = useTranslation();

  switch (deviceId) {
    case 'pv':
      return (
        <div className="flex items-baseline justify-between gap-2">
          <LiveMetric value={data.pvPower / 1000} unit="kW" format="power" size="sm" />
          <span className="text-(--color-muted) text-xs">
            {t('devicesAuto.yieldToday')}: {data.pvYieldToday.toFixed(1)} kWh
          </span>
        </div>
      );
    case 'storage':
      return (
        <div className="flex items-center gap-3">
          <LiveMetric
            value={Math.abs(data.batteryPower) / 1000}
            unit="kW"
            format="power"
            size="sm"
          />
          <div className="flex flex-1 items-center gap-2">
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-(--color-surface)">
              <motion.div
                className="h-full rounded-full bg-gradient-to-r from-blue-500 to-cyan-400"
                initial={false}
                animate={{ width: `${Math.min(100, Math.max(0, data.batterySoC))}%` }}
                transition={{ duration: 0.5 }}
              />
            </div>
            <span className="font-mono text-(--color-muted) text-xs">
              {data.batterySoC.toFixed(0)}%
            </span>
          </div>
        </div>
      );
    case 'ev':
      return (
        <div className="flex items-baseline justify-between gap-2">
          <LiveMetric value={data.evPower / 1000} unit="kW" format="power" size="sm" />
          <span className="text-(--color-muted) text-xs">
            {t('devicesAuto.maxPower')}: {settings.systemConfig.evCharger.maxPowerKW} kW
          </span>
        </div>
      );
    case 'heatpump':
      return (
        <div className="flex items-baseline justify-between gap-2">
          <LiveMetric value={data.heatPumpPower / 1000} unit="kW" format="power" size="sm" />
          <span className="flex items-center gap-1 text-(--color-muted) text-xs">
            <Gauge size={12} aria-hidden /> {t('devicesAuto.sgReady')}
          </span>
        </div>
      );
    case 'building': {
      const rooms = unified.knx?.rooms ?? [];
      const lightsOn = rooms.filter((r) => r.lightsOn).length;
      return (
        <div className="flex items-baseline justify-between gap-2">
          <span className="font-mono font-semibold text-(--color-text) text-lg tabular-nums">
            {rooms.length} {t('devicesAuto.rooms')}
          </span>
          <span className="text-(--color-muted) text-xs">
            {lightsOn} {t('devicesAuto.lightsOn')}
          </span>
        </div>
      );
    }
    default:
      return null;
  }
}
