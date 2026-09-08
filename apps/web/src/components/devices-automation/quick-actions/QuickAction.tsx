import { Leaf } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { EnergyData, StoredSettings } from '../../../types';
import type { SendCommand } from '../types';
import { BatteryQuickAction } from './BatteryQuickAction';
import { BuildingQuickAction } from './BuildingQuickAction';
import { EVQuickAction } from './EVQuickAction';
import { HeatPumpQuickAction } from './HeatPumpQuickAction';

/** 1-click control shown in each device card footer. */
export function QuickAction({
  deviceId,
  data,
  settings,
  sendCommand,
}: {
  deviceId: string;
  data: EnergyData;
  settings: StoredSettings;
  sendCommand: SendCommand;
}) {
  const { t } = useTranslation();

  switch (deviceId) {
    case 'pv':
      return (
        <span className="flex items-center gap-1 text-(--color-muted) text-xs">
          <Leaf size={12} className="text-emerald-400" />
          {t('devicesAuto.pvAutoOptimized')}
        </span>
      );
    case 'storage':
      return <BatteryQuickAction data={data} sendCommand={sendCommand} />;
    case 'ev':
      return <EVQuickAction data={data} settings={settings} sendCommand={sendCommand} />;
    case 'heatpump':
      return <HeatPumpQuickAction sendCommand={sendCommand} />;
    case 'building':
      return <BuildingQuickAction sendCommand={sendCommand} />;
    default:
      return null;
  }
}
