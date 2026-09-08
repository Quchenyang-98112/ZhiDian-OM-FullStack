import type { AdapterCommand } from '../../core/adapters/EnergyAdapter';
import type { CommandPaletteControllerOptions } from './useCommandPaletteController';

export interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onOptimize?: () => void;
  onExportReport?: () => void;
  executeHardwareCommand?: (command: AdapterCommand) => void;
}

/** Map public palette props to controller options (keeps CommandPalette lean for DeepSource). */
export function toControllerOptions({
  isOpen,
  onClose,
  onOptimize,
  onExportReport,
  executeHardwareCommand,
}: CommandPaletteProps): CommandPaletteControllerOptions {
  const options: CommandPaletteControllerOptions = { isOpen, onClose };
  if (onOptimize !== undefined) options.onOptimize = onOptimize;
  if (onExportReport !== undefined) options.onExportReport = onExportReport;
  if (executeHardwareCommand !== undefined) {
    options.executeHardwareCommand = executeHardwareCommand;
  }
  return options;
}
