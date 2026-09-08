import { Car } from 'lucide-react';
import { motion } from 'motion/react';
import { useActionState } from 'react';
import { useTranslation } from 'react-i18next';
import { hapticClick, hapticModeChange, hapticSuccess } from '../../../lib/haptics';
import { useAppStore } from '../../../store';
import type { CommandType, EvMode, EvState } from '../../../types';
import { ControlPanelDivider, ControlPanelSection } from '../../ui/ControlPanel';

export function EVPanel({
  sendCommand,
  data,
}: {
  sendCommand: (type: CommandType, value: number) => void;
  data: { evPower: number; pvPower: number; houseLoad: number };
}) {
  const { t } = useTranslation();
  const maxEvPowerKW = useAppStore((s) => s.settings.systemConfig.evCharger.maxPowerKW);

  const [evState, evAction, isEvPending] = useActionState(
    async (_state: EvState, formData: FormData) => {
      hapticModeChange();
      const mode = (formData.get('evMode') ?? 'off') as EvMode;
      const power =
        mode === 'fast'
          ? maxEvPowerKW * 1000
          : mode === 'pv'
            ? Math.max(0, data.pvPower - data.houseLoad)
            : 0;
      await new Promise((resolve) => setTimeout(resolve, 800));
      sendCommand('SET_EV_POWER', power);
      hapticSuccess();
      return { mode, power, message: t('control.evUpdated') };
    },
    { mode: 'off' as EvMode, power: 0, message: '' },
  );

  return (
    <div className="space-y-3">
      <ControlPanelSection title={t('liveEnergy.currentPower')}>
        <div className="flex items-center justify-between text-sm">
          <span className="text-(--color-muted)">
            <Car size={14} className="inline text-violet-400" /> {t('dashboard.evCharging')}
          </span>
          <span className="font-mono text-violet-400">{(data.evPower / 1000).toFixed(1)} kW</span>
        </div>
      </ControlPanelSection>
      <ControlPanelDivider />
      <form action={evAction} className="space-y-3">
        <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label={t('control.evTitle')}>
          {(['off', 'pv', 'fast'] as EvMode[]).map((mode) => (
            <label
              key={mode}
              className={`cursor-pointer rounded-lg border px-2 py-2 text-center font-medium text-xs transition-all focus-within:ring-(--color-primary)/40 focus-within:ring-2 ${
                evState.mode === mode
                  ? 'border-(--color-primary) bg-(--color-primary)/20 text-(--color-primary)'
                  : 'border-(--color-border) bg-(--color-surface) text-(--color-muted) hover:border-(--color-primary)/40'
              }`}
            >
              <input
                type="radio"
                name="evMode"
                value={mode}
                className="sr-only"
                checked={evState.mode === mode}
                onChange={hapticClick}
              />
              {mode === 'off'
                ? t('control.evOff')
                : mode === 'pv'
                  ? t('control.evPv')
                  : t('control.evFast')}
            </label>
          ))}
        </div>
        {evState.message && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-(--color-primary) text-xs"
            role="status"
            aria-live="polite"
          >
            ✓ {evState.message}
          </motion.p>
        )}
        <button
          type="submit"
          disabled={isEvPending}
          className="btn-primary focus-ring w-full text-sm"
        >
          {isEvPending ? t('common.saving') : t('common.apply')}
        </button>
      </form>
    </div>
  );
}
