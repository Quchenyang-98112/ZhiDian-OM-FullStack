import type { ReactNode } from 'react';
import type { UnifiedEnergyModel } from '../../core/adapters/EnergyAdapter';
import type { CommandType, EnergyData, StoredSettings } from '../../types';
import type { EnergyCardVariant } from '../ui/EnergyCard';

export type DeviceView = 'grid' | 'floorplan';

export type DeviceCategory = 'all' | 'pv' | 'storage' | 'ev' | 'heatpump' | 'building';

export type SendCommand = (type: CommandType, value: number) => void;

export interface DeviceDefinition {
  id: string;
  category: DeviceCategory;
  icon: ReactNode;
  titleKey: string;
  variant: EnergyCardVariant;
}

/** The live data + settings + command dispatcher threaded through every device UI. */
export interface DeviceContext {
  data: EnergyData;
  unified: UnifiedEnergyModel;
  settings: StoredSettings;
  sendCommand: SendCommand;
}
