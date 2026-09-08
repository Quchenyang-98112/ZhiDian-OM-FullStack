import { motion } from 'motion/react';
import type { RefObject } from 'react';
import type { CommandPreview, ResolvedCommand } from '../../core/commands/types';
import { CommandPaletteFooter } from './CommandPaletteFooter';
import { CommandPaletteInput } from './CommandPaletteInput';
import { CommandPaletteList } from './CommandPaletteList';
import { CommandPalettePreviewPane } from './CommandPalettePreview';

interface CommandPaletteDialogProps {
  onClose: () => void;
  dialogRef: RefObject<HTMLDivElement | null>;
  containerFocusRef: RefObject<HTMLDivElement | null>;
  inputRef: RefObject<HTMLInputElement | null>;
  motionProps: Record<string, unknown>;
  search: string;
  setSearch: (value: string) => void;
  commands: ResolvedCommand[];
  clampedIndex: number;
  selectedCommand: ResolvedCommand | null;
  previewData: CommandPreview | null;
  activeDescendant?: string;
  hasListbox: boolean;
  onSelectCommand: (index: number) => void;
  setSelectedIndex: (index: number) => void;
}

export function CommandPaletteDialog({
  onClose,
  dialogRef,
  containerFocusRef,
  inputRef,
  motionProps,
  search,
  setSearch,
  commands,
  clampedIndex,
  selectedCommand,
  previewData,
  activeDescendant,
  hasListbox,
  onSelectCommand,
  setSelectedIndex,
}: CommandPaletteDialogProps) {
  return (
    <>
      <motion.div
        key="cmd-palette-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 z-modal-backdrop bg-black/80 backdrop-blur-sm"
      />
      <motion.div
        key="cmd-palette-dialog"
        ref={dialogRef}
        {...motionProps}
        className="fixed top-[10%] left-1/2 z-modal mx-4 flex w-full max-w-3xl -translate-x-1/2 overflow-hidden rounded-2xl border border-(--color-border) bg-(--color-surface) shadow-2xl backdrop-blur-3xl sm:top-1/4 sm:mx-0"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cmd-palette-title"
      >
        <div
          ref={containerFocusRef}
          tabIndex={-1}
          className="sr-only"
          data-testid="cmd-initial-focus"
        />

        <div className="flex min-w-0 flex-1 flex-col">
          <CommandPaletteInput
            value={search}
            onChange={setSearch}
            inputRef={inputRef}
            hasListbox={hasListbox}
            {...(activeDescendant !== undefined ? { activeDescendant } : {})}
          />

          <CommandPaletteList
            commands={commands}
            selectedIndex={clampedIndex}
            query={search}
            onSelect={onSelectCommand}
            onHover={setSelectedIndex}
          />

          <CommandPaletteFooter />
        </div>

        <CommandPalettePreviewPane command={selectedCommand} previewData={previewData} />
      </motion.div>
    </>
  );
}
