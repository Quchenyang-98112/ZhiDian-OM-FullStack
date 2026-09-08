import { ToggleSwitch } from '../adapter-config-shared';
import type { AdapterConfigFieldProps } from './adapter-config-field-types';

/** ISO 15118 Plug & Charge toggle row for OCPP adapters. */
export const AdapterConfigOcppIso15118Row = ({
  adapter,
  onUpdate,
  t,
}: Pick<AdapterConfigFieldProps, 'adapter' | 'onUpdate' | 't'>) => (
  <div className="flex items-center justify-between rounded-xl border border-(--color-border) bg-(--color-surface) p-3 md:col-span-2">
    <div>
      <p className="font-medium text-xs">ISO 15118 Plug & Charge</p>
      <p className="text-(--color-muted) text-[10px]">{t('adapterConfig.iso15118Hint')}</p>
    </div>
    <ToggleSwitch
      id={`iso15118-${adapter.id}`}
      checked={adapter.iso15118 ?? false}
      onChange={(v) => onUpdate({ iso15118: v })}
      label="ISO 15118"
    />
  </div>
);
