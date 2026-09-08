import type { ReactNode } from 'react';

/** Props for {@link HeaderKpiPill}. */
export interface HeaderKpiPillProps {
  /** Accessible title shown on hover/focus. */
  title: string;
  /** Pill contents (icon + value). */
  children: ReactNode;
  /** Optional extra Tailwind classes (e.g. responsive visibility). */
  className?: string;
}

/**
 * Shared chrome for a single KPI chip in the mobile header ticker.
 */
export function HeaderKpiPill({ title, children, className }: HeaderKpiPillProps) {
  return (
    <div
      className={`inline-flex shrink-0 items-center gap-1 rounded-full bg-(--color-surface)/60 px-2 py-0.5 font-medium text-xs${className ? ` ${className}` : ''}`}
      title={title}
    >
      {children}
    </div>
  );
}
