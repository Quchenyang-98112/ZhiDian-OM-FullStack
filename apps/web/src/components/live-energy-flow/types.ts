import type { CommandType } from '../../types';

export type Position = { x: number; y: number };

export type PanelId = 'ev' | 'heatpump' | 'battery' | 'knx' | 'stats';

/** Initial positions for the floating device panels (negative x = right-anchored). */
export const PANEL_DEFAULTS: Record<PanelId, Position> = {
  ev: { x: 16, y: 80 },
  heatpump: { x: 16, y: 320 },
  battery: { x: 16, y: 560 },
  knx: { x: -380, y: 80 },
  stats: { x: -380, y: 400 },
};

/** Render order + right-anchoring for the panels (used by both layouts). */
export const PANEL_CONFIG: { id: PanelId; anchorRight?: boolean }[] = [
  { id: 'ev' },
  { id: 'heatpump' },
  { id: 'battery' },
  { id: 'knx', anchorRight: true },
  { id: 'stats', anchorRight: true },
];

export interface PanelsEnergy {
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

/** Shared props for rendering any device panel's content in either layout. */
export interface DevicePanelProps {
  sendCommand: (type: CommandType, value: number) => void;
  energyData: PanelsEnergy;
  selfSufficiency: number;
  selfConsumptionRate: number;
  gridImport: number;
  gridExport: number;
  batteryCharging: boolean;
  isExporting: boolean;
  locale: string;
}
