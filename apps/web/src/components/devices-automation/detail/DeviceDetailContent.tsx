import type { UnifiedEnergyModel } from '../../../core/adapters/EnergyAdapter';
import type { EnergyData, StoredSettings } from '../../../types';
import type { SendCommand } from '../types';
import { BuildingDetail } from './BuildingDetail';
import { EVDetail } from './EVDetail';
import { HeatPumpDetail } from './HeatPumpDetail';
import { PVDetail } from './PVDetail';
import { StorageDetail } from './StorageDetail';

export function DeviceDetailContent({
  deviceId,
  data,
  unified,
  settings,
  sendCommand,
}: {
  deviceId: string;
  data: EnergyData;
  unified: UnifiedEnergyModel;
  settings: StoredSettings;
  sendCommand: SendCommand;
}) {
  switch (deviceId) {
    case 'pv':
      return <PVDetail data={data} settings={settings} />;
    case 'storage':
      return <StorageDetail data={data} sendCommand={sendCommand} />;
    case 'ev':
      return <EVDetail data={data} settings={settings} sendCommand={sendCommand} />;
    case 'heatpump':
      return <HeatPumpDetail data={data} sendCommand={sendCommand} />;
    case 'building':
      return <BuildingDetail unified={unified} sendCommand={sendCommand} />;
    default:
      return null;
  }
}
