import { WifiOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  DevicePanels,
  DeviceToggleBar,
  LiveEnergyTopBar,
  useLiveEnergyFlow,
} from '../components/live-energy-flow';
import { SankeyDiagram } from '../components/SankeyDiagram';
import { EmptyState } from '../components/ui/EmptyState';

function LiveEnergyFlowComponent() {
  const { t } = useTranslation();
  const flow = useLiveEnergyFlow();
  const { ConfirmationDialog } = flow;

  return (
    <div
      ref={flow.containerRef}
      className={`relative flex h-[calc(100dvh-8rem)] flex-col overflow-hidden ${flow.isFullscreen ? 'h-screen bg-(--color-background)' : ''}`}
    >
      <LiveEnergyTopBar
        connectionPresentation={flow.connectionPresentation}
        isFullscreen={flow.isFullscreen}
        onToggleFullscreen={flow.toggleFullscreen}
        energyData={flow.energyData}
        locale={flow.locale}
      />

      <DeviceToggleBar
        openPanels={flow.openPanels}
        onToggle={flow.togglePanel}
        energyData={flow.energyData}
        locale={flow.locale}
        selfSufficiency={flow.selfSufficiencyPercent}
      />

      {/* Sankey canvas (full remaining space) — SankeyDiagram left untouched. */}
      <div className="relative flex-1 overflow-hidden">
        {!flow.connected && !flow.hasData ? (
          <EmptyState
            icon={WifiOff}
            title={t('tour.liveEnergy.emptyTitle')}
            description={t('tour.liveEnergy.emptyDesc')}
            pulse
          />
        ) : (
          <SankeyDiagram data={flow.energyData} />
        )}

        <DevicePanels
          openPanels={flow.openPanels}
          onClose={flow.closePanel}
          sendCommand={flow.sendCommand}
          energyData={flow.energyData}
          selfSufficiency={flow.selfSufficiencyPercent}
          selfConsumptionRate={flow.selfConsumptionRate}
          gridImport={flow.gridImport}
          gridExport={flow.gridExport}
          batteryCharging={flow.batteryCharging}
          isExporting={flow.isExporting}
          locale={flow.locale}
        />
      </div>

      <ConfirmationDialog />
    </div>
  );
}

export default LiveEnergyFlowComponent;
