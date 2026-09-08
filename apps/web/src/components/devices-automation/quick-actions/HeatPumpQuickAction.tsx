import { Power } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { hapticModeChange, hapticSuccess } from '../../../lib/haptics';
import type { SendCommand } from '../types';

export function HeatPumpQuickAction({ sendCommand }: { sendCommand: SendCommand }) {
  const { t } = useTranslation();

  return (
    <button
      type="button"
      onClick={() => {
        hapticModeChange();
        sendCommand('SET_HEAT_PUMP_MODE', 3);
        hapticSuccess();
      }}
      className="focus-ring flex items-center gap-1.5 rounded-lg bg-(--color-primary)/10 px-3 py-1.5 font-medium text-(--color-primary) text-xs transition-colors hover:bg-(--color-primary)/20"
    >
      <Power size={12} aria-hidden="true" />
      {t('devicesAuto.sgReadyBoost')}
    </button>
  );
}
