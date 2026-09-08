import { Cable, Shield } from 'lucide-react';
import { AdapterConfigLabeledField } from './AdapterConfigLabeledField';
import type { AdapterConfigFieldProps } from './adapter-config-field-types';

/** EEBUS SPINE/SHIP SKI fingerprint and mTLS certificate fields. */
export const AdapterConfigEebusFields = ({
  adapter,
  onUpdate,
  inputClass,
  t,
}: AdapterConfigFieldProps) => (
  <div>
    <h3 className="mb-3 flex items-center gap-2 font-medium text-sm">
      <Cable size={14} className="text-purple-400" aria-hidden="true" />
      {t('adapterConfig.eebusSpecific')}
    </h3>
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <AdapterConfigLabeledField
        id={`adapter-ski-${adapter.id}`}
        label={t('adapterConfig.skiFingerprint')}
      >
        <input
          id={`adapter-ski-${adapter.id}`}
          type="text"
          value={adapter.skiFingerprint ?? ''}
          onChange={(e) => onUpdate({ skiFingerprint: e.target.value })}
          className={`${inputClass} font-mono`}
          placeholder="0123456789abcdef..."
          maxLength={40}
        />
        <p className="text-(--color-muted) text-[10px]">{t('adapterConfig.skiFingerprintHint')}</p>
      </AdapterConfigLabeledField>
      <div className="space-y-3">
        <div className="flex items-center gap-2 rounded-lg border border-purple-500/20 bg-purple-500/5 px-3 py-2 text-purple-300 text-xs">
          <Shield size={14} aria-hidden="true" />
          {t('adapterConfig.eebusRequiresTls')}
        </div>
        <AdapterConfigLabeledField
          id={`adapter-cert-eebus-${adapter.id}`}
          label={t('adapterConfig.clientCert')}
        >
          <textarea
            id={`adapter-cert-eebus-${adapter.id}`}
            value={adapter.clientCert ?? ''}
            onChange={(e) => onUpdate({ clientCert: e.target.value })}
            className={`${inputClass} h-20 resize-none font-mono text-xs`}
            placeholder="-----BEGIN CERTIFICATE-----"
          />
        </AdapterConfigLabeledField>
        <AdapterConfigLabeledField
          id={`adapter-key-eebus-${adapter.id}`}
          label={t('adapterConfig.clientKey')}
        >
          <textarea
            id={`adapter-key-eebus-${adapter.id}`}
            value={adapter.clientKey ?? ''}
            onChange={(e) => onUpdate({ clientKey: e.target.value })}
            className={`${inputClass} h-20 resize-none font-mono text-xs`}
            placeholder="-----BEGIN PRIVATE KEY-----"
          />
        </AdapterConfigLabeledField>
      </div>
    </div>
  </div>
);
