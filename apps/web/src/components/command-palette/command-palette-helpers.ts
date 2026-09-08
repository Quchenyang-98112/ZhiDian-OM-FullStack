import type { Dispatch, RefObject, SetStateAction } from 'react';

export function isDesktopViewport(): boolean {
  return (
    typeof window !== 'undefined' && Boolean(window.matchMedia?.('(min-width: 1024px)').matches)
  );
}

export function getPaletteMotionProps(reducedMotion: boolean) {
  if (reducedMotion) {
    return { initial: false, animate: { opacity: 1 }, exit: { opacity: 0 } };
  }
  return {
    initial: { opacity: 0, scale: 0.95, y: -20 },
    animate: { opacity: 1, scale: 1, y: 0 },
    exit: { opacity: 0, scale: 0.95, y: -20 },
  };
}

export function invokeAsyncCommand(run: (index: number) => Promise<void>, index: number): void {
  run(index).catch(() => {});
}

export interface PaletteKeyDownOptions {
  isOpen: boolean;
  commandCount: number;
  clampedIndex: number;
  selectedCommandId?: string;
  setSelectedIndex: Dispatch<SetStateAction<number>>;
  runCommand: (index: number) => Promise<void>;
  onToggleFavorite?: (commandId: string) => void;
}

/** Number of rows to jump on PageUp/PageDown in the command palette list. */
const PAGE_JUMP_SIZE = 8;

export function handlePaletteKeyDown(e: KeyboardEvent, options: PaletteKeyDownOptions): void {
  const { isOpen, commandCount, clampedIndex, setSelectedIndex, runCommand } = options;
  if (!isOpen || commandCount === 0) return;

  if (e.key === 'ArrowDown') {
    e.preventDefault();
    setSelectedIndex((prev) => (prev + 1) % commandCount);
    return;
  }
  if (e.key === 'ArrowUp') {
    e.preventDefault();
    setSelectedIndex((prev) => (prev - 1 + commandCount) % commandCount);
    return;
  }
  if (e.key === 'Home') {
    e.preventDefault();
    setSelectedIndex(0);
    return;
  }
  if (e.key === 'End') {
    e.preventDefault();
    setSelectedIndex(commandCount - 1);
    return;
  }
  if (e.key === 'PageDown') {
    e.preventDefault();
    setSelectedIndex((prev) => Math.min(prev + PAGE_JUMP_SIZE, commandCount - 1));
    return;
  }
  if (e.key === 'PageUp') {
    e.preventDefault();
    setSelectedIndex((prev) => Math.max(prev - PAGE_JUMP_SIZE, 0));
    return;
  }
  if (e.key === 'Enter') {
    e.preventDefault();
    invokeAsyncCommand(runCommand, clampedIndex);
    return;
  }
  if (
    (e.key === 'y' || e.key === 'Y') &&
    e.shiftKey &&
    (e.metaKey || e.ctrlKey) &&
    options.onToggleFavorite &&
    options.selectedCommandId
  ) {
    e.preventDefault();
    options.onToggleFavorite(options.selectedCommandId);
  }
}

export function resolveInitialFocusRef(
  autoFocusInput: boolean,
  inputRef: RefObject<HTMLInputElement | null>,
  containerFocusRef: RefObject<HTMLDivElement | null>,
): RefObject<HTMLInputElement | null> | RefObject<HTMLDivElement | null> {
  return autoFocusInput ? inputRef : containerFocusRef;
}
