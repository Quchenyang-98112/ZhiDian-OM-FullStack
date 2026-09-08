import { useTranslation } from 'react-i18next';
import type { StoredSettings } from '../../types';
import { inputClass } from './styles';

type MpcNumberFieldProps = {
  id: string;
  label: string;
  hint?: string;
  value: number;
  min: number;
  max: number;
  step: number;
  disabled: boolean;
  onChange: (value: number) => void;
};

function MpcNumberField({
  id,
  label,
  hint,
  value,
  min,
  max,
  step,
  disabled,
  onChange,
}: MpcNumberFieldProps) {
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="font-medium text-sm">
        {label}
      </label>
      <input
        id={id}
        type="number"
        step={step}
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className={inputClass}
        disabled={disabled}
      />
      {hint ? <p className="text-(--color-muted) text-xs">{hint}</p> : null}
    </div>
  );
}

type MpcRangeFieldProps = {
  id: string;
  label: string;
  hint?: string;
  value: number;
  min: number;
  max: number;
  step: number;
  disabled: boolean;
  valueText: string;
  onChange: (value: number) => void;
};

function MpcRangeField({
  id,
  label,
  hint,
  value,
  min,
  max,
  step,
  disabled,
  valueText,
  onChange,
}: MpcRangeFieldProps) {
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="font-medium text-sm">
        {label}
      </label>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-(--color-primary)"
        disabled={disabled}
        aria-label={label}
        aria-valuetext={valueText}
      />
      <output htmlFor={id} className="block text-right font-mono text-sm">
        {valueText}
      </output>
      {hint ? <p className="text-(--color-muted) text-xs">{hint}</p> : null}
    </div>
  );
}

type MpcSettingsFieldsProps = {
  settings: StoredSettings;
  isReadOnly: boolean;
  onUpdate: (patch: Partial<StoredSettings>) => void;
};

/** MPC optimizer numeric fields extracted to keep ControllersMpcSection JSX shallow. */
export function MpcSettingsFields({ settings, isReadOnly, onUpdate }: MpcSettingsFieldsProps) {
  const { t } = useTranslation();

  return (
    <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
      <MpcNumberField
        id="settings-pv-peak-kw-mpc"
        label={t('settings.pvPeakKw', 'PV peak power (kW)')}
        hint={t('settings.pvPeakKwHint', 'Used by MPC for PV generation forecast scaling')}
        value={settings.pvPeakKw}
        min={0}
        max={100}
        step={0.1}
        disabled={isReadOnly}
        onChange={(value) => onUpdate({ pvPeakKw: value })}
      />
      <MpcNumberField
        id="settings-battery-capacity-kwh-mpc"
        label={t('settings.batteryCapacityKWhMpc', 'Battery capacity (kWh)')}
        value={settings.batteryCapacityKWh}
        min={0}
        max={200}
        step={0.1}
        disabled={isReadOnly}
        onChange={(value) => onUpdate({ batteryCapacityKWh: value })}
      />
      <MpcNumberField
        id="settings-battery-max-charge-kw-mpc"
        label={t('settings.batteryMaxChargeKW', 'Max charge rate (kW)')}
        value={settings.batteryMaxChargeKW}
        min={0}
        max={50}
        step={0.1}
        disabled={isReadOnly}
        onChange={(value) => onUpdate({ batteryMaxChargeKW: value })}
      />
      <MpcNumberField
        id="settings-battery-min-soc-mpc"
        label={t('settings.batteryMinSoCMpc', 'Min SoC (%)')}
        hint={t('settings.batteryMinSoCHint', 'MPC will not discharge below this SoC level')}
        value={settings.batteryMinSoC}
        min={5}
        max={50}
        step={1}
        disabled={isReadOnly}
        onChange={(value) => onUpdate({ batteryMinSoC: value })}
      />
      <MpcNumberField
        id="settings-ev-max-power-kw-mpc"
        label={t('settings.evMaxPowerKW', 'EV max charge (kW)')}
        value={settings.evMaxPowerKW}
        min={1}
        max={50}
        step={0.1}
        disabled={isReadOnly}
        onChange={(value) => onUpdate({ evMaxPowerKW: value })}
      />
      <MpcNumberField
        id="settings-heat-pump-power-kw-mpc"
        label={t('settings.heatPumpPowerKW', 'Heat pump power (kW)')}
        value={settings.heatPumpPowerKW}
        min={0}
        max={30}
        step={0.1}
        disabled={isReadOnly}
        onChange={(value) => onUpdate({ heatPumpPowerKW: value })}
      />
      <MpcRangeField
        id="settings-feed-in-tariff"
        label={t('settings.feedInTariffEurKWh', 'Feed-in tariff (€/kWh)')}
        hint={t('settings.feedInTariffEurKWhHint', 'EEG compensation used by MPC cost function')}
        value={settings.feedInTariffEurKWh}
        min={0}
        max={0.15}
        step={0.001}
        disabled={isReadOnly}
        valueText={`${settings.feedInTariffEurKWh.toFixed(3)} €`}
        onChange={(value) => onUpdate({ feedInTariffEurKWh: value })}
      />
      <MpcRangeField
        id="settings-max-grid-import-mpc"
        label={t('settings.maxGridImportKwMpc', 'Max grid import (kW)')}
        hint={t(
          'settings.maxGridMpcHint',
          '§14a EnWG constraint for MPC & peak shaving controller',
        )}
        value={settings.maxGridImportKw}
        min={1}
        max={15}
        step={0.1}
        disabled={isReadOnly}
        valueText={`${settings.maxGridImportKw.toFixed(1)} kW`}
        onChange={(value) => onUpdate({ maxGridImportKw: value })}
      />
    </div>
  );
}
