import type { CommandPreview, ResolvedCommand } from '../../core/commands/types';
import { CommandPalettePreviewBody } from './CommandPalettePreviewBody';

interface CommandPalettePreviewPaneProps {
  command: ResolvedCommand | null;
  previewData: CommandPreview | null;
}

export function CommandPalettePreviewPane({
  command,
  previewData,
}: CommandPalettePreviewPaneProps) {
  if (!command || !previewData) return null;

  return (
    <aside
      className="hidden border-(--color-border) border-l bg-(--color-surface-strong)/50 p-4 lg:block lg:w-64"
      aria-live="polite"
    >
      <CommandPalettePreviewBody previewData={previewData} />
    </aside>
  );
}
