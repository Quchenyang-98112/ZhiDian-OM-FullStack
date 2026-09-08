import { useVirtualizer } from '@tanstack/react-virtual';
import { SearchX } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { ResolvedCommand } from '../../core/commands/types';
import { EmptyState } from '../ui/EmptyState';
import { CommandPaletteListRow } from './CommandPaletteListRow';
import {
  buildFlatRows,
  COMMAND_PALETTE_HEADER_HEIGHT,
  COMMAND_PALETTE_ROW_HEIGHT,
  type FlatListRow,
  shouldVirtualizeCommandList,
} from './command-palette-list-utils';

interface CommandPaletteListProps {
  commands: ResolvedCommand[];
  selectedIndex: number;
  query: string;
  onSelect: (index: number) => void;
  onHover: (index: number) => void;
}

function estimateRowHeight(row: FlatListRow | undefined): number {
  return row?.type === 'header' ? COMMAND_PALETTE_HEADER_HEIGHT : COMMAND_PALETTE_ROW_HEIGHT;
}

function findRowIndexForCommand(rows: FlatListRow[], commandIndex: number): number {
  return rows.findIndex((row) => row.type === 'command' && row.commandIndex === commandIndex);
}

function CommandPaletteVirtualList({
  rows,
  selectedIndex,
  onSelect,
  onHover,
}: {
  rows: FlatListRow[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  onHover: (index: number) => void;
}) {
  const parentRef = useRef<HTMLDivElement>(null);
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (index) => estimateRowHeight(rows[index]),
    overscan: 5,
  });

  useEffect(() => {
    const rowIndex = findRowIndexForCommand(rowsRef.current, selectedIndex);
    if (rowIndex >= 0) {
      virtualizer.scrollToIndex(rowIndex, { align: 'auto' });
    }
  }, [selectedIndex, virtualizer]);

  return (
    <div ref={parentRef} className="max-h-96 overflow-y-auto p-2">
      <div
        role="listbox"
        id="command-listbox"
        style={{ height: `${virtualizer.getTotalSize()}px`, position: 'relative' }}
      >
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const row = rows[virtualRow.index];
          if (!row) return null;

          return (
            <div
              key={virtualRow.key}
              data-index={virtualRow.index}
              ref={virtualizer.measureElement}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              <CommandPaletteListRow
                row={row}
                selectedIndex={selectedIndex}
                onSelect={onSelect}
                onHover={onHover}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function CommandPaletteList({
  commands,
  selectedIndex,
  query,
  onSelect,
  onHover,
}: CommandPaletteListProps) {
  const { t } = useTranslation();
  const showSections = query.trim().length === 0;
  const rows = buildFlatRows(commands, showSections);

  if (commands.length === 0) {
    return (
      <div role="status" aria-live="polite">
        <EmptyState icon={SearchX} title={t('command.noResults')} />
      </div>
    );
  }

  if (shouldVirtualizeCommandList(rows.length)) {
    return (
      <CommandPaletteVirtualList
        rows={rows}
        selectedIndex={selectedIndex}
        onSelect={onSelect}
        onHover={onHover}
      />
    );
  }

  return (
    <div className="max-h-96 overflow-y-auto p-2">
      <div role="listbox" id="command-listbox" className="space-y-1">
        {rows.map((row, rowIndex) => (
          <CommandPaletteListRow
            key={row.type === 'header' ? `header-${row.section}` : (row.command?.id ?? rowIndex)}
            row={row}
            selectedIndex={selectedIndex}
            onSelect={onSelect}
            onHover={onHover}
          />
        ))}
      </div>
    </div>
  );
}
