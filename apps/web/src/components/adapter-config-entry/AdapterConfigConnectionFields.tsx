import { Wifi } from 'lucide-react';
import { AdapterConfigLabeledField } from './AdapterConfigLabeledField';
import { AdapterConfigPollIntervalField } from './AdapterConfigPollIntervalField';
import type { AdapterConfigFieldProps } from './adapter-config-field-types';

/** Connection settings block (name, host, port, poll interval) for one adapter entry. */
export const AdapterConfigConnectionFields = ({
  adapter,
  onUpdate,
  inputClass,
  t,
  isReadOnly = false,
}: AdapterConfigFieldProps) => (
  <div>
    <h3 className="mb-3 flex items-center gap-2 font-medium text-sm">
      <Wifi size={14} className="text-emerald-400" aria-hidden="true" />
      {t('adapterConfig.connection')}
    </h3>
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <AdapterConfigLabeledField
        id={`adapter-name-${adapter.id}`}
        label={t('adapterConfig.adapterName')}
      >
        <input
          id={`adapter-name-${adapter.id}`}
          type="text"
          value={adapter.name}
          onChange={(e) => onUpdate({ name: e.target.value })}
          className={inputClass}
          disabled={isReadOnly}
        />
      </AdapterConfigLabeledField>
      <AdapterConfigLabeledField id={`adapter-host-${adapter.id}`} label={t('adapterConfig.host')}>
        <input
          id={`adapter-host-${adapter.id}`}
          type="text"
          value={adapter.host}
          onChange={(e) => onUpdate({ host: e.target.value })}
          className={inputClass}
          placeholder="192.168.1.100"
          disabled={isReadOnly}
        />
      </AdapterConfigLabeledField>
      <AdapterConfigLabeledField id={`adapter-port-${adapter.id}`} label={t('adapterConfig.port')}>
        <input
          id={`adapter-port-${adapter.id}`}
          type="number"
          value={adapter.port}
          onChange={(e) => onUpdate({ port: Number(e.target.value) })}
          className={inputClass}
          min={1}
          max={65535}
          disabled={isReadOnly}
        />
      </AdapterConfigLabeledField>
      <AdapterConfigPollIntervalField
        adapter={adapter}
        onUpdate={onUpdate}
        inputClass={inputClass}
        t={t}
        isReadOnly={isReadOnly}
      />
    </div>
  </div>
);
