import type { ResolvedCommand } from '../../core/commands/types';

const SECTION_KEYS: Record<ResolvedCommand['section'], string | null> = {
  recent: 'commandPalette.recentCommands',
  favorites: 'command.favorites',
  contextual: 'command.contextualSuggestions',
  ai: 'command.categoryAi',
  navigation: null,
  action: null,
  device: null,
  energy: null,
  settings: null,
  adapter: null,
  system: null,
};

export function getSectionLabelKey(section: ResolvedCommand['section']): string | null {
  return SECTION_KEYS[section];
}

const VIRTUAL_LIST_THRESHOLD = 20;

/** Testable virtualization gate — production passes `import.meta.env.VITEST`. */
export function shouldVirtualizeCommandListForEnv(rowCount: number, isVitest: boolean): boolean {
  if (rowCount <= VIRTUAL_LIST_THRESHOLD) return false;
  if (isVitest) return false;
  return true;
}

/** Virtual rows need a measurable scrollport; jsdom/Vitest has none — keep the flat list there. */
export function shouldVirtualizeCommandList(rowCount: number): boolean {
  return shouldVirtualizeCommandListForEnv(rowCount, import.meta.env.VITEST);
}

/** Matches CommandPaletteItem: min-h-11 + py-3 around h-10 icon row (~64px). */
export const COMMAND_PALETTE_ROW_HEIGHT = 64;
export const COMMAND_PALETTE_HEADER_HEIGHT = 36;

export interface FlatListRow {
  type: 'header' | 'command';
  section?: ResolvedCommand['section'];
  command?: ResolvedCommand;
  commandIndex?: number;
}

export function buildFlatRows(commands: ResolvedCommand[], showSections: boolean): FlatListRow[] {
  if (!showSections || commands.length === 0) {
    return commands.map((cmd, i) => ({ type: 'command' as const, command: cmd, commandIndex: i }));
  }

  const rows: FlatListRow[] = [];
  let lastSection: ResolvedCommand['section'] | null = null;

  for (let i = 0; i < commands.length; i++) {
    const cmd = commands[i]!;
    const headerKey = getSectionLabelKey(cmd.section);
    if (headerKey && cmd.section !== lastSection) {
      rows.push({ type: 'header', section: cmd.section });
      lastSection = cmd.section;
    }
    rows.push({ type: 'command', command: cmd, commandIndex: i });
  }

  return rows;
}
