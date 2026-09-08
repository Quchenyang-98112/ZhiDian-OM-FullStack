import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useEnergyContext } from '../../../core/EnergyContext';
import { useEnergyStoreBase } from '../../../core/useEnergyStore';
import { useLegacySendCommand } from '../../../core/useLegacySendCommand';
import { resolveConnectionPresentation } from '../../../lib/adapter-mode';
import { useAppStore } from '../../../store';
import type { PanelId } from '../types';

/**
 * Orchestrates the Live Energy Flow page: energy data, hardware command
 * dispatch (via useLegacySendCommand → command-safety guards), fullscreen,
 * which floating panels are open, and derived grid/efficiency metrics. Keeps
 * the page component a thin composition layer.
 */
export function useLiveEnergyFlow() {
  const { i18n } = useTranslation();
  const locale = i18n.language;
  const { data: energyData, connected, selfSufficiencyPercent, isExporting } = useEnergyContext();
  const adapterMode = useAppStore((s) => s.adapterMode);
  const serverWsConnected = useEnergyStoreBase((s) => s.serverWsConnected);
  const connectionPresentation = resolveConnectionPresentation(
    connected,
    adapterMode,
    serverWsConnected,
  );
  const { sendCommand, ConfirmationDialog } = useLegacySendCommand();

  const containerRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [openPanels, setOpenPanels] = useState<Set<PanelId>>(new Set());

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current
        .requestFullscreen()
        .then(() => setIsFullscreen(true))
        .catch(() => {});
    } else {
      document
        .exitFullscreen()
        .then(() => setIsFullscreen(false))
        .catch(() => {});
    }
  };

  const togglePanel = (id: PanelId) => {
    setOpenPanels((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const closePanel = (id: PanelId) => {
    setOpenPanels((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };

  const selfConsumption = Math.min(energyData.pvPower, energyData.houseLoad);
  const selfConsumptionRate =
    energyData.pvPower > 0 ? (selfConsumption / energyData.pvPower) * 100 : 0;
  const gridImport = energyData.gridPower > 0 ? energyData.gridPower : 0;
  const gridExport = energyData.gridPower < 0 ? Math.abs(energyData.gridPower) : 0;
  const batteryCharging = energyData.batteryPower < 0;
  const hasData = energyData.pvPower > 0 || energyData.houseLoad > 0 || energyData.gridPower !== 0;

  return {
    locale,
    energyData,
    connected,
    connectionPresentation,
    hasData,
    selfSufficiencyPercent,
    isExporting,
    selfConsumptionRate,
    gridImport,
    gridExport,
    batteryCharging,
    sendCommand,
    ConfirmationDialog,
    containerRef,
    isFullscreen,
    toggleFullscreen,
    openPanels,
    togglePanel,
    closePanel,
  };
}
