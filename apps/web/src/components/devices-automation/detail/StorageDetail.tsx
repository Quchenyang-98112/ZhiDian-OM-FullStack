import { motion } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { hapticModeChange, hapticSuccess } from '../../../lib/haptics';
import type { EnergyData } from '../../../types';
import { Disclosure } from '../../ui/Disclosure';
import { MetricRow } from '../shared/MetricRow';
import type { SendCommand } from '../types';

export function StorageDetail({
  data,
  sendCommand,
}: {
  data: EnergyData;
  sendCommand: SendCommand;
}) {
  const { t } = useTranslation();

  return (
    <div className="space-y-4">
      <MetricRow
        label={t('devicesAuto.currentPower')}
        value={`${(Math.abs(data.batteryPower) / 1000).toFixed(2)} kW`}
      />
      <MetricRow label={t('devicesAuto.soc')} value={`${data.batterySoC.toFixed(0)}%`} />
      <MetricRow label={t('devicesAuto.voltage')} value={`${data.batteryVoltage.toFixed(1)} V`} />
      <div className="h-3 overflow-hidden rounded-full bg-(--color-surface)">
        <motion.div
          className="h-full rounded-full bg-gradient-to-r from-blue-500 to-cyan-400"
          initial={false}
          animate={{ width: `${Math.min(100, Math.max(0, data.batterySoC))}%` }}
          transition={{ duration: 0.5 }}
        />
      </div>

      <Disclosure variant="nested" title={t('control.batteryTitle')} defaultOpen>
        <div className="flex gap-2">
          <motion.button
            type="button"
            onClick={() => {
              hapticModeChange();
              sendCommand('SET_BATTERY_POWER', 3000);
              hapticSuccess();
            }}
            className="btn-primary focus-ring flex-1 text-sm"
            whileTap={{ scale: 0.97 }}
          >
            {t('control.forceCharge')}
          </motion.button>
          <motion.button
            type="button"
            onClick={() => {
              hapticModeChange();
              sendCommand('SET_BATTERY_POWER', 0);
              hapticSuccess();
            }}
            className="btn-secondary focus-ring flex-1 text-sm"
            whileTap={{ scale: 0.97 }}
          >
            {t('control.auto')}
          </motion.button>
        </div>
      </Disclosure>
    </div>
  );
}
