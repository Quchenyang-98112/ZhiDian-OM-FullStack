/** Props for {@link SelfSufficiencyRing}. */
export interface SelfSufficiencyRingProps {
  /** Self-sufficiency ratio in the range 0–100. */
  percentage: number;
}

/**
 * Tiny SVG ring showing self-sufficiency percentage.
 */
export function SelfSufficiencyRing({ percentage }: SelfSufficiencyRingProps) {
  const ringRadius = 5;
  const circumference = 2 * Math.PI * ringRadius;
  const offset = circumference - (percentage / 100) * circumference;
  const color =
    percentage >= 80
      ? 'var(--color-neon-green)'
      : percentage >= 40
        ? 'var(--color-primary)'
        : 'var(--color-power-orange)';

  return (
    <svg width="14" height="14" viewBox="0 0 14 14" className="shrink-0" aria-hidden="true">
      <circle
        cx="7"
        cy="7"
        r={ringRadius}
        fill="none"
        stroke="var(--color-border)"
        strokeWidth="2"
      />
      <circle
        cx="7"
        cy="7"
        r={ringRadius}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform="rotate(-90 7 7)"
        style={{ transition: 'stroke-dashoffset 0.6s ease' }}
      />
    </svg>
  );
}
