import { Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface CommandPaletteInputProps {
  value: string;
  onChange: (value: string) => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
  hasListbox: boolean;
  activeDescendant?: string;
}

export function CommandPaletteInput({
  value,
  onChange,
  inputRef,
  hasListbox,
  activeDescendant,
}: CommandPaletteInputProps) {
  const { t } = useTranslation();

  return (
    <div className="flex items-center gap-3 border-(--color-border) border-b p-4">
      <Search className="h-5 w-5 shrink-0 text-(--color-muted)" aria-hidden="true" />
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={t('command.searchPlaceholder')}
        className="min-h-11 flex-1 bg-transparent text-(--color-text) outline-none placeholder:text-(--color-muted)"
        role="combobox"
        aria-expanded={hasListbox}
        {...(hasListbox ? { 'aria-controls': 'command-listbox' } : {})}
        aria-activedescendant={activeDescendant}
        aria-autocomplete="list"
        aria-label={t('accessibility.searchCommands')}
      />
      <span id="cmd-palette-title" className="sr-only">
        {t('accessibility.commandPaletteTitle')}
      </span>
      <kbd className="hidden rounded bg-(--color-surface-strong) px-2 py-1 text-(--color-muted) text-xs sm:inline">
        ESC
      </kbd>
    </div>
  );
}
