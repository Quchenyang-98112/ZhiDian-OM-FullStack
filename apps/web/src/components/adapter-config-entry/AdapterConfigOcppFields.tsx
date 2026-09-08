import { Plug } from 'lucide-react';
import { SelectField } from '../ui/SelectField';
import { AdapterConfigLabeledField } from './AdapterConfigLabeledField';
import { AdapterConfigOcppIso15118Row } from './AdapterConfigOcppIso15118Row';
import { AdapterConfigOcppMtlsFields } from './AdapterConfigOcppMtlsFields';
import { AdapterConfigOcppV2xHelp } from './AdapterConfigOcppV2xHelp';
import type { AdapterConfigFieldProps } from './adapter-config-field-types';

/** OCPP 2.1 station ID, security profile, ISO 15118, and mTLS fields. */
export const AdapterConfigOcppFields = ({
  adapter,
  onUpdate,
  inputClass,
  t,
}: AdapterConfigFieldProps) => (
  <div>
    <h3 className="mb-3 flex items-center gap-2 font-medium text-sm">
      <Plug size={14} className="text-cyan-400" aria-hidden="true" />
      {t('adapterConfig.ocppSpecific')}
    </h3>
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <AdapterConfigLabeledField
        id={`adapter-station-${adapter.id}`}
        label={t('adapterConfig.stationId')}
      >
        <input
          id={`adapter-station-${adapter.id}`}
          type="text"
          value={adapter.stationId ?? ''}
          onChange={(e) => onUpdate({ stationId: e.target.value })}
          className={inputClass}
          placeholder="CP001"
        />
      </AdapterConfigLabeledField>
      <SelectField
        id={`adapter-secprofile-${adapter.id}`}
        label={t('adapterConfig.securityProfile')}
        value={String(adapter.securityProfile ?? 2)}
        onChange={(e) =>
          onUpdate({
            securityProfile: Number(e.target.value) as 0 | 1 | 2 | 3,
          })
        }
      >
        <option value="0">{t('adapterConfig.secProfile0')}</option>
        <option value="1">{t('adapterConfig.secProfile1')}</option>
        <option value="2">{t('adapterConfig.secProfile2')}</option>
        <option value="3">{t('adapterConfig.secProfile3')}</option>
      </SelectField>
      <AdapterConfigOcppIso15118Row adapter={adapter} onUpdate={onUpdate} t={t} />
      {adapter.securityProfile === 3 ? (
        <AdapterConfigOcppMtlsFields
          adapter={adapter}
          onUpdate={onUpdate}
          inputClass={inputClass}
          t={t}
        />
      ) : null}
      <div className="md:col-span-2">
        <AdapterConfigOcppV2xHelp />
      </div>
    </div>
  </div>
);
