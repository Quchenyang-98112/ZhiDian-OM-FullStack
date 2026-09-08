import { Info } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { HelpShortcutGroup } from './HelpShortcutGroup';

const NAV_SHORTCUTS = [
  { keys: ['⌘', 'K'], descKey: 'help.shortcutCmdK' },
  { keys: ['⌘', '/'], descKey: 'help.shortcutSearch' },
  { keys: ['Esc'], descKey: 'help.shortcutClose' },
] as const;

const ACTION_SHORTCUTS = [
  { keys: ['⌘', 'S'], descKey: 'help.shortcutSave' },
  { keys: ['⌘', 'E'], descKey: 'help.shortcutExport' },
  { keys: ['⌘', 'L'], descKey: 'help.shortcutLang' },
] as const;

/** Keyboard shortcut groups and platform note. */
export const HelpShortcutsBody = () => {
  const { t } = useTranslation();

  return (
    <div className="glass-panel-strong rounded-2xl p-6">
      <h2 className="mb-6 font-semibold text-xl">{t('help.keyboardShortcuts')}</h2>
      <div className="space-y-6">
        <HelpShortcutGroup title={t('help.shortcutNav')} shortcuts={NAV_SHORTCUTS} t={t} />
        <HelpShortcutGroup title={t('help.shortcutActions')} shortcuts={ACTION_SHORTCUTS} t={t} />
        <div className="flex items-start gap-3 rounded-xl border border-(--color-border) bg-(--color-surface) p-4">
          <Info size={16} className="mt-0.5 shrink-0 text-(--color-primary)" />
          <p className="text-(--color-muted) text-xs">{t('help.shortcutNote')}</p>
        </div>
      </div>
    </div>
  );
};
