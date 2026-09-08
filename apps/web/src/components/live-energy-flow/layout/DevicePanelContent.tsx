import { BatteryPanel } from '../panels/BatteryPanel';
import { EVPanel } from '../panels/EVPanel';
import { HeatPumpPanel } from '../panels/HeatPumpPanel';
import { KNXPanel } from '../panels/KNXPanel';
import { StatsPanel } from '../panels/StatsPanel';
import type { DevicePanelProps, PanelId } from '../types';

/** Maps a panel id to its content, shared by the floating (desktop) and stacked
 * (mobile) layouts so the panel wiring lives in one place. */
export function DevicePanelContent({ id, props }: { id: PanelId; props: DevicePanelProps }) {
  switch (id) {
    case 'ev':
      return <EVPanel sendCommand={props.sendCommand} data={props.energyData} />;
    case 'heatpump':
      return <HeatPumpPanel sendCommand={props.sendCommand} data={props.energyData} />;
    case 'battery':
      return <BatteryPanel sendCommand={props.sendCommand} data={props.energyData} />;
    case 'knx':
      return <KNXPanel sendCommand={props.sendCommand} />;
    case 'stats':
      return (
        <StatsPanel
          energyData={props.energyData}
          selfSufficiency={props.selfSufficiency}
          selfConsumptionRate={props.selfConsumptionRate}
          gridImport={props.gridImport}
          gridExport={props.gridExport}
          batteryCharging={props.batteryCharging}
          isExporting={props.isExporting}
          locale={props.locale}
        />
      );
    default:
      return null;
  }
}
