import type { TFunction } from 'i18next';
import type { StoredSettings } from '../../types';
import { inputClass } from './styles';

type RangeFieldProps = {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  valueText: string;
  ariaValuetext: string;
  isReadOnly: boolean;
  onChange: (value: number) => void;
  hint?: string;
};

export function EnergyRangeField({
  id,
  label,
  value,
  min,
  max,
  step,
  valueText,
  ariaValuetext,
  isReadOnly,
  onChange,
  hint,
}: RangeFieldProps) {
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="font-medium text-sm">
        {label}
      </label>
      <input
        id={id}
        type="range"
        disabled={isReadOnly}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-(--color-primary)"
        aria-label={label}
        aria-valuetext={ariaValuetext}
      />
      <output htmlFor={id} className="block text-right font-mono text-sm">
        {valueText}
      </output>
      {hint ? <p className="text-(--color-muted) text-xs">{hint}</p> : null}
    </div>
  );
}

type ApiTokenFieldProps = {
  t: TFunction;
  isReadOnly: boolean;
  visible: boolean;
  onToggle: () => void;
};

export function EnergyApiTokenField({ t, isReadOnly, visible, onToggle }: ApiTokenFieldProps) {
  return (
    <div className="space-y-2">
      <label htmlFor="settings-api-token" className="font-medium text-sm">
        {t('settings.apiTokenLabel')}
      </label>
      <input
        id="settings-api-token"
        type={visible ? 'text' : 'password'}
        className={inputClass}
        placeholder="••••••••••••••••"
        disabled={isReadOnly}
      />
      <button
        type="button"
        disabled={isReadOnly}
        onClick={onToggle}
        className="focus-ring text-(--color-muted) text-xs hover:text-(--color-text)"
        aria-label={visible ? t('settings.hideToken') : t('settings.showToken')}
      >
        {visible ? t('settings.hideToken') : t('settings.showToken')}
      </button>
    </div>
  );
}

type DynamicGridFeesFieldProps = {
  t: TFunction;
  enabled: boolean;
  isReadOnly: boolean;
  onToggle: () => void;
};

export function EnergyDynamicGridFeesField({
  t,
  enabled,
  isReadOnly,
  onToggle,
}: DynamicGridFeesFieldProps) {
  return (
    <div className="space-y-2">
      <p className="font-medium text-sm">{t('settings.dynamicGridFees')}</p>
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        disabled={isReadOnly}
        onClick={onToggle}
        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full transition-colors ${enabled ? 'bg-(--color-primary)' : 'bg-(--color-border)'}`}
      >
        <span
          className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${enabled ? 'translate-x-5' : 'translate-x-0.5'} mt-0.5`}
        />
      </button>
      <span className="text-sm">
        {enabled ? t('settings.dynamicGridFeesActive') : t('settings.dynamicGridFeesInactive')}
      </span>
      <p className="text-(--color-muted) text-xs">{t('settings.dynamicGridFeesHint')}</p>
    </div>
  );
}

export type EnergyFormSlice = {
  t: TFunction;
  settings: StoredSettings;
  isReadOnly: boolean;
  setIfEditable: (patch: Partial<StoredSettings>) => void;
};
