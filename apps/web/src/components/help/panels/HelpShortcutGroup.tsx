import { HelpShortcutEntry } from './HelpShortcutEntry';

/** Keyboard shortcut group heading plus key rows. */
export const HelpShortcutGroup = ({
  title,
  shortcuts,
  t,
}: {
  title: string;
  shortcuts: ReadonlyArray<{ keys: readonly string[]; descKey: string }>;
  t: (key: string) => string;
}) => (
  <div>
    <h3 className="mb-3 font-semibold text-(--color-muted) text-sm uppercase tracking-widest">
      {title}
    </h3>
    <div className="space-y-2">
      {shortcuts.map((s) => (
        <HelpShortcutEntry key={s.descKey} description={t(s.descKey)} keys={[...s.keys]} />
      ))}
    </div>
  </div>
);
