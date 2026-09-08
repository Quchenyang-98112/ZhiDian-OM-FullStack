import { motion } from 'motion/react';
import { useActionState } from 'react';
import { useTranslation } from 'react-i18next';
import { hapticModeChange, hapticSuccess } from '../../../lib/haptics';
import { SG_READY_POWER_W } from '../../../lib/sg-ready';
import type { EnergyData, HpMode, HpState } from '../../../types';
import { SgReadyModeSelector } from '../../ui/SgReadyModeSelector';
import { MetricRow } from '../shared/MetricRow';
import type { SendCommand } from '../types';

export function HeatPumpDetail({
  data,
  sendCommand,
}: {
  data: EnergyData;
  sendCommand: SendCommand;
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

  const activeModeLabel = t(`control.hpMode${hpState.mode}` as const);

  return (
    <div className="space-y-4">
      <MetricRow
        label={t('devicesAuto.currentPower')}
        value={`${(data.heatPumpPower / 1000).toFixed(2)} kW`}
      />
      <MetricRow label={t('devicesAuto.sgReadyMode')} value={activeModeLabel} />

      <section className="space-y-3" aria-labelledby="hp-sg-ready-title">
        <h3 id="hp-sg-ready-title" className="eyebrow text-(--color-muted)">
          {t('control.hpTitle')}
        </h3>
        <form action={hpAction} className="space-y-3">
          <SgReadyModeSelector key={hpState.mode} name="hpMode" value={hpState.mode} />
          {hpState.message && (
            <p className="text-(--color-primary) text-sm" role="status" aria-live="polite">
              ✓ {hpState.message}
            </p>
          )}
          <motion.button
            type="submit"
            disabled={isHpPending}
            className="btn-primary focus-ring w-full"
            whileTap={{ scale: 0.97 }}
          >
            {isHpPending ? t('common.saving') : t('common.apply')}
          </motion.button>
        </form>
      </section>
    </div>
  );
}
