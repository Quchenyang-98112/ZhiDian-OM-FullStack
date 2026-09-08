import { ArrowUpDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { hapticModeChange, hapticSuccess } from '../../../lib/haptics';
import type { EnergyData } from '../../../types';
import type { SendCommand } from '../types';

export function BatteryQuickAction({
  data,
  sendCommand,
}: {
  data: EnergyData;
  sendCommand: SendCommand;
}) {
  const { t } = useTranslation();
  const isCharging = data.batteryPower > 10;

  return (
    <button
      type="button"
      onClick={() => {
        hapticModeChange();
        sendCommand('SET_BATTERY_POWER', isCharging ? 0 : 3000);
        hapticSuccess();
      }}
      className="focus-ring flex items-center gap-1.5 rounded-lg bg-(--color-primary)/10 px-3 py-1.5 font-medium text-(--color-primary) text-xs transition-colors hover:bg-(--color-primary)/20"
    >
      <ArrowUpDown size={12} aria-hidden="true" />
      {isCharging ? t('control.auto') : t('control.forceCharge')}
    </button>
  );
}
