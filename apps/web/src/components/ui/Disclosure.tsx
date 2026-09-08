import { ChevronDown } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { type ReactNode, useId, useState } from 'react';

export interface DisclosureProps {
  /** Primary label shown in the trigger row */
  title: ReactNode;
  /** Optional secondary line under the title */
  subtitle?: ReactNode;
  /** Collapsible body */
  children: ReactNode;
  /** Uncontrolled initial state */
  defaultOpen?: boolean;
  /** Controlled open state */
  open?: boolean;
  /** Fired when the user toggles expansion */
  onOpenChange?: (open: boolean) => void;
  /** Leading icon (device, section, etc.) */
  icon?: ReactNode;
  /** Trailing actions that must not toggle the panel (e.g. enable switch) */
  actions?: ReactNode;
  /** `glass` = standalone panel; `nested` = inside another card */
  variant?: 'glass' | 'nested';
  className?: string;
  disabled?: boolean;
}

/**
 * Modern glass-panel disclosure used across the app for expandable sections.
 * Replaces ad-hoc accordion implementations with a single a11y-safe primitive.
 */
export function Disclosure({
  title,
  subtitle,
  children,
  defaultOpen = false,
  open: controlledOpen,
  onOpenChange,
  icon,
  actions,
  variant = 'glass',
  className = '',
  disabled = false,
}: DisclosureProps) {
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const isOpen = controlledOpen ?? internalOpen;
  const panelId = useId();

  const toggle = () => {
    if (disabled) return;
    const next = !isOpen;
    setInternalOpen(next);
    onOpenChange?.(next);
  };

  const variantClass = variant === 'nested' ? 'disclosure-panel--nested' : '';

  return (
    <div className={`disclosure-panel ${variantClass} ${className}`.trim()}>
      <div className="disclosure-trigger-row">
        <button
          type="button"
          className="disclosure-trigger focus-ring"
          aria-expanded={isOpen}
          aria-controls={panelId}
          disabled={disabled}
          onClick={toggle}
        >
          {icon ? <span className="disclosure-icon">{icon}</span> : null}
          <span className="disclosure-trigger-text">
            <span className="disclosure-title">{title}</span>
            {subtitle ? <span className="disclosure-subtitle">{subtitle}</span> : null}
          </span>
          <motion.span
            className="disclosure-chevron"
            animate={{ rotate: isOpen ? 180 : 0 }}
            transition={{ duration: 0.25, ease: 'easeInOut' }}
            aria-hidden="true"
          >
            <ChevronDown className="h-4 w-4" />
          </motion.span>
        </button>
        {actions ? (
          // biome-ignore lint/a11y/noStaticElementInteractions: stops disclosure toggle when interacting with trailing controls
          <div
            className="disclosure-actions"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          >
            {actions}
          </div>
        ) : null}
      </div>

      <AnimatePresence initial={false}>
        {isOpen ? (
          <motion.div
            id={panelId}
            className="disclosure-content"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.28, ease: 'easeInOut' }}
            style={{ overflow: 'hidden' }}
          >
            <div className="disclosure-content-inner">{children}</div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
