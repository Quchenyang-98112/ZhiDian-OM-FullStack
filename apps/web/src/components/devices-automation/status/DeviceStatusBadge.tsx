import { useTranslation } from 'react-i18next';
import type { UnifiedEnergyModel } from '../../../core/adapters/EnergyAdapter';
import type { EnergyData } from '../../../types';
import { getDeviceStatus } from '../utils';

export function DeviceStatusBadge({
  deviceId,
  data,
  unified,
}: {
  deviceId: string;
  data: EnergyData;
  unified: UnifiedEnergyModel;
}) {
  const { t } = useTranslation();
  const { label, color } = getDeviceStatus(deviceId, data, unified);
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium text-xs ${color}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
      {t(label)}
    </span>
  );
}
