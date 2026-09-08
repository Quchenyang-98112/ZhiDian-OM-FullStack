import { ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { UnifiedEnergyModel } from '../../../core/adapters/EnergyAdapter';
import type { EnergyData, StoredSettings } from '../../../types';
import { MetricRow } from '../shared/MetricRow';

export function DeviceInlineDetails({
  deviceId,
  data,
  unified,
  settings,
  onOpenDetail,
}: {
  deviceId: string;
  data: EnergyData;
  unified: UnifiedEnergyModel;
  settings: StoredSettings;
  onOpenDetail: () => void;
}) {
  const { t } = useTranslation();
  const peakKWp = settings.systemConfig.pv.peakPowerKWp;

  return (
    <div className="space-y-3 border-(--color-border) border-t pt-3">
      {deviceId === 'pv' && (
        <>
          <MetricRow label={t('devicesAuto.peakPower')} value={`${peakKWp} kWp`} />
          <MetricRow
            label={t('devicesAuto.utilization')}
            value={`${peakKWp > 0 ? ((data.pvPower / 1000 / peakKWp) * 100).toFixed(0) : 0}%`}
          />
        </>
      )}
      {deviceId === 'storage' && (
        <MetricRow label={t('devicesAuto.voltage')} value={`${data.batteryVoltage.toFixed(1)} V`} />
      )}
      {deviceId === 'ev' && (
        <MetricRow
          label={t('devicesAuto.model')}
          value={settings.systemConfig.evCharger.model || '—'}
        />
      )}
      {deviceId === 'heatpump' && (
        <MetricRow label={t('devicesAuto.sgReadyMode')} value={t('control.hpMode2')} />
      )}
      {deviceId === 'building' &&
        (unified.knx?.rooms ?? []).slice(0, 2).map((room) => (
          <div key={room.name} className="flex items-center justify-between text-xs">
            <span className="font-medium text-(--color-text)">{room.name}</span>
            <span className="text-(--color-muted)">{room.temperature.toFixed(1)} °C</span>
          </div>
        ))}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onOpenDetail();
        }}
        className="focus-ring flex w-full items-center justify-center gap-1 rounded-lg border border-(--color-border) bg-(--color-surface) px-3 py-1.5 font-medium text-(--color-muted) text-xs transition-colors hover:border-(--color-primary)/40 hover:text-(--color-primary)"
      >
        {t('devicesAuto.fullDetails')}
        <ChevronRight size={14} aria-hidden="true" />
      </button>
    </div>
  );
}
