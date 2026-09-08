import { AdapterConfigLabeledField } from './AdapterConfigLabeledField';
import type { AdapterConfigFieldProps } from './adapter-config-field-types';

/** Poll-interval number input with millisecond suffix. */
export const AdapterConfigPollIntervalField = ({
  adapter,
  onUpdate,
  inputClass,
  t,
  isReadOnly = false,
}: AdapterConfigFieldProps) => (
  <AdapterConfigLabeledField
    id={`adapter-poll-${adapter.id}`}
    label={t('adapterConfig.pollInterval')}
  >
    <div className="flex items-center gap-2">
      <input
        id={`adapter-poll-${adapter.id}`}
        type="number"
        value={adapter.pollIntervalMs}
        onChange={(e) => onUpdate({ pollIntervalMs: Number(e.target.value) })}
        className={inputClass}
        min={500}
        max={60000}
        step={500}
        disabled={isReadOnly}
      />
      <span className="whitespace-nowrap text-(--color-muted) text-xs">ms</span>
    </div>
  </AdapterConfigLabeledField>
);
