import { PlugZap } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { hapticModeChange, hapticSuccess } from '../../../lib/haptics';
import type { EnergyData, StoredSettings } from '../../../types';
import type { SendCommand } from '../types';

export function EVQuickAction({
  data,
  settings,
  sendCommand,
}: {
  data: EnergyData;
  settings: StoredSettings;
  sendCommand: SendCommand;
}) {
  const { t } = useTranslation();
  const isCharging = data.evPower > 50;

  return (
    <button
      type="button"
      onClick={() => {
        hapticModeChange();
        if (isCharging) {
          sendCommand('SET_EV_POWER', 0);
        } else {
          const pvSurplus = Math.max(0, data.pvPower - data.houseLoad);
          sendCommand(
            'SET_EV_POWER',
            pvSurplus > 1500 ? pvSurplus : settings.systemConfig.evCharger.maxPowerKW * 1000,
          );
        }
        hapticSuccess();
      }}
      className="focus-ring flex items-center gap-1.5 rounded-lg bg-(--color-primary)/10 px-3 py-1.5 font-medium text-(--color-primary) text-xs transition-colors hover:bg-(--color-primary)/20"
    >
      <PlugZap size={12} aria-hidden="true" />
      {isCharging ? t('control.evOff') : t('devicesAuto.startCharging')}
    </button>
  );
}
