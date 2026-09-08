import { AlertTriangle } from 'lucide-react';
import { AdapterConfigLabeledField } from './AdapterConfigLabeledField';
import type { AdapterConfigFieldProps } from './adapter-config-field-types';

/** OCPP security profile 3 mTLS certificate and key fields. */
export const AdapterConfigOcppMtlsFields = ({
  adapter,
  onUpdate,
  inputClass,
  t,
}: AdapterConfigFieldProps) => (
  <div className="space-y-3 md:col-span-2">
    <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-amber-400 text-xs">
      <AlertTriangle size={14} aria-hidden="true" />
      {t('adapterConfig.mtlsRequired')}
    </div>
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <AdapterConfigLabeledField
        id={`adapter-cert-ocpp-${adapter.id}`}
        label={t('adapterConfig.clientCert')}
      >
        <textarea
          id={`adapter-cert-ocpp-${adapter.id}`}
          value={adapter.clientCert ?? ''}
          onChange={(e) => onUpdate({ clientCert: e.target.value })}
          className={`${inputClass} h-20 resize-none font-mono text-xs`}
          placeholder="-----BEGIN CERTIFICATE-----"
        />
      </AdapterConfigLabeledField>
      <AdapterConfigLabeledField
        id={`adapter-key-ocpp-${adapter.id}`}
        label={t('adapterConfig.clientKey')}
      >
        <textarea
          id={`adapter-key-ocpp-${adapter.id}`}
          value={adapter.clientKey ?? ''}
          onChange={(e) => onUpdate({ clientKey: e.target.value })}
          className={`${inputClass} h-20 resize-none font-mono text-xs`}
          placeholder="-----BEGIN PRIVATE KEY-----"
        />
      </AdapterConfigLabeledField>
    </div>
  </div>
);
