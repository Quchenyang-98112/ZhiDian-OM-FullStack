import {
  AlertTriangle,
  Command,
  FlaskConical,
  HelpCircle,
  Settings as SettingsIcon,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { NavLink, useLocation } from 'react-router-dom';

/** Props for {@link AppShellHeaderActions}. */
export interface AppShellHeaderActionsProps {
  /** Whether live adapter mode is active (hides simulation badge). */
  isLive: boolean;
  /** Whether any enabled adapter is degraded. */
  hasDegradedAdapter: boolean;
  /** Current electricity price in €/kWh. */
  priceCurrent: number;
  /** Opens the global command palette. */
  onOpenCommandPalette: () => void;
}

/**
 * Header quick actions: mode badges, price pill, command palette, help, and settings.
 */
export function AppShellHeaderActions({
  isLive,
  hasDegradedAdapter,
  onOpenCommandPalette,
}: AppShellHeaderActionsProps) {
  const { t } = useTranslation();
  const { search } = useLocation();
  const presentationMode = new URLSearchParams(search).get('presentation') === 'true';

  return (
    <div className="ml-auto flex items-center gap-1 sm:gap-2">
      {!isLive && !presentationMode && (
        <span
          role="status"
          className="inline-flex items-center gap-1.5 rounded-full border border-(--color-border) bg-(--color-surface-strong) px-2.5 py-1 font-semibold text-(--color-muted) text-[10px] uppercase tracking-wider"
          title={t('mode.simulationTitle')}
        >
          <FlaskConical size={12} aria-hidden="true" />
          {/* sr-only below sm so the status still has an accessible name when the
              text is visually hidden (otherwise the flask icon looks functionless). */}
          <span className="sr-only sm:not-sr-only">{t('mode.simulationBadge')}</span>
        </span>
      )}

      {hasDegradedAdapter && (
        <NavLink
          to="/monitoring"
          className="focus-ring inline-flex items-center gap-1.5 rounded-full border border-(--state-warning-border) bg-(--state-warning-bg)/15 px-2.5 py-1 font-semibold text-(--state-warning-fg) text-[10px] uppercase tracking-wider transition-colors hover:bg-(--state-warning-bg)/25"
          title={t('header.degradedAdaptersTitle')}
          aria-label={t('header.degradedAdapters')}
        >
          <AlertTriangle size={12} aria-hidden="true" />
          <span className="hidden sm:inline">{t('header.degradedAdapters')}</span>
        </NavLink>
      )}

      <button
        type="button"
        onClick={onOpenCommandPalette}
        className="focus-ring inline-flex items-center gap-2 rounded-full border border-(--color-border) bg-(--color-surface-strong) p-2 text-sm transition-colors duration-200 hover:bg-(--color-primary)/10 sm:px-3"
        title={t('command.open')}
      >
        <Command className="h-4 w-4" aria-hidden="true" />
        <span className="sr-only sm:hidden">{t('command.search')}</span>
        <span className="hidden sm:inline">{t('command.search')}</span>
        <kbd className="hidden rounded bg-(--color-surface-strong) px-1.5 py-0.5 text-xs lg:inline">
          ⌘K
        </kbd>
      </button>

      <NavLink
        to="/help"
        className={({ isActive }) =>
          `focus-ring hidden items-center justify-center rounded-full border p-2 transition-colors duration-200 lg:inline-flex ${
            isActive
              ? 'border-(--color-primary)/40 bg-(--color-primary)/15 text-(--color-primary)'
              : 'border-(--color-border) bg-(--color-surface-strong) text-(--color-muted) hover:bg-(--color-primary)/10 hover:text-(--color-primary)'
          }`
        }
        aria-label={t('nav.help')}
        title={t('nav.help')}
      >
        <HelpCircle className="h-4 w-4" />
      </NavLink>

      <NavLink
        to="/settings"
        className={({ isActive }) =>
          `focus-ring inline-flex items-center justify-center rounded-full border p-2 transition-colors duration-200 ${
            isActive
              ? 'border-(--color-primary)/40 bg-(--color-primary)/15 text-(--color-primary)'
              : 'border-(--color-border) bg-(--color-surface-strong) text-(--color-muted) hover:bg-(--color-primary)/10 hover:text-(--color-primary)'
          }`
        }
        aria-label={t('nav.settings')}
        title={t('nav.settings')}
      >
        <SettingsIcon className="h-4 w-4" />
      </NavLink>
    </div>
  );
}
