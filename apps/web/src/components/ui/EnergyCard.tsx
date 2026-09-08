import { ChevronDown } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { type ReactNode, useState } from 'react';

/** Variant determines the accent border color on hover/active */
export type EnergyCardVariant = 'primary' | 'success' | 'warning' | 'danger' | 'neutral';

export interface EnergyCardProps {
  /** Card header content (icon + label + metric) */
  children: ReactNode;
  /** Expandable detail section shown below the header */
  details?: ReactNode;
  /** Optional action row below the header (outside the expand trigger) */
  footer?: ReactNode;
  /** Whether the details section starts expanded */
  defaultExpanded?: boolean;
  /** Controlled expanded state — overrides internal toggle */
  expanded?: boolean;
  /** Callback when expansion state changes */
  onExpandedChange?: (expanded: boolean) => void;
  /** Accent variant for hover/active border glow */
  variant?: EnergyCardVariant;
  /** Additional CSS classes */
  className?: string;
}

const variantAccent: Record<EnergyCardVariant, string> = {
  primary: 'hover:shadow-[0_0_0_1px_color-mix(in_srgb,var(--color-primary)_30%,transparent)]',
  success: 'hover:shadow-[0_0_0_1px_var(--state-success-border)]',
  warning: 'hover:shadow-[0_0_0_1px_var(--state-warning-border)]',
  danger: 'hover:shadow-[0_0_0_1px_var(--state-danger-border)]',
  neutral: '',
};

/**
 * Mid-level energy subsystem card (Level 1 in card hierarchy).
 *
 * Combines a glanceable header with an optional collapsible details section.
 * Built on the `energy-card` CSS utility class from the design system.
 *
 * @example
 * ```tsx
 * <EnergyCard details={<p>Charging · 1.4 kW</p>}>
 *   <EnergyCardHeader>
 *     <Zap className="w-5 h-5" />
 *     <span className="eyebrow">Battery</span>
 *     <LiveMetric value={78} unit="%" />
 *   </EnergyCardHeader>
 * </EnergyCard>
 * ```
 */
export function EnergyCard({
  children,
  details,
  footer,
  defaultExpanded = false,
  expanded: controlledExpanded,
  onExpandedChange,
  variant = 'primary',
  className = '',
}: EnergyCardProps) {
  const [internalExpanded, setInternalExpanded] = useState(defaultExpanded);
  const isExpanded = controlledExpanded ?? internalExpanded;

  const toggle = () => {
    const next = !isExpanded;
    setInternalExpanded(next);
    onExpandedChange?.(next);
  };

  const hasDetails = details != null;

  return (
    <motion.div
      className={`energy-card ${variantAccent[variant]} ${className}`}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
    >
      {/* Header — clickable when details exist */}
      {/* biome-ignore lint/a11y/noStaticElementInteractions: role and tabIndex applied conditionally when interactive */}
      {/* biome-ignore lint/a11y/useAriaPropsSupportedByRole: aria-expanded is valid on role=button per ARIA 1.2 */}
      <div
        className="energy-card-header"
        role={hasDetails ? 'button' : undefined}
        tabIndex={hasDetails ? 0 : undefined}
        aria-expanded={hasDetails ? isExpanded : undefined}
        onClick={hasDetails ? toggle : undefined}
        onKeyDown={
          hasDetails
            ? (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  toggle();
                }
              }
            : undefined
        }
      >
        <div className="flex flex-1 items-center gap-3">{children}</div>
        {hasDetails && (
          <motion.span
            animate={{ rotate: isExpanded ? 180 : 0 }}
            transition={{ duration: 0.25 }}
            aria-hidden="true"
          >
            <ChevronDown className="h-4 w-4 text-(--color-muted)" />
          </motion.span>
        )}
      </div>

      {footer ? <div className="energy-card-footer">{footer}</div> : null}

      {/* Collapsible details */}
      <AnimatePresence initial={false}>
        {hasDetails && isExpanded && (
          <motion.div
            className="energy-card-details"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: 'easeInOut' }}
            style={{ overflow: 'hidden' }}
          >
            {details}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

/** Header row inside an EnergyCard — flex row with icon, label, and metric */
export function EnergyCardHeader({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={`flex items-center gap-3 ${className}`}>{children}</div>;
}
