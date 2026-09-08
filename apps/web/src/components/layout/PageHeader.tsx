import { motion } from 'motion/react';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  actions?: React.ReactNode;
  /**
   * Sticky sub-header band below the fixed AppShell header — mobile only.
   * Used on /optimization-ai where KPI glass cards otherwise bleed through the
   * subtitle row on scroll. The global app header is already position:fixed
   * (see header-fixed.spec.ts / CHANGELOG #198).
   */
  mobileSticky?: boolean;
}

function PageHeaderComponent({
  title,
  subtitle,
  icon,
  actions,
  mobileSticky = false,
}: PageHeaderProps) {
  return (
    <motion.div
      className={`mb-4 flex flex-col gap-4 sm:mb-6 sm:flex-row sm:items-center sm:justify-between${
        mobileSticky ? 'page-header page-header--mobile-only' : ''
      }`}
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="flex min-w-0 items-center gap-3">
        {icon && (
          <motion.div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-(--color-primary)/20 bg-(--color-primary)/10 text-(--color-primary)"
            aria-hidden="true"
            whileHover={{ rotate: 8, scale: 1.08 }}
            transition={{ type: 'spring', stiffness: 400, damping: 17 }}
          >
            {icon}
          </motion.div>
        )}
        <div className="min-w-0">
          {/* Mobile: route title lives in AppShell — keep h1 for a11y/SEO only */}
          <h1 className="lg:fluid-text-2xl sr-only truncate font-semibold tracking-tight lg:not-sr-only lg:mb-0">
            {title}
          </h1>
          {subtitle && (
            <p className="fluid-text-sm truncate font-medium text-(--color-text) lg:mt-0.5 lg:font-normal lg:text-(--color-muted)">
              {subtitle}
            </p>
          )}
        </div>
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </motion.div>
  );
}

export const PageHeader = PageHeaderComponent;
