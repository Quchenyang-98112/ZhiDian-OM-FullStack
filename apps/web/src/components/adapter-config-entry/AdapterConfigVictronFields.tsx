import { Activity } from 'lucide-react';
import type { AdapterConfigFieldProps } from './adapter-config-field-types';

const GATEWAY_TYPES = ['cerbo-gx', 'venus-gx', 'rpi-victron'] as const;

/** Victron gateway-type selector for Cerbo GX / Venus OS adapters. */
export const AdapterConfigVictronFields = ({ adapter, onUpdate, t }: AdapterConfigFieldProps) => (
  <div>
    <h3 className="mb-3 flex items-center gap-2 font-medium text-sm">
      <Activity size={14} className="text-blue-400" />
      {t('adapterConfig.victronSpecific')}
    </h3>
    <div className="space-y-2">
      <p className="font-medium text-(--color-muted) text-xs">{t('adapterConfig.gatewayType')}</p>
      <div className="grid grid-cols-3 gap-2">
        {GATEWAY_TYPES.map((gw) => (
          <button
            key={gw}
            type="button"
            onClick={() => onUpdate({ gatewayType: gw })}
            className={`rounded-lg border-2 p-2 text-left text-xs transition-all ${
              adapter.gatewayType === gw
                ? 'border-(--color-primary) bg-(--color-primary)/10'
                : 'border-(--color-border) bg-(--color-surface) hover:border-(--color-primary)/40'
            }`}
            aria-pressed={adapter.gatewayType === gw}
          >
            <span className="font-medium">{t(`adapterConfig.gw_${gw}`)}</span>
          </button>
        ))}
      </div>
    </div>
  </div>
);
