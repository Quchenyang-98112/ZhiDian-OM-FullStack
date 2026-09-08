interface HelpShortcutEntryProps {
  description: string;
  keys: string[];
}

/** Single keyboard shortcut row with one or more key badges. */
export const HelpShortcutEntry = ({ description, keys }: HelpShortcutEntryProps) => (
  <div className="flex items-center justify-between rounded-lg border border-(--color-border) bg-(--color-surface) p-3">
    <span className="text-sm">{description}</span>
    <div className="flex items-center gap-1">
      {keys.map((k) => (
        <kbd
          key={k}
          className="rounded-md border border-(--color-border) bg-(--color-surface-strong) px-2 py-1 font-mono text-xs"
        >
          {k}
        </kbd>
      ))}
    </div>
  </div>
);
