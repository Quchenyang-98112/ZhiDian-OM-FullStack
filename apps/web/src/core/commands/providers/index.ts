import {
  isCoreProvidersBootstrapped,
  markCoreProvidersBootstrapped,
  registerCommand,
  registerCommandProvider,
} from '../command-registry';
import { adapterCommandsProvider } from './adapter-commands-provider';
import { createDeviceCommands } from './device-commands';
import { createEnergyCommands } from './energy-commands';
import { createHelpCommands } from './help-commands';
import { createNavigationCommands } from './navigation-commands';
import { createSettingsCommands } from './settings-commands';
import { createSystemCommands } from './system-commands';
import { createTariffCommands } from './tariff-commands';

/** Register built-in command providers once at module load. */
export function registerCoreCommands(): void {
  if (isCoreProvidersBootstrapped()) return;

  const all = [
    ...createNavigationCommands(),
    ...createHelpCommands(),
    ...createSettingsCommands(),
    ...createTariffCommands(),
    ...createEnergyCommands(),
    ...createDeviceCommands(),
    ...createSystemCommands(),
  ];

  for (const cmd of all) {
    registerCommand(cmd);
  }

  registerCommandProvider(adapterCommandsProvider);

  markCoreProvidersBootstrapped();
}

// Auto-register on import (App bootstrap)
registerCoreCommands();
