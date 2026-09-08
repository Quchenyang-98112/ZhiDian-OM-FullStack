import type { LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { ResolvedCommand } from '../../core/commands/types';
import {
  getCommandItemButtonClass,
  getCommandItemIconWrapClass,
} from './command-palette-item-styles';
import { getSectionLabelKey } from './command-palette-list-utils';

const CATEGORY_KEYS: Record<ResolvedCommand['category'], string> = {
  navigation: 'command.categoryNavigation',
  action: 'command.categoryAction',
  device: 'command.categoryDevice',
  energy: 'command.categoryEnergy',
  settings: 'command.categorySettings',
  adapter: 'command.categoryAdapter',
  ai: 'command.categoryAi',
  system: 'command.categorySystem',
};

interface CommandPaletteItemProps {
  cmd: ResolvedCommand;
  index: number;
  isSelected: boolean;
  onSelect: () => void;
  onHover: () => void;
}

function CommandPaletteItemIcon({ icon, isSelected }: { icon?: LucideIcon; isSelected: boolean }) {
  if (!icon) return null;
  const Icon = icon;
  return (
    <div className={getCommandItemIconWrapClass(isSelected)} aria-hidden="true">
      <Icon className="h-5 w-5" />
    </div>
  );
}

function CommandPaletteItemSubtitle({
  cmd,
  categoryLabel,
  t,
}: {
  cmd: ResolvedCommand;
  categoryLabel: string;
  t: (key: string) => string;
}) {
  const sectionKey = getSectionLabelKey(cmd.section);
  const sectionLabel = sectionKey ? t(sectionKey) : categoryLabel;
  const descriptionSuffix = cmd.description ? ` · ${cmd.description}` : '';
  return (
    <p className="truncate text-(--color-muted) text-xs">
      {sectionLabel}
      {descriptionSuffix}
    </p>
  );
}

function CommandPaletteItemActions({
  cmd,
  isSelected,
  t,
}: {
  cmd: ResolvedCommand;
  isSelected: boolean;
  t: (key: string) => string;
}) {
  return (
    <>
      {cmd.isFavorite ? (
        <span className="text-(--color-primary) text-xs">
          <span aria-hidden="true">★</span>
          <span className="sr-only">{t('command.favorite')}</span>
        </span>
      ) : null}
      {cmd.disabled ? (
        <span className="sr-only">{t(cmd.disabledReasonKey ?? 'command.executeFailed')}</span>
      ) : null}
      {isSelected ? (
        <kbd className="hidden shrink-0 rounded bg-(--color-surface-strong) px-2 py-1 text-(--color-muted) text-xs sm:inline">
          ↵
        </kbd>
      ) : null}
    </>
  );
}

export function CommandPaletteItem({
  cmd,
  index,
  isSelected,
  onSelect,
  onHover,
}: CommandPaletteItemProps) {
  const { t } = useTranslation();
  const categoryLabel = t(CATEGORY_KEYS[cmd.category]);

  return (
    <button
      type="button"
      id={`cmd-${cmd.id}`}
      data-index={index}
      onClick={onSelect}
      onMouseEnter={onHover}
      role="option"
      tabIndex={-1}
      aria-selected={isSelected}
      aria-disabled={cmd.disabled}
      disabled={cmd.disabled}
      title={cmd.disabled ? t(cmd.disabledReasonKey ?? 'command.executeFailed') : undefined}
      className={getCommandItemButtonClass(isSelected, cmd.disabled)}
    >
      <CommandPaletteItemIcon
        {...(cmd.icon !== undefined ? { icon: cmd.icon } : {})}
        isSelected={isSelected}
      />
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{cmd.label}</p>
        <CommandPaletteItemSubtitle cmd={cmd} categoryLabel={categoryLabel} t={t} />
      </div>
      <CommandPaletteItemActions cmd={cmd} isSelected={isSelected} t={t} />
    </button>
  );
}
