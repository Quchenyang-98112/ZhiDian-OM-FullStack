import type { ReactNode } from 'react';
import { createContext, useContext, useState } from 'react';
import { resolveConnectionPresentation } from '../lib/adapter-mode';
import { getDisplayData } from '../lib/demo-data';
import { useAppStoreShallow } from '../store';
import type { EnergyData } from '../types';
import type { UnifiedEnergyModel } from './adapters/EnergyAdapter';
import { useEnergyStore, useEnergyStoreBase } from './useEnergyStore';

// ─── Detail panel state (shared between Sankey and floating panels) ──

interface DetailPanelState {
  /** Which Sankey node (or device) is currently selected */
  nodeId: string | null;
  /** Whether the detail panel is visible */
  open: boolean;
  /** Open the panel for a specific node */
  openNode: (id: string) => void;
  /** Close the detail panel */
  close: () => void;
}

// ─── Context value ───────────────────────────────────────────────────

export interface EnergyContextValue {
  /** Legacy flat energy data — consumed by SankeyDiagram, LiveMetric, etc. */
  data: EnergyData;
  /** Full unified model from all adapters */
  unified: UnifiedEnergyModel;
  /** Whether at least one adapter is connected */
  connected: boolean;
  /** Timestamp of last data update */
  lastUpdated: number | null;
  /** Floating detail panel state (shared between Sankey + panels) */
  detailPanel: DetailPanelState;
  /** Self-sufficiency [0..100] */
  selfSufficiencyPercent: number;
  /** True when grid power is negative (feeding back to grid) */
  isExporting: boolean;
}

// ─── Context ─────────────────────────────────────────────────────────

const EnergyContext = createContext<EnergyContextValue | null>(null);

// ─── Provider ────────────────────────────────────────────────────────

export function EnergyProvider({ children }: { children: ReactNode }) {
  // Single combined subscription — one render trigger instead of two
  const {
    energyData: rawData,
    connected,
    adapterMode,
  } = useAppStoreShallow((s) => ({
    energyData: s.energyData,
    connected: s.connected,
    adapterMode: s.adapterMode,
  }));
  const serverWsConnected = useEnergyStoreBase((s) => s.serverWsConnected);
  const connectionPresentation = resolveConnectionPresentation(
    connected,
    adapterMode,
    serverWsConnected,
  );

  // Demo plant only in simulation chrome — matches AppShell header KPI policy
  const data =
    connectionPresentation === 'simulation' ? getDisplayData(rawData, connected) : rawData;

  const unified = useEnergyStore((s) => s.unified);
  const lastUpdated = useEnergyStore((s) => s.lastUpdated);

  // Detail panel state — local to this provider
  const [panelNodeId, setPanelNodeId] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);

  const detailPanel: DetailPanelState = {
    nodeId: panelNodeId,
    open: panelOpen,
    openNode: (id: string) => {
      setPanelNodeId(id);
      setPanelOpen(true);
    },
    close: () => {
      setPanelOpen(false);
    },
  };

  // Derived metrics
  const houseLoad = data.houseLoad;
  const gridImport = Math.max(0, data.gridPower);
  const selfSufficiencyPercent =
    houseLoad > 0 ? Math.min(100, Math.round(((houseLoad - gridImport) / houseLoad) * 100)) : 0;
  const isExporting = data.gridPower < 0;

  const value: EnergyContextValue = {
    data,
    unified,
    connected,
    lastUpdated,
    detailPanel,
    selfSufficiencyPercent,
    isExporting,
  };

  return <EnergyContext.Provider value={value}>{children}</EnergyContext.Provider>;
}

// ─── Hook ────────────────────────────────────────────────────────────

// eslint-disable-next-line react-refresh/only-export-components
export function useEnergyContext(): EnergyContextValue {
  const ctx = useContext(EnergyContext);
  if (!ctx) {
    throw new Error('useEnergyContext must be used within <EnergyProvider>');
  }
  return ctx;
}
