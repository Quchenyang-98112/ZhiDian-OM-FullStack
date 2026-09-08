import { motion } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { hapticModeChange } from '../../../lib/haptics';
import { useAppStore } from '../../../store';
import type { CommandType } from '../../../types';
import { ControlPanelDivider, ControlPanelSection } from '../../ui/ControlPanel';

export function BatteryPanel({
  sendCommand,
  data,
}: {
  sendCommand: (type: CommandType, value: number) => void;
  data: { batteryPower: number; batterySoC: number };
}) {
  const { t } = useTranslation();
  const maxBatteryChargeRateKW = useAppStore(
    (s) => s.settings.systemConfig.battery.maxChargeRateKW,
  );
  const charging = data.batteryPower < 0;

  return (
    <div className="space-y-3">
      <ControlPanelSection title={t('liveEnergy.batteryStatus')}>
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-(--color-muted)">{t('metrics.battery')}</span>
            <span className="font-mono text-emerald-400">
              {(Math.abs(data.batteryPower) / 1000).toFixed(1)} kW
            </span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-(--color-muted)">SoC</span>
            <span className="font-mono text-emerald-400">{data.batterySoC.toFixed(0)}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-(--color-border)">
            <motion.div
              className="h-full rounded-full bg-emerald-400"
              initial={{ width: 0 }}
              animate={{ width: `${data.batterySoC}%` }}
              transition={{ duration: 1, ease: 'easeOut' }}
            />
          </div>
          <p className="text-(--color-muted) text-xs">
            {charging
              ? t('metrics.batteryCharging')
              : data.batteryPower > 0
                ? t('metrics.batteryDischarging')
                : t('metrics.batteryIdle')}
          </p>
        </div>
      </ControlPanelSection>
      <ControlPanelDivider />
      <ControlPanelSection title={t('control.batteryMode')}>
        <div className="flex gap-2">
          <motion.button
            type="button"
            whileTap={{ scale: 0.95 }}
            onClick={() => {
              hapticModeChange();
              sendCommand('SET_BATTERY_POWER', -(maxBatteryChargeRateKW * 1000));
            }}
            className="btn-secondary focus-ring flex-1 text-sm"
          >
            {t('control.forceCharge')}
          </motion.button>
          <motion.button
            type="button"
            whileTap={{ scale: 0.95 }}
            onClick={() => {
              hapticModeChange();
              sendCommand('SET_BATTERY_POWER', 0);
            }}
            className="btn-secondary focus-ring flex-1 text-sm"
          >
            {t('control.auto')}
          </motion.button>
        </div>
      </ControlPanelSection>
    </div>
  );
}
