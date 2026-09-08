import { useTranslation } from 'react-i18next';
import type { StoredSettings } from '../../types';
import { ControllersMpcSectionHeader } from './ControllersMpcSectionHeader';
import { MpcSettingsFields } from './MpcSettingsFields';
import { sectionClass } from './styles';

interface ControllersMpcSectionProps {
  settings: StoredSettings;
  updateSettings: (data: Partial<StoredSettings>) => void;
  isReadOnly: boolean;
}

/** MPC optimizer sizing fields for the Controllers settings tab. */
export function ControllersMpcSection({
  settings,
  updateSettings,
  isReadOnly,
}: ControllersMpcSectionProps) {
  const { t } = useTranslation();

  return (
    <section className={sectionClass}>
      <ControllersMpcSectionHeader />
      <p className="text-(--color-muted) text-xs">
        {t(
          'settings.mpcOptimizerHint',
          'Greedy LP day-ahead optimization over a 24-hour horizon with 15-minute resolution. Multi-objective: minimize cost, maximize self-consumption, minimize CO₂.',
        )}
      </p>
      <MpcSettingsFields settings={settings} isReadOnly={isReadOnly} onUpdate={updateSettings} />
    </section>
  );
}
