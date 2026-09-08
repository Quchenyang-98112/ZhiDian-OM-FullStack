import { useEffect, useMemo, useRef, useState } from 'react';
import '../../core/commands/providers';
import type { AdapterCommand } from '../../core/adapters/EnergyAdapter';
import {
  executeResolvedCommand,
  getContextualCommandIds,
  getRecentCommandIds,
  resolveCommands,
  scoreCommand,
  useCommandContext,
} from '../../core/commands';
import type { CommandPreview } from '../../core/commands/types';
import { useFocusTrap } from '../../lib/useFocusTrap';
import { useAppStoreShallow } from '../../store';
import {
  getPaletteMotionProps,
  handlePaletteKeyDown,
  invokeAsyncCommand,
  isDesktopViewport,
  resolveInitialFocusRef,
} from './command-palette-helpers';

export interface CommandPaletteControllerOptions {
  isOpen: boolean;
  onClose: () => void;
  onOptimize?: () => void;
  onExportReport?: () => void;
  executeHardwareCommand?: (command: AdapterCommand) => void;
}

export function useCommandPaletteController({
  isOpen,
  onClose,
  onOptimize,
  onExportReport,
  executeHardwareCommand,
}: CommandPaletteControllerOptions) {
  const [search, setSearch] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);

  const inputRef = useRef<HTMLInputElement>(null);
  const containerFocusRef = useRef<HTMLDivElement>(null);

  const { commandPalette, reducedMotion, recordCommandUsage, toggleCommandFavorite } =
    useAppStoreShallow((s) => ({
      commandPalette: s.commandPalette,
      reducedMotion: s.settings.reducedMotion,
      recordCommandUsage: s.recordCommandUsage,
      toggleCommandFavorite: s.toggleCommandFavorite,
    }));

  const ctx = useCommandContext({
    closePalette: onClose,
    recordUsage: recordCommandUsage,
    toggleFavorite: toggleCommandFavorite,
    ...(onOptimize !== undefined ? { onOptimize } : {}),
    ...(onExportReport !== undefined ? { onExportReport } : {}),
    ...(executeHardwareCommand !== undefined ? { executeHardwareCommand } : {}),
  });

  const autoFocusInput = isDesktopViewport();
  const dialogRef = useFocusTrap<HTMLDivElement>(isOpen, {
    onEscape: onClose,
    initialFocusRef: resolveInitialFocusRef(autoFocusInput, inputRef, containerFocusRef),
  });

  const recentIds = useMemo(() => getRecentCommandIds(commandPalette), [commandPalette]);
  const contextualIds = useMemo(() => getContextualCommandIds(ctx), [ctx]);

  const commands = useMemo(() => {
    if (!isOpen) return [];
    return resolveCommands(ctx, {
      query: search,
      recentIds,
      favoriteIds: commandPalette.favorites,
      contextualIds,
      scoreFn: scoreCommand,
    });
  }, [isOpen, search, ctx, recentIds, commandPalette.favorites, contextualIds]);

  useEffect(() => {
    if (!isOpen) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sync on dialog open
    setSearch('');
    setSelectedIndex(0);
  }, [isOpen]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset selection on query change
    setSelectedIndex(0);
  }, [search]);

  const clampedIndex = commands.length === 0 ? 0 : Math.min(selectedIndex, commands.length - 1);

  const runCommand = async (index: number) => {
    const cmd = commands[index];
    if (!cmd) return;
    const result = await executeResolvedCommand(cmd, ctx);
    if (result.ok) onClose();
  };

  const onSelectCommand = (index: number) => invokeAsyncCommand(runCommand, index);

  const selectedCommand = commands[clampedIndex] ?? null;

  const keyDownStateRef = useRef({
    isOpen,
    commandCount: commands.length,
    clampedIndex,
    selectedCommandId: selectedCommand?.id,
    setSelectedIndex,
    runCommand,
    onToggleFavorite: toggleCommandFavorite,
  });
  keyDownStateRef.current = {
    isOpen,
    commandCount: commands.length,
    clampedIndex,
    selectedCommandId: selectedCommand?.id,
    setSelectedIndex,
    runCommand,
    onToggleFavorite: toggleCommandFavorite,
  };

  useEffect(() => {
    if (!isOpen) return undefined;

    const onKeyDown = (e: KeyboardEvent) => handlePaletteKeyDown(e, keyDownStateRef.current);
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen]);
  const previewData: CommandPreview | null = useMemo(() => {
    if (!selectedCommand?.preview) return null;
    return selectedCommand.preview(ctx);
  }, [selectedCommand, ctx]);

  const activeDescendant = selectedCommand ? `cmd-${selectedCommand.id}` : undefined;
  const motionProps = getPaletteMotionProps(reducedMotion);
  const hasListbox = commands.length > 0;

  return {
    search,
    setSearch,
    setSelectedIndex,
    inputRef,
    containerFocusRef,
    dialogRef,
    commands,
    clampedIndex,
    selectedCommand,
    previewData,
    activeDescendant,
    hasListbox,
    motionProps,
    onSelectCommand,
  };
}
