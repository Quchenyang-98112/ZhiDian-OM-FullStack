/**
 * @deprecated Import from `components/command-palette/CommandPalette` instead.
 * Re-export preserved for backward compatibility during migration.
 */

export type { CommandDefinition as Command } from '../../core/commands/types';
// eslint-disable-next-line react-refresh/only-export-components -- backward-compat barrel
export { useCommandPalette } from '../../core/commands/useGlobalShortcuts';
export { CommandPalette } from '../command-palette/CommandPalette';
export { CommandPaletteWithSafety } from '../command-palette/CommandPaletteWithSafety';
