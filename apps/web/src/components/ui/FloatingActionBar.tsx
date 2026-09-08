import { AnimatePresence, motion } from 'motion/react';
import { type ReactNode, useEffect } from 'react';

export interface FloatingActionBarProps {
  /** Whether the bar is currently visible */
  open: boolean;
  /** Primary action — rendered as the rightmost CTA */
  primaryAction: ReactNode;
  /** Optional secondary action(s) — rendered to the left of primary */
  secondaryAction?: ReactNode;
  /** Callback when the user presses Escape while the bar is open */
  onDismiss?: () => void;
  /** Accessible label for the bar region */
  ariaLabel?: string;
  /** Additional CSS classes */
  className?: string;
}

/**
 * Persistent bottom action bar for page-level actions (save, apply, reset).
 *
 * Appears only when the user has unsaved changes. Fixed to the bottom of the
 * viewport with glass blur, slides up on entry. Maximum 3 actions:
 * one primary, up to two secondary.
 *
 * Built on the `floating-action-bar` CSS utility from the design system.
 *
 * @example
 * ```tsx
 * <FloatingActionBar
 *   open={hasUnsavedChanges}
 *   primaryAction={<button className="btn-primary">Save</button>}
 *   secondaryAction={<button className="btn-secondary">Reset</button>}
 *   onDismiss={() => resetChanges()}
 * />
 * ```
 */
export function FloatingActionBar({
  open,
  primaryAction,
  secondaryAction,
  onDismiss,
  ariaLabel = 'Actions',
  className = '',
}: FloatingActionBarProps) {
  // Dismiss on Escape
  useEffect(() => {
    if (!open || !onDismiss) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onDismiss();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onDismiss]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className={`floating-action-bar ${className}`}
          role="toolbar"
          aria-label={ariaLabel}
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 24 }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
        >
          {secondaryAction}
          {primaryAction}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
