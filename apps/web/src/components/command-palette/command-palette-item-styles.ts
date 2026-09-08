export function getCommandItemButtonClass(isSelected: boolean, disabled: boolean): string {
  const base =
    'flex min-h-11 w-full items-center gap-3 rounded-xl px-4 py-3 text-left transition-colors';
  const state = isSelected
    ? 'bg-(--color-primary)/20 text-(--color-text)'
    : 'text-(--color-muted) hover:bg-(--color-surface-strong)';
  const disabledClass = disabled ? 'cursor-not-allowed opacity-50' : '';
  return `${base} ${state} ${disabledClass}`.trim();
}

export function getCommandItemIconWrapClass(isSelected: boolean): string {
  const base = 'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg';
  const state = isSelected ? 'bg-(--color-primary)/30' : 'bg-(--color-surface)';
  return `${base} ${state}`;
}
