import { AnimatePresence } from 'motion/react';
import { CommandPaletteDialog } from './CommandPaletteDialog';
import { type CommandPaletteProps, toControllerOptions } from './command-palette-props';
import { useCommandPaletteController } from './useCommandPaletteController';

export type { CommandPaletteProps } from './command-palette-props';

export function CommandPalette(props: CommandPaletteProps) {
  const { activeDescendant, ...controller } = useCommandPaletteController(
    toControllerOptions(props),
  );

  return (
    <AnimatePresence>
      {props.isOpen ? (
        <CommandPaletteDialog
          onClose={props.onClose}
          {...controller}
          {...(activeDescendant !== undefined ? { activeDescendant } : {})}
        />
      ) : null}
    </AnimatePresence>
  );
}
