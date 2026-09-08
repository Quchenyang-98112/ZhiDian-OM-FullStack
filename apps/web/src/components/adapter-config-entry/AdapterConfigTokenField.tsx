import type { TFunction } from 'i18next';
import { Eye, EyeOff } from 'lucide-react';
import type { AdapterEntry } from '../adapter-config-types';

/** Password visibility toggle for adapter auth tokens. */
export const AdapterConfigTokenField = ({
  adapter,
  showToken,
  onToggleToken,
  onUpdate,
  inputClass,
  t,
  isReadOnly = false,
}: {
  adapter: AdapterEntry;
  showToken: boolean;
  onToggleToken: () => void;
  onUpdate: (patch: Partial<AdapterEntry>) => void;
  inputClass: string;
  t: TFunction;
  isReadOnly?: boolean;
}) => (
  <div className="relative">
    <input
      id={`adapter-token-${adapter.id}`}
      type={showToken ? 'text' : 'password'}
      value={adapter.authToken}
      onChange={(e) => onUpdate({ authToken: e.target.value })}
      className={`${inputClass} pr-10`}
      placeholder="••••••••"
      disabled={isReadOnly}
    />
    <button
      type="button"
      onClick={onToggleToken}
      disabled={isReadOnly}
      className="absolute top-1/2 right-3 -translate-y-1/2 p-1 text-(--color-muted) hover:text-(--color-text)"
      aria-label={showToken ? t('common.hideKey') : t('common.showKey')}
    >
      {showToken ? <EyeOff size={14} aria-hidden="true" /> : <Eye size={14} aria-hidden="true" />}
    </button>
  </div>
);
