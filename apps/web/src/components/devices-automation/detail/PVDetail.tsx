import { useTranslation } from 'react-i18next';
import type { EnergyData, StoredSettings } from '../../../types';
import { Disclosure } from '../../ui/Disclosure';
import { MetricRow } from '../shared/MetricRow';

export function PVDetail({ data, settings }: { data: EnergyData; settings: StoredSettings }) {
  const { t } = useTranslation();
  const peakKWp = settings.systemConfig.pv.peakPowerKWp;
  const currentKW = data.pvPower / 1000;
  const utilizationPct = peakKWp > 0 ? (currentKW / peakKWp) * 100 : 0;

  return (
    <div className="space-y-4">
      <MetricRow label={t('devicesAuto.currentPower')} value={`${currentKW.toFixed(2)} kW`} />
      <MetricRow
        label={t('devicesAuto.yieldToday')}
        value={`${data.pvYieldToday.toFixed(1)} kWh`}
      />
      <MetricRow label={t('devicesAuto.peakPower')} value={`${peakKWp} kWp`} />
      <MetricRow label={t('devicesAuto.utilization')} value={`${utilizationPct.toFixed(0)}%`} />
      <Disclosure variant="nested" title={t('devicesAuto.technicalDetails')} defaultOpen={false}>
        <div className="space-y-3">
          <MetricRow
            label={t('devicesAuto.orientation')}
            value={settings.systemConfig.pv.orientation}
          />
          <MetricRow
            label={t('devicesAuto.strings')}
            value={`${settings.systemConfig.pv.strings} × ${settings.systemConfig.pv.mpptCount} MPPT`}
          />
        </div>
      </Disclosure>
    </div>
  );
}
