import type { TFunction } from 'i18next';
import type { LucideIcon } from 'lucide-react';
import type { TariffProvider } from '../../types';
import { SelectField } from '../ui/SelectField';
import { sectionHeaderClass } from './styles';

type EnergySectionHeaderProps = {
  icon: LucideIcon;
  iconClassName: string;
  title: string;
};

/** Flat section title row for Energy settings sub-panels. */
export function EnergySectionHeader({
  icon: Icon,
  iconClassName,
  title,
}: EnergySectionHeaderProps) {
  return (
    <h2 className={sectionHeaderClass}>
      <Icon size={20} className={iconClassName} />
      {title}
    </h2>
  );
}

type EnergyTariffProviderFieldProps = {
  t: TFunction;
  value: TariffProvider;
  isReadOnly: boolean;
  onChange: (provider: TariffProvider) => void;
};

/** Tariff provider select extracted to keep EnergyTariffSection shallow. */
export function EnergyTariffProviderField({
  t,
  value,
  isReadOnly,
  onChange,
}: EnergyTariffProviderFieldProps) {
  return (
    <SelectField
      id="settings-tariff"
      label={t('settings.tariffProvider')}
      value={value}
      disabled={isReadOnly}
      onChange={(e) => onChange(e.target.value as TariffProvider)}
    >
      <option value="tibber">{t('settings.tibber')}</option>
      <option value="tibber-pulse">{t('settings.tibberPulse')}</option>
      <option value="awattar-de">{t('settings.awattarDE')}</option>
      <option value="awattar-at">{t('settings.awattarAT')}</option>
      <option value="octopus">{t('settings.octopus')}</option>
      <option value="awattar">{t('settings.awattar')}</option>
      <option value="none">{t('settings.none')}</option>
    </SelectField>
  );
}
