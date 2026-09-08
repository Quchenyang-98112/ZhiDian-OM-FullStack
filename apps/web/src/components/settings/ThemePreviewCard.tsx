import { Check } from 'lucide-react';
import { motion } from 'motion/react';
import type { ThemeName, themeDefinitions } from '../../design-tokens';

interface ThemePreviewCardProps {
  def: (typeof themeDefinitions)[ThemeName];
  isActive: boolean;
  onClick: () => void;
}

/** Selectable theme swatch card shown in the Settings → Appearance tab. */
export function ThemePreviewCard({ def, isActive, onClick }: ThemePreviewCardProps) {
  const [c1, c2, c3] = def.previewColors;
  return (
    <motion.button
      onClick={onClick}
      className={`focus-ring relative flex flex-col items-center gap-2 rounded-2xl border-2 p-4 transition-all duration-300 ${
        isActive
          ? 'border-(--color-primary) bg-(--color-primary)/10 shadow-[0_0_20px_var(--color-primary)/15]'
          : 'border-(--color-border) bg-(--color-surface) hover:border-(--color-primary)/40'
      }`}
      whileHover={{ scale: 1.03, y: -2 }}
      whileTap={{ scale: 0.97 }}
      aria-label={def.label}
      aria-pressed={isActive}
    >
      <div className="flex gap-1.5">
        <span className="h-6 w-6 rounded-full border border-white/20" style={{ background: c1 }} />
        <span className="h-6 w-6 rounded-full border border-white/20" style={{ background: c2 }} />
        <span className="h-6 w-6 rounded-full border border-white/20" style={{ background: c3 }} />
      </div>
      <span className="font-medium text-xs">{def.label}</span>
      {isActive && (
        <motion.div
          layoutId="theme-check"
          className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-(--color-text) text-(--color-background)"
          transition={{ type: 'spring', stiffness: 500, damping: 30 }}
        >
          <Check className="h-3 w-3" />
        </motion.div>
      )}
    </motion.button>
  );
}
