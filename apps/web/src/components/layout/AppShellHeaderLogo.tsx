import { motion } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import type { ConnectionPresentation } from '../../lib/adapter-mode';

/** Props for {@link AppShellHeaderLogo}. */
export interface AppShellHeaderLogoProps {
  /** Resolved connection chrome label. */
  connectionPresentation: ConnectionPresentation;
}

/**
 * Mobile header logo with a connection-status indicator (connected, simulation, or disconnected).
 */
export function AppShellHeaderLogo({ connectionPresentation }: AppShellHeaderLogoProps) {
  const { t } = useTranslation();

  return (
    <Link
      to="/"
      className="focus-ring relative shrink-0 rounded-lg lg:hidden"
      aria-label={t('nav.home')}
    >
      <motion.img
        src={`${import.meta.env.BASE_URL}icon.svg`}
        alt=""
        className="h-7 w-7 rounded-lg"
        aria-hidden="true"
        whileHover={{ rotate: 10, scale: 1.1 }}
        transition={{ type: 'spring', stiffness: 400, damping: 17 }}
      />
      <span
        className={`absolute -right-0.5 -bottom-0.5 h-2.5 w-2.5 rounded-full border-(--color-surface-strong) border-2 ${
          connectionPresentation === 'connected'
            ? 'bg-(--color-neon-green) shadow-[0_0_6px_var(--color-neon-green)]'
            : connectionPresentation === 'simulation'
              ? 'bg-(--color-primary) shadow-[0_0_6px_var(--color-primary)]'
              : 'bg-(--state-danger-bg) shadow-[0_0_6px_var(--state-danger-bg)]'
        }`}
        aria-hidden="true"
      />
    </Link>
  );
}
