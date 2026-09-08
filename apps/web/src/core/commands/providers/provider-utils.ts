import type { CommandContext } from '../types';

export function navigateAndClose(ctx: CommandContext, path: string): void {
  ctx.navigate(path);
  ctx.actions.closePalette();
}
