import { motion } from 'motion/react';
import { useId } from 'react';

interface GaugeProps {
  value: number; // 0-100
  max?: number;
  label: string;
  unit: string;
  color?: 'primary' | 'success' | 'warning' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  showValue?: boolean;
  animate?: boolean;
}

/** Glow filter per color variant */
const glowMap: Record<NonNullable<GaugeProps['color']>, string> = {
  primary: 'drop-shadow(0 0 8px var(--color-primary))',
  success: 'drop-shadow(0 0 8px #10b981)',
  warning: 'drop-shadow(0 0 8px #f59e0b)',
  danger: 'drop-shadow(0 0 8px #ef4444)',
};

/** Gradient stop colors per color variant [from, to] */
const gradientStops: Record<NonNullable<GaugeProps['color']>, [string, string]> = {
  primary: ['var(--color-primary)', 'var(--color-secondary)'],
  success: ['#10b981', '#22ff88'],
  warning: ['#f59e0b', '#ff8800'],
  danger: ['#ef4444', '#dc2626'],
};

const sizeMap = {
  sm: { size: 80, strokeWidth: 6, fontSize: 14 },
  md: { size: 120, strokeWidth: 8, fontSize: 18 },
  lg: { size: 160, strokeWidth: 10, fontSize: 24 },
};

export function Gauge({
  value,
  max = 100,
  label,
  unit,
  color = 'primary',
  size = 'md',
  showValue = true,
  animate = true,
}: GaugeProps) {
  // useId ensures gradient IDs are unique per Gauge instance —
  // prevents SVG gradient collision when multiple Gauges share the same color.
  const uid = useId();
  const gradientId = `${uid}-gradient`;

  const { size: gaugeSize, strokeWidth, fontSize } = sizeMap[size];
  const radius = (gaugeSize - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const percentage = Math.min(Math.max(value / max, 0), 1);
  const strokeDashoffset = circumference * (1 - percentage);
  const [fromColor, toColor] = gradientStops[color];

  const labelId = `${uid}-label`;

  return (
    // biome-ignore lint/a11y/useSemanticElements: custom SVG gauge requires div wrapper for flexbox layout
    <div
      className="flex flex-col items-center gap-3"
      role="meter"
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-labelledby={labelId}
    >
      <svg width={gaugeSize} height={gaugeSize} className="-rotate-90" aria-hidden="true">
        <defs>
          {/* Unique gradient ID prevents cross-instance color pollution */}
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={fromColor} stopOpacity="1" />
            <stop offset="100%" stopColor={toColor} stopOpacity="1" />
          </linearGradient>
        </defs>

        {/* Background circle */}
        <circle
          cx={gaugeSize / 2}
          cy={gaugeSize / 2}
          r={radius}
          fill="none"
          stroke="var(--color-border)"
          strokeWidth={strokeWidth}
        />

        {/* Progress circle — Motion handles the arc animation */}
        <motion.circle
          cx={gaugeSize / 2}
          cy={gaugeSize / 2}
          r={radius}
          fill="none"
          stroke={`url(#${gradientId})`}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset }}
          transition={animate ? { duration: 1, ease: 'easeInOut' } : { duration: 0 }}
          style={{ filter: glowMap[color] }}
        />

        {/* Center value — displayed in de-rotated coordinate space */}
        {showValue && (
          <text
            x="50%"
            y="50%"
            dominantBaseline="middle"
            textAnchor="middle"
            className="rotate-90"
            transform={`rotate(90 ${gaugeSize / 2} ${gaugeSize / 2})`}
            fill="var(--color-text)"
            fontSize={fontSize}
            fontWeight="bold"
          >
            {Math.round(value)}
          </text>
        )}
      </svg>

      <div className="text-center">
        <p
          id={labelId}
          className="font-medium text-(--color-muted) text-xs uppercase tracking-wide"
        >
          {label}
        </p>
        {showValue && (
          <p className="mt-1 text-(--color-text) text-sm">
            {value.toFixed(1)} {unit}
          </p>
        )}
      </div>
    </div>
  );
}
