import { useTranslation } from 'react-i18next';
import type { ResolvedCommand } from '../../core/commands/types';
import { CommandPaletteItem } from './CommandPaletteItem';
import type { FlatListRow } from './command-palette-list-utils';
import { getSectionLabelKey } from './command-palette-list-utils';

interface CommandPaletteListRowProps {
  row: FlatListRow;
  selectedIndex: number;
  onSelect: (index: number) => void;
  onHover: (index: number) => void;
}

function CommandPaletteSectionHeader({ section }: { section: ResolvedCommand['section'] }) {
  const { t } = useTranslation();
  const key = getSectionLabelKey(section);

  return (
    <div className="px-4 py-2 font-semibold text-(--color-muted) text-xs uppercase tracking-wide">
      {key ? t(key) : ''}
    </div>
  );
}

function CommandPaletteCommandRow({
  cmd,
  cmdIndex,
  selectedIndex,
  onSelect,
  onHover,
}: {
  cmd: ResolvedCommand;
  cmdIndex: number;
  selectedIndex: number;
  onSelect: (index: number) => void;
  onHover: (index: number) => void;
}) {
  return (
    <CommandPaletteItem
      cmd={cmd}
      index={cmdIndex}
      isSelected={cmdIndex === selectedIndex}
      onSelect={() => onSelect(cmdIndex)}
      onHover={() => onHover(cmdIndex)}
    />
  );
}

export function CommandPaletteListRow({
  row,
  selectedIndex,
  onSelect,
  onHover,
}: CommandPaletteListRowProps) {
  if (row.type === 'header') {
    return row.section ? <CommandPaletteSectionHeader section={row.section} /> : null;
  }

  const cmd = row.command;
  if (!cmd) return null;

  return (
    <CommandPaletteCommandRow
      cmd={cmd}
      cmdIndex={row.commandIndex ?? 0}
      selectedIndex={selectedIndex}
      onSelect={onSelect}
      onHover={onHover}
    />
  );
}
