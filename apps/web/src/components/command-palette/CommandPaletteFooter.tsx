import { useTranslation } from 'react-i18next';

export function CommandPaletteFooter() {
  const { t } = useTranslation();

  return (
    <div className="flex items-center justify-between border-(--color-border) border-t px-4 py-3 text-(--color-muted) text-xs">
      <span>{t('command.navigate')}</span>
      <div className="flex items-center gap-3">
        <span className="hidden sm:inline">{t('command.favoriteHint')}</span>
        <div className="flex gap-2">
          <kbd className="rounded bg-(--color-surface-strong) px-2 py-1">↑↓</kbd>
          <kbd className="rounded bg-(--color-surface-strong) px-2 py-1">↵</kbd>
        </div>
      </div>
    </div>
  );
}
