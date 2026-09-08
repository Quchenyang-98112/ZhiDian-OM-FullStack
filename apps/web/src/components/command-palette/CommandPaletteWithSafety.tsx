import { useSafeCommand } from '../../core/useSafeCommand';
import { CommandPalette, type CommandPaletteProps } from './CommandPalette';

export type CommandPaletteWithSafetyProps = Omit<CommandPaletteProps, 'executeHardwareCommand'>;

/**
 * Command palette shell that routes danger/moderate hardware commands through
 * `useSafeCommand` (confirmation dialog, validation, audit trail).
 */
export function CommandPaletteWithSafety(props: CommandPaletteWithSafetyProps) {
  const { execute, ConfirmationDialog } = useSafeCommand();

  return (
    <>
      <CommandPalette {...props} executeHardwareCommand={execute} />
      <ConfirmationDialog />
    </>
  );
}
