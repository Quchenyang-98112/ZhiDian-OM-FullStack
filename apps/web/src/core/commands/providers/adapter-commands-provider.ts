import { PlugZap, Settings2 } from 'lucide-react';
import { type AdapterId, useEnergyStoreBase } from '../../useEnergyStore';
import type { CommandDefinition, CommandProvider } from '../types';
import { navigateAndClose } from './provider-utils';

function createAdapterSettingsCommand(adapterId: string, name: string): CommandDefinition {
  return {
    id: `adapter.settings.${adapterId}`,
    labelKey: 'command.openAdapterSettings',
    descriptionKey: 'command.openAdapterSettingsDesc',
    labelParams: () => ({ name }),
    icon: Settings2,
    category: 'adapter',
    risk: 'safe',
    keywords: ['adapter', 'settings', adapterId, name.toLowerCase()],
    source: 'adapter',
    adapterId,
    execute: (ctx) => navigateAndClose(ctx, '/settings?tab=adapters'),
  };
}

function createAdapterReconnectCommand(adapterId: string, name: string): CommandDefinition {
  return {
    id: `adapter.reconnect.${adapterId}`,
    labelKey: 'command.reconnectAdapter',
    descriptionKey: 'command.reconnectAdapterDesc',
    labelParams: () => ({ name }),
    icon: PlugZap,
    category: 'adapter',
    risk: 'moderate',
    blockedInReadOnly: true,
    keywords: ['reconnect', 'adapter', adapterId, name.toLowerCase()],
    source: 'adapter',
    adapterId,
    when: (ctx) => ctx.adapterStatuses.get(adapterId) === 'error',
    execute: (ctx) => {
      const id = adapterId as AdapterId;
      const entry = useEnergyStoreBase.getState().adapters[id];
      if (!entry) return;
      void entry.adapter.connect();
      ctx.actions.closePalette();
    },
  };
}

export const adapterCommandsProvider: CommandProvider = {
  id: 'adapters',
  priority: 90,
  getCommands: (ctx) => {
    const commands: CommandDefinition[] = [];
    for (const entry of ctx.adapterEntries.values()) {
      commands.push(createAdapterSettingsCommand(entry.id, entry.name));
      if (entry.status === 'error') {
        commands.push(createAdapterReconnectCommand(entry.id, entry.name));
      }
    }
    return commands;
  },
};
