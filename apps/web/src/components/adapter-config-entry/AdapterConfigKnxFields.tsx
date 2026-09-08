import { Radio } from 'lucide-react';
import { GAMappingPanel } from '../adapter-config-shared';
import type { AdapterConfigFieldProps } from './adapter-config-field-types';

const KNX_TRANSPORTS = ['websocket', 'mqtt'] as const;

/** KNX transport selector and group-address mapping panel. */
export const AdapterConfigKnxFields = ({ adapter, onUpdate, t }: AdapterConfigFieldProps) => (
  <div>
    <h3 className="mb-3 flex items-center gap-2 font-medium text-sm">
      <Radio size={14} className="text-green-400" />
      {t('adapterConfig.knxSpecific')}
    </h3>
    <div className="mb-4 space-y-2">
      <p className="font-medium text-(--color-muted) text-xs">{t('adapterConfig.knxTransport')}</p>
      <div className="grid grid-cols-2 gap-2">
        {KNX_TRANSPORTS.map((tr) => (
          <button
            key={tr}
            type="button"
            onClick={() => onUpdate({ knxTransport: tr })}
            className={`rounded-lg border-2 p-2 text-center font-medium text-xs transition-all ${
              adapter.knxTransport === tr
                ? 'border-(--color-primary) bg-(--color-primary)/10 text-(--color-primary)'
                : 'border-(--color-border) bg-(--color-surface) text-(--color-muted) hover:border-(--color-primary)/40'
            }`}
            aria-pressed={adapter.knxTransport === tr}
          >
            {tr === 'websocket' ? 'WebSocket (knxd)' : 'MQTT Bridge'}
          </button>
        ))}
      </div>
    </div>
    <GAMappingPanel
      mapping={adapter.gaMapping ?? []}
      onChange={(m) => onUpdate({ gaMapping: m })}
    />
  </div>
);
