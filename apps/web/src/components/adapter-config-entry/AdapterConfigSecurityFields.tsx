import { Shield } from 'lucide-react';
import { AdapterConfigLabeledField } from './AdapterConfigLabeledField';
import { AdapterConfigTlsRow } from './AdapterConfigTlsRow';
import { AdapterConfigTokenField } from './AdapterConfigTokenField';
import type { AdapterConfigSecurityFieldProps } from './adapter-config-field-types';

/** TLS toggle and auth-token field for one adapter entry. */
export const AdapterConfigSecurityFields = ({
  adapter,
  onUpdate,
  showToken,
  onToggleToken,
  inputClass,
  t,
  isReadOnly = false,
}: AdapterConfigSecurityFieldProps) => (
  <div>
    <h3 className="mb-3 flex items-center gap-2 font-medium text-sm">
      <Shield size={14} className="text-orange-400" aria-hidden="true" />
      {t('adapterConfig.security')}
    </h3>
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <AdapterConfigTlsRow adapter={adapter} onUpdate={onUpdate} t={t} isReadOnly={isReadOnly} />
      <AdapterConfigLabeledField
        id={`adapter-token-${adapter.id}`}
        label={t('adapterConfig.authToken')}
      >
        <AdapterConfigTokenField
          adapter={adapter}
          showToken={showToken}
          onToggleToken={onToggleToken}
          onUpdate={onUpdate}
          inputClass={inputClass}
          t={t}
          isReadOnly={isReadOnly}
        />
      </AdapterConfigLabeledField>
    </div>
  </div>
);
