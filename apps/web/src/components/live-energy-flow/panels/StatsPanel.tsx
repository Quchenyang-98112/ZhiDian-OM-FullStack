import { Battery, Car, Home, Leaf, Sun, Thermometer, Zap } from 'lucide-react';
import type { ComponentType } from 'react';
import { useTranslation } from 'react-i18next';
import { formatPower } from '../../../lib/format';
import { ControlPanelDivider, ControlPanelSection } from '../../ui/ControlPanel';
import { GaugeBar } from '../shared/GaugeBar';

interface StatsEnergyData {
  pvPower: number;
  houseLoad: number;
  batteryPower: number;
  batterySoC: number;
  gridPower: number;
  heatPumpPower: number;
  evPower: number;
  pvYieldToday: number;
  priceCurrent: number;
}

interface StatRow {
  icon: ComponentType<{ size?: number; className?: string }>;
  label: string;
  value: string;
  color: string;
  sub?: string;
}

export function StatsPanel({
  energyData,
  selfSufficiency,
  selfConsumptionRate,
  gridImport,
  gridExport,
  batteryCharging,
  isExporting,
  locale,
}: {
  energyData: StatsEnergyData;
  selfSufficiency: number;
  selfConsumptionRate: number;
  gridImport: number;
  gridExport: number;
  batteryCharging: boolean;
  isExporting: boolean;
  locale: string;
}) {
  const { t } = useTranslation();

  const rows: StatRow[] = [
    {
      icon: Sun,
      label: t('metrics.pvGeneration'),
      value: formatPower(energyData.pvPower, locale),
      color: 'text-yellow-400',
    },
    {
      icon: Home,
      label: t('metrics.houseLoad'),
      value: formatPower(energyData.houseLoad, locale),
      color: 'text-cyan-400',
    },
    {
      icon: Battery,
      label: t('metrics.battery'),
      value: `${energyData.batterySoC.toFixed(0)}% · ${formatPower(Math.abs(energyData.batteryPower), locale)}`,
      color: 'text-emerald-400',
      sub: batteryCharging
        ? t('metrics.batteryCharging')
        : energyData.batteryPower > 0
          ? t('metrics.batteryDischarging')
          : t('metrics.batteryIdle'),
    },
    {
      icon: Zap,
      label: t('metrics.grid'),
      value: formatPower(Math.abs(energyData.gridPower), locale),
      color: energyData.gridPower > 0 ? 'text-red-400' : 'text-emerald-400',
      sub: energyData.gridPower > 0 ? t('metrics.import') : isExporting ? t('metrics.export') : '—',
    },
    {
      icon: Thermometer,
      label: t('dashboard.heatPump'),
      value: formatPower(energyData.heatPumpPower, locale),
      color: 'text-orange-400',
    },
    {
      icon: Car,
      label: t('dashboard.evCharging'),
      value: formatPower(energyData.evPower, locale),
      color: 'text-violet-400',
    },
  ];

  return (
    <div className="space-y-3">
      <ControlPanelSection title={t('liveEnergy.overview')}>
        <div className="space-y-2">
          {rows.map(({ icon: Icon, label, value, color, sub }) => (
            <div key={label} className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-1.5 text-(--color-muted)">
                <Icon size={14} className={color} /> {label}
              </span>
              <div className="text-right">
                <span className={`font-mono ${color}`}>{value}</span>
                {sub && <span className="block text-(--color-muted) text-[10px]">{sub}</span>}
              </div>
            </div>
          ))}
        </div>
      </ControlPanelSection>
      <ControlPanelDivider />
      <ControlPanelSection title={t('liveEnergy.efficiency')}>
        <div className="space-y-2">
          <GaugeBar
            label={t('energyFlow.selfSufficiency')}
            value={selfSufficiency}
            color="#22ff88"
          />
          <GaugeBar
            label={t('energyFlow.selfConsumptionRate')}
            value={selfConsumptionRate}
            color="#00f0ff"
          />
        </div>
      </ControlPanelSection>
      <ControlPanelDivider />
      <ControlPanelSection title={t('liveEnergy.gridExchange')}>
        <div className="flex gap-3 text-sm">
          <div className="flex-1 rounded-lg border border-red-500/20 bg-red-500/5 p-2 text-center">
            <p className="text-[10px] text-red-400">{t('metrics.import')}</p>
            <p className="font-mono font-semibold text-red-400 text-sm">
              {formatPower(gridImport, locale)}
            </p>
          </div>
          <div className="flex-1 rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-2 text-center">
            <p className="text-[10px] text-emerald-400">{t('metrics.export')}</p>
            <p className="font-mono font-semibold text-emerald-400 text-sm">
              {formatPower(gridExport, locale)}
            </p>
          </div>
        </div>
      </ControlPanelSection>
      <ControlPanelDivider />
      <div className="flex items-center justify-between text-(--color-muted) text-xs">
        <span className="flex items-center gap-1">
          <Leaf size={12} className="text-emerald-400" />
          {t('dashboard.pvYieldToday')}: {energyData.pvYieldToday.toFixed(1)} kWh
        </span>
        <span>
          {energyData.priceCurrent.toFixed(3)} {t('units.euroPerKwh')}
        </span>
      </div>
    </div>
  );
}
