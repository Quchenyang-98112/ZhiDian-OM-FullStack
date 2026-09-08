import { motion } from 'motion/react';
import { useActionState, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { hapticClick, hapticModeChange, hapticSuccess } from '../../../lib/haptics';
import type { EnergyData, EvMode, EvState, StoredSettings } from '../../../types';
import { Disclosure } from '../../ui/Disclosure';
import { MetricRow } from '../shared/MetricRow';
import type { SendCommand } from '../types';

export function EVDetail({
  data,
  settings,
  sendCommand,
}: {
  data: EnergyData;
  settings: StoredSettings;
  sendCommand: SendCommand;
}) {
  const { t } = useTranslation();

  const [evState, evAction, isEvPending] = useActionState(
    async (_state: EvState, formData: FormData) => {
      hapticModeChange();
      const mode = (formData.get('evMode') ?? 'off') as EvMode;
      const power =
        mode === 'fast'
          ? settings.systemConfig.evCharger.maxPowerKW * 1000
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

  // The radios are controlled, so they need local UI state to be selectable
  // before the form is submitted; re-sync to the applied mode after each action.
  const [selectedMode, setSelectedMode] = useState<EvMode>(evState.mode);
  useEffect(() => {
    setSelectedMode(evState.mode);
  }, [evState.mode]);

  return (
    <div className="space-y-4">
      <MetricRow
        label={t('devicesAuto.currentPower')}
        value={`${(data.evPower / 1000).toFixed(2)} kW`}
      />
      <MetricRow
        label={t('devicesAuto.maxPower')}
        value={`${settings.systemConfig.evCharger.maxPowerKW} kW`}
      />
      <MetricRow
        label={t('devicesAuto.model')}
        value={settings.systemConfig.evCharger.model || '—'}
      />

      <Disclosure variant="nested" title={t('control.evTitle')} defaultOpen>
        <form action={evAction} className="space-y-3">
          <div
            className="grid grid-cols-3 gap-2"
            role="radiogroup"
            aria-label={t('control.evTitle')}
          >
            {(['off', 'pv', 'fast'] as const).map((mode) => (
              <label
                key={mode}
                className={`rounded-lg border px-2 py-2 text-center font-medium text-xs transition-all focus-within:ring-(--color-primary)/40 focus-within:ring-2 sm:text-sm ${
                  isEvPending ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'
                } ${
                  selectedMode === mode
                    ? 'border-(--color-primary) bg-(--color-primary)/20 text-(--color-primary)'
                    : 'border-(--color-border) bg-(--color-surface) text-(--color-muted) hover:border-(--color-primary)/40'
                }`}
              >
                <input
                  type="radio"
                  name="evMode"
                  value={mode}
                  className="sr-only"
                  checked={selectedMode === mode}
                  disabled={isEvPending}
                  onChange={() => {
                    setSelectedMode(mode);
                    hapticClick();
                  }}
                />
                {t(`control.ev${mode.charAt(0).toUpperCase() + mode.slice(1)}`)}
              </label>
            ))}
          </div>
          {evState.message && (
            <p className="text-(--color-primary) text-sm" role="status" aria-live="polite">
              ✓ {evState.message}
            </p>
          )}
          <motion.button
            type="submit"
            disabled={isEvPending}
            className="btn-primary focus-ring w-full"
            whileTap={{ scale: 0.97 }}
          >
            {isEvPending ? t('common.saving') : t('common.apply')}
          </motion.button>
        </form>
      </Disclosure>
    </div>
  );
}
