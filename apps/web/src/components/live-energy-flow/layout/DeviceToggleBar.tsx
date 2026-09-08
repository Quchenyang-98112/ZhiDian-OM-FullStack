import { Battery, Car, Gauge, Home, Thermometer } from 'lucide-react';
import type { ComponentType } from 'react';
import { useTranslation } from 'react-i18next';
import { formatPercent, formatPower } from '../../../lib/format';
import type { PanelId } from '../types';

interface ToggleBarEnergy {
  evPower: number;
  heatPumpPower: number;
  batteryPower: number;
  batterySoC: number;
}

interface NodeButton {
  id: PanelId;
  icon: ComponentType<{ size?: number; className?: string }>;
  label: string;
  color: string;
  value: string;
}

export function DeviceToggleBar({
  openPanels,
  onToggle,
  energyData,
  locale,
  selfSufficiency,
}: {
  openPanels: Set<PanelId>;
  onToggle: (id: PanelId) => void;
  energyData: ToggleBarEnergy;
  locale: string;
  selfSufficiency: number;
}) {
  const { t } = useTranslation();

  const nodeButtons: NodeButton[] = [
    {
      id: 'ev',
      icon: Car,
      label: t('control.evTitle'),
      color: 'text-violet-400',
      value: formatPower(energyData.evPower, locale),
    },
    {
      id: 'heatpump',
      icon: Thermometer,
      label: t('control.hpTitle'),
      color: 'text-orange-400',
      value: formatPower(energyData.heatPumpPower, locale),
    },
    {
      id: 'battery',
      icon: Battery,
      label: t('control.batteryTitle'),
      color: 'text-emerald-400',
      value: `${energyData.batterySoC.toFixed(0)}% · ${formatPower(Math.abs(energyData.batteryPower), locale)}`,
    },
    {
      id: 'knx',
      icon: Home,
      label: t('liveEnergy.knxRooms'),
      color: 'text-cyan-400',
      value: t('liveEnergy.knxToggle'),
    },
    {
      id: 'stats',
      icon: Gauge,
      label: t('liveEnergy.statistics'),
      color: 'text-(--color-primary)',
      value: formatPercent(selfSufficiency, locale),
    },
  ];

  return (
    <div
      className="scrollbar-hide flex gap-2 overflow-x-auto px-4 pb-2"
      role="toolbar"
      aria-label={t('liveEnergy.devicePanels')}
    >
      {nodeButtons.map((btn) => {
        const Icon = btn.icon;
        const isOpen = openPanels.has(btn.id);
        return (
          <button
            key={btn.id}
            type="button"
            onClick={() => onToggle(btn.id)}
            className={`focus-ring flex shrink-0 items-center gap-2 rounded-xl border px-3 py-1.5 font-medium text-xs transition-all ${
              isOpen
                ? 'border-(--color-primary)/40 bg-(--color-primary)/10 text-(--color-primary)'
                : 'border-(--color-border) bg-(--color-surface)/50 text-(--color-muted) hover:border-(--color-primary)/30'
            }`}
            aria-pressed={isOpen}
          >
            <Icon size={14} className={btn.color} aria-hidden="true" />
            {/* sr-only below sm keeps the device name in the accessible name
                (so screen readers hear "EV Charging 0 W", not just "0 W")
                without an aria-label that would break label-content-name-match. */}
            <span className="sr-only sm:not-sr-only">{btn.label}</span>
            <span className="font-mono tabular-nums">{btn.value}</span>
          </button>
        );
      })}
    </div>
  );
}
