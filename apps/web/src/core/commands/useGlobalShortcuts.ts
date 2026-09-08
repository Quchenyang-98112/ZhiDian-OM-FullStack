import { useCallback, useEffect, useState } from 'react';
import { useAppStore } from '../../store';

export interface CommandPaletteShortcutHandlers {
  onTogglePalette: () => void;
  onExportReport?: (() => void) | undefined;
}

/**
 * Global keyboard shortcuts — respects `settings.keyboardShortcuts`.
 */
export function useGlobalShortcuts(handlers: CommandPaletteShortcutHandlers): void {
  const keyboardShortcuts = useAppStore((s) => s.settings.keyboardShortcuts);

  useEffect(() => {
    if (!keyboardShortcuts) return undefined;

    const handleKeyDown = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod || e.repeat) return;

      if (e.key === 'k') {
        e.preventDefault();
        handlers.onTogglePalette();
        return;
      }

      if (e.key === 'e' && handlers.onExportReport) {
        e.preventDefault();
        handlers.onExportReport();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [keyboardShortcuts, handlers.onTogglePalette, handlers.onExportReport]);
}

/** Palette open state + global shortcut wiring. */
export function useCommandPalette(onExportReport?: () => void) {
  const [isOpen, setIsOpen] = useState(false);

  const toggle = useCallback(() => {
    setIsOpen((prev) => !prev);
  }, []);

  useGlobalShortcuts({
    onTogglePalette: toggle,
    ...(onExportReport !== undefined ? { onExportReport } : {}),
  });

  return { isOpen, setIsOpen, toggle };
}
