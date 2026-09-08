import { useEffect, useRef, useState } from 'react';

/** Formatting presets for common energy units */
export type LiveMetricFormat = 'power' | 'energy' | 'percent' | 'currency' | 'custom';

export interface LiveMetricProps {
  /** Numeric value to display */
  value: number;
  /** Unit label appended after the number (e.g. "kW", "%", "€/kWh") */
  unit?: string;
  /** Locale-aware preformatted display; numeric `value` still drives pulse + SR thresholds */
  formattedDisplay?: { value: string; unit?: string };
  /** Number of decimal places (default: auto-detected by format) */
  precision?: number;
  /** Predefined format for common energy metrics */
  format?: LiveMetricFormat;
  /** Size override — uses fluid-text-* classes */
  size?: 'sm' | 'md' | 'lg' | 'xl';
  /** Whether to animate pulse when the value changes */
  pulse?: boolean;
  /** Additional CSS classes */
  className?: string;
}

const sizeClass: Record<NonNullable<LiveMetricProps['size']>, string> = {
  sm: 'fluid-text-lg',
  md: 'fluid-text-2xl',
  lg: 'fluid-text-3xl',
  xl: 'fluid-text-4xl',
};

const defaultPrecision: Record<LiveMetricFormat, number> = {
  power: 3,
  energy: 1,
  percent: 0,
  currency: 3,
  custom: 2,
};

/**
 * Real-time numeric readout with monospace tabular figures.
 *
 * Uses the `live-metric` CSS utility from the design system.
 * Automatically pulses when the value changes (opt-in via `pulse` prop).
 * Font is `font-mono` + `tabular-nums` for stable digit width — no layout shifts.
 *
 * Screen-reader announcements are debounced (3 s) and gated on a 5 % relative
 * change threshold to avoid aria-live "announcement storms" on live dashboards.
 *
 * @example
 * ```tsx
 * <LiveMetric value={3.247} unit="kW" format="power" />
 * <LiveMetric value={78} unit="%" format="percent" size="lg" />
 * ```
 */
export function LiveMetric({
  value,
  unit,
  formattedDisplay,
  precision,
  format = 'custom',
  size = 'md',
  pulse = true,
  className = '',
}: LiveMetricProps) {
  const decimals = precision ?? defaultPrecision[format];
  const displayValue = formattedDisplay?.value ?? value.toFixed(decimals);
  const displayUnit = formattedDisplay?.unit ?? unit;
  const formattedLabel = `${displayValue}${displayUnit ? ` ${displayUnit}` : ''}`;

  const [prevValue, setPrevValue] = useState(value);
  const [animKey, setAnimKey] = useState(0);

  // Derive state from props — supported React pattern (setState during render)
  if (pulse && prevValue !== value) {
    setPrevValue(value);
    setAnimKey((k) => k + 1);
  }

  // Debounced sr-only announcement — WCAG 4.1.3 / prevents aria-live spam
  const [announcement, setAnnouncement] = useState(formattedLabel);
  const announceTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const lastAnnouncedValue = useRef(value);
  const lastRenderedValue = useRef(value);
  const lastFormattedLabel = useRef(formattedLabel);

  useEffect(() => {
    const labelChanged = lastFormattedLabel.current !== formattedLabel;
    const valueUnchanged = value === lastRenderedValue.current;

    lastFormattedLabel.current = formattedLabel;
    lastRenderedValue.current = value;

    if (labelChanged && valueUnchanged) {
      lastAnnouncedValue.current = value;
      setAnnouncement(formattedLabel);
      return;
    }

    const previous = lastAnnouncedValue.current;
    const pctChange = Math.abs(value - previous) / (Math.abs(previous) || 1);
    // Only announce if the value shifted by more than 5 % relative
    if (pctChange > 0.05) {
      clearTimeout(announceTimer.current);
      announceTimer.current = setTimeout(() => {
        lastAnnouncedValue.current = value;
        setAnnouncement(formattedLabel);
      }, 3000);
    }
    return () => clearTimeout(announceTimer.current);
  }, [value, formattedLabel]);

  return (
    <span className="contents">
      {/* Visual readout — no aria-live to prevent announcement storms */}
      <span
        key={pulse ? animKey : undefined}
        className={`live-metric ${sizeClass[size]} ${className}`}
        data-changing={pulse ? 'true' : undefined}
        aria-hidden="true"
      >
        {displayValue}
        {displayUnit && (
          <span className="ml-1 font-normal text-(--color-muted) text-[0.6em] tracking-wide">
            {displayUnit}
          </span>
        )}
      </span>
      {/* Debounced sr-only announcement for screen readers */}
      <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {announcement}
      </span>
    </span>
  );
}
