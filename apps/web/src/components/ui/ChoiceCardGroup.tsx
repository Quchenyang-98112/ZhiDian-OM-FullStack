import { Check } from 'lucide-react';
import { motion } from 'motion/react';
import { type ReactNode, useState } from 'react';
import { hapticClick } from '../../lib/haptics';

export type ChoiceCardTone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger';

export interface ChoiceCardOption {
  value: string;
  label: ReactNode;
  description?: ReactNode;
  badge?: ReactNode;
  meta?: ReactNode;
  icon?: ReactNode;
  tone?: ChoiceCardTone;
}

export interface ChoiceCardGroupProps {
  name: string;
  value: string;
  options: ChoiceCardOption[];
  onChange?: (value: string) => void;
  'aria-label'?: string;
  disabled?: boolean;
  /** `stack` = vertical list; `grid` = responsive 2-col grid */
  layout?: 'stack' | 'grid';
  /** `compact` hides descriptions and uses a slimmer row */
  size?: 'default' | 'compact';
}

/**
 * Glass card radio group — replaces thick native `<select>` / gray accordion rows
 * for short option lists (modes, models, profiles, etc.).
 */
export function ChoiceCardGroup({
  name,
  value,
  options,
  onChange,
  'aria-label': ariaLabel,
  disabled = false,
  layout = 'stack',
  size = 'default',
}: ChoiceCardGroupProps) {
  const [selected, setSelected] = useState(value);

  const handleSelect = (next: string) => {
    hapticClick();
    setSelected(next);
    onChange?.(next);
  };

  return (
    <div
      className={`choice-card-group choice-card-group--${layout} choice-card-group--${size}`}
      role="radiogroup"
      aria-label={ariaLabel}
    >
      {options.map((option, index) => {
        const isSelected = selected === option.value;
        const tone = option.tone ?? 'neutral';

        return (
          <motion.label
            key={option.value}
            className={`choice-card choice-card--${tone} ${
              isSelected ? 'choice-card--selected' : ''
            } ${disabled ? 'choice-card--disabled' : ''}`}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.22, delay: index * 0.03 }}
            {...(disabled ? {} : { whileTap: { scale: 0.99 } })}
          >
            <input
              type="radio"
              name={name}
              value={option.value}
              className="sr-only"
              checked={isSelected}
              disabled={disabled}
              onChange={() => handleSelect(option.value)}
            />
            {option.badge ? (
              <span className="choice-card-badge" aria-hidden="true">
                {option.badge}
              </span>
            ) : null}
            {option.icon ? <span className="choice-card-icon">{option.icon}</span> : null}
            <span className="choice-card-body">
              <span className="choice-card-label">{option.label}</span>
              {size === 'default' && option.description ? (
                <span className="choice-card-desc">{option.description}</span>
              ) : null}
            </span>
            {option.meta ? <span className="choice-card-meta">{option.meta}</span> : null}
            {isSelected ? (
              <span className="choice-card-check" aria-hidden="true">
                <Check size={14} />
              </span>
            ) : (
              <span className="choice-card-radio" aria-hidden="true" />
            )}
          </motion.label>
        );
      })}
    </div>
  );
}
