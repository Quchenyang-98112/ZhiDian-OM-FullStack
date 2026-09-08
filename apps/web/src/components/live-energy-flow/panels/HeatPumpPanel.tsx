import { Thermometer } from 'lucide-react';
import { motion } from 'motion/react';
import { useActionState } from 'react';
import { useTranslation } from 'react-i18next';
import { hapticModeChange, hapticSuccess } from '../../../lib/haptics';
import { SG_READY_POWER_W } from '../../../lib/sg-ready';
import type { CommandType, HpMode, HpState } from '../../../types';
import { ControlPanelDivider, ControlPanelSection } from '../../ui/ControlPanel';
import { SgReadyModeSelector } from '../../ui/SgReadyModeSelector';

export function HeatPumpPanel({
  sendCommand,
  data,
}: {
  sendCommand: (type: CommandType, value: number) => void;
  data: { heatPumpPower: number };
}) {
  const { t } = useTranslation();

  const [hpState, hpAction, isHpPending] = useActionState(
    async (_state: HpState, formData: FormData) => {
      hapticModeChange();
      const mode = (formData.get('hpMode') ?? '2') as HpMode;
      const power = SG_READY_POWER_W[mode] ?? 800;
      await new Promise((resolve) => setTimeout(resolve, 600));
      sendCommand('SET_HEAT_PUMP_MODE', Number(mode));
      hapticSuccess();
      return { mode, power, message: t('control.hpUpdated') };
    },
    { mode: '2' as HpMode, power: 800, message: '' },
  );

  return (
    <div className="space-y-3">
      <ControlPanelSection title={t('liveEnergy.currentPower')}>
        <div className="flex items-center justify-between text-sm">
          <span className="text-(--color-muted)">
            <Thermometer size={14} className="inline text-orange-400" /> {t('dashboard.heatPump')}
          </span>
          <span className="font-mono text-orange-400">
            {(data.heatPumpPower / 1000).toFixed(1)} kW
          </span>
        </div>
      </ControlPanelSection>
      <ControlPanelDivider />
      <form action={hpAction} className="space-y-3">
        <SgReadyModeSelector key={hpState.mode} name="hpMode" value={hpState.mode} />
        {hpState.message && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-(--color-primary) text-xs"
            role="status"
            aria-live="polite"
          >
            ✓ {hpState.message}
          </motion.p>
        )}
        <button
          type="submit"
          disabled={isHpPending}
          className="btn-primary focus-ring w-full text-sm"
        >
          {isHpPending ? t('common.saving') : t('common.apply')}
        </button>
      </form>
    </div>
  );
}
