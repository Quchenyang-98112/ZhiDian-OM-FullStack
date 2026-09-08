import { LayoutGrid, Map as MapIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { hapticClick } from '../../../lib/haptics';
import type { DeviceView } from '../types';

function ViewTab({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`focus-ring flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-medium text-xs transition-all ${
        active
          ? 'bg-(--color-primary)/15 text-(--color-primary)'
          : 'text-(--color-muted) hover:text-(--color-text)'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

export function ViewToggle({
  view,
  onChange,
}: {
  view: DeviceView;
  onChange: (view: DeviceView) => void;
}) {
  const { t } = useTranslation();
  return (
    <div
      className="flex gap-1 rounded-xl bg-(--color-surface)/50 p-1"
      role="tablist"
      aria-label={t('devicesAuto.viewToggle')}
    >
      <ViewTab
        active={view === 'grid'}
        onClick={() => {
          hapticClick();
          onChange('grid');
        }}
        icon={<LayoutGrid size={14} />}
        label={t('devicesAuto.viewGrid')}
      />
      <ViewTab
        active={view === 'floorplan'}
        onClick={() => {
          hapticClick();
          onChange('floorplan');
        }}
        icon={<MapIcon size={14} />}
        label={t('devicesAuto.viewFloorplan')}
      />
    </div>
  );
}
