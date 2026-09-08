import { Ban, Flame, Leaf, Thermometer } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { HpMode } from '../../types';
import { ChoiceCardGroup } from './ChoiceCardGroup';

const MODES: {
  value: HpMode;
  titleKey: `control.hpMode${HpMode}`;
  descKey: `control.hpMode${HpMode}Desc`;
  powerKey: `control.hpMode${HpMode}Power`;
  tone: 'danger' | 'primary' | 'success' | 'warning';
  icon: ReactNode;
}[] = [
  {
    value: '1',
    titleKey: 'control.hpMode1',
    descKey: 'control.hpMode1Desc',
    powerKey: 'control.hpMode1Power',
    tone: 'danger',
    icon: <Ban size={16} aria-hidden="true" />,
  },
  {
    value: '2',
    titleKey: 'control.hpMode2',
    descKey: 'control.hpMode2Desc',
    powerKey: 'control.hpMode2Power',
    tone: 'primary',
    icon: <Thermometer size={16} aria-hidden="true" />,
  },
  {
    value: '3',
    titleKey: 'control.hpMode3',
    descKey: 'control.hpMode3Desc',
    powerKey: 'control.hpMode3Power',
    tone: 'success',
    icon: <Leaf size={16} aria-hidden="true" />,
  },
  {
    value: '4',
    titleKey: 'control.hpMode4',
    descKey: 'control.hpMode4Desc',
    powerKey: 'control.hpMode4Power',
    tone: 'warning',
    icon: <Flame size={16} aria-hidden="true" />,
  },
];

export interface SgReadyModeSelectorProps {
  name: string;
  value: HpMode;
  onChange?: (mode: HpMode) => void;
  'aria-label'?: string;
  disabled?: boolean;
}

/** SG Ready heat-pump mode picker (modes 1–4). */
export function SgReadyModeSelector({
  name,
  value,
  onChange,
  'aria-label': ariaLabel,
  disabled = false,
}: SgReadyModeSelectorProps) {
  const { t } = useTranslation();

  return (
    <ChoiceCardGroup
      name={name}
      value={value}
      disabled={disabled}
      aria-label={ariaLabel ?? t('control.hpTitle')}
      onChange={(next) => onChange?.(next as HpMode)}
      options={MODES.map((mode) => ({
        value: mode.value,
        label: t(mode.titleKey),
        description: t(mode.descKey),
        badge: mode.value,
        icon: mode.icon,
        tone: mode.tone,
        meta: t(mode.powerKey),
      }))}
    />
  );
}
