import { Check, ChevronDown, Search } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { hapticClick } from '../../lib/haptics';

/** Fixed-position rectangle for the portaled popover. */
interface PopoverRect {
  left: number;
  width: number;
  /** Anchor edge: `top` opens downward from the trigger, `bottom` opens upward. */
  top?: number;
  bottom?: number;
  maxHeight: number;
}

export interface ComboBoxOption {
  value: string;
  label: string;
}

export interface ComboBoxProps {
  /** Stable id used to wire the trigger to its listbox (a11y). */
  id?: string;
  /** Accessible name for the control. */
  label: string;
  value: string;
  options: ComboBoxOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
  /** Force the filter input on/off. Defaults to on when there are > 7 options. */
  searchable?: boolean;
  placeholder?: string;
  className?: string;
}

/**
 * Branded, theme-aware dropdown for long option lists — replaces the dated native
 * `<select>` fallback (WS-8). Renders a glass listbox popover with type-to-filter,
 * full keyboard support (↑/↓/Home/End/Enter/Esc), and listbox ARIA semantics.
 *
 * For short lists prefer `ChoiceCardGroup`; this is for lists too long to show as
 * cards (manufacturers, protocols, timezones, …). `SelectField` routes to it.
 */
export function ComboBox({
  id,
  label,
  value,
  options,
  onChange,
  disabled = false,
  searchable,
  placeholder,
  className = '',
}: ComboBoxProps) {
  const { t } = useTranslation();
  const generatedId = useId();
  const baseId = id ?? generatedId;
  const listboxId = `${baseId}-listbox`;

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);

  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [rect, setRect] = useState<PopoverRect | null>(null);

  const showSearch = searchable ?? options.length > 7;
  const selectedOption = options.find((o) => o.value === value);

  const filtered = useMemo(() => {
    if (!showSearch || !query.trim()) return options;
    const q = query.trim().toLowerCase();
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query, showSearch]);

  const openPopover = () => {
    if (disabled) return;
    const idx = Math.max(
      0,
      filtered.findIndex((o) => o.value === value),
    );
    setActiveIndex(idx);
    // Measure synchronously so the portaled popover (and its search input) mount
    // on the very first open render — otherwise the focus effect races a null
    // rect and never focuses the input.
    positionPopover();
    setOpen(true);
  };

  const closePopover = (returnFocus = true) => {
    setOpen(false);
    setQuery('');
    if (returnFocus) triggerRef.current?.focus();
  };

  const commit = (next: string) => {
    hapticClick();
    onChange(next);
    closePopover();
  };

  // Measure the trigger and compute a fixed-position rect for the portaled
  // popover. Rendering in a portal (below) escapes any ancestor stacking context
  // (glass-panel backdrop-filter) or overflow clip, so the listbox always paints
  // above sibling content instead of being covered by cards below it.
  const positionPopover = () => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const r = trigger.getBoundingClientRect();
    const viewportH = window.innerHeight;
    const gap = 4;
    const spaceBelow = viewportH - r.bottom - gap;
    const spaceAbove = r.top - gap;
    // Prefer opening downward; flip up only when there is clearly more room above.
    const openUp = spaceBelow < 240 && spaceAbove > spaceBelow;
    setRect({
      left: r.left,
      width: r.width,
      ...(openUp
        ? { bottom: viewportH - r.top + gap, maxHeight: Math.max(160, spaceAbove) }
        : { top: r.bottom + gap, maxHeight: Math.max(160, spaceBelow) }),
    });
  };

  // Position synchronously before paint when opening to avoid a flash at (0,0).
  useLayoutEffect(() => {
    if (open) positionPopover();
    // positionPopover reads refs only; safe to omit from deps.
  }, [open]);

  // Reposition on scroll (any ancestor, hence capture) and resize while open.
  useEffect(() => {
    if (!open) return;
    const reposition = () => positionPopover();
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);
    return () => {
      window.removeEventListener('scroll', reposition, true);
      window.removeEventListener('resize', reposition);
    };
  }, [open]);

  // Focus the search input (or keep focus on the popover) when opening.
  useEffect(() => {
    if (open && showSearch) inputRef.current?.focus();
  }, [open, showSearch]);

  // Keep the active option scrolled into view.
  useEffect(() => {
    if (open) optionRefs.current[activeIndex]?.scrollIntoView?.({ block: 'nearest' });
  }, [open, activeIndex]);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      // The popover is portaled to document.body, so an outside click must also
      // exclude it (it is no longer a DOM descendant of rootRef).
      const insideTrigger = rootRef.current?.contains(target);
      const insidePopover = popoverRef.current?.contains(target);
      if (!insideTrigger && !insidePopover) {
        // Inline (not closePopover) so this effect needs no function dep.
        setOpen(false);
        setQuery('');
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setActiveIndex((i) => Math.min(i + 1, filtered.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, 0));
        break;
      case 'Home':
        e.preventDefault();
        setActiveIndex(0);
        break;
      case 'End':
        e.preventDefault();
        setActiveIndex(filtered.length - 1);
        break;
      case 'Enter': {
        e.preventDefault();
        const opt = filtered[activeIndex];
        if (opt) commit(opt.value);
        break;
      }
      case 'Escape':
        e.preventDefault();
        closePopover();
        break;
      case 'Tab':
        closePopover(false);
        break;
      default:
        break;
    }
  };

  const activeOptionId = filtered[activeIndex] ? `${baseId}-opt-${activeIndex}` : undefined;

  return (
    <div ref={rootRef} className={`combobox relative w-full ${className}`.trim()} data-open={open}>
      <button
        ref={triggerRef}
        type="button"
        id={baseId}
        disabled={disabled}
        onClick={() => (open ? closePopover(false) : openPopover())}
        onKeyDown={(e) => {
          if (!open && (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault();
            openPopover();
          }
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        aria-label={label}
        className="focus-ring flex w-full items-center justify-between gap-2 rounded-xl border border-(--color-border) bg-(--color-surface) px-4 py-2.5 text-left text-(--color-text) text-sm transition-colors hover:border-(--color-primary)/50 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span className={selectedOption ? '' : 'text-(--color-muted)'}>
          {selectedOption?.label ?? placeholder ?? t('common.selectPlaceholder')}
        </span>
        <ChevronDown
          size={16}
          aria-hidden="true"
          className={`shrink-0 text-(--color-muted) transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {createPortal(
        <AnimatePresence>
          {open && rect ? (
            <motion.div
              ref={popoverRef}
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.16, ease: 'easeOut' }}
              style={{
                position: 'fixed',
                left: rect.left,
                width: rect.width,
                ...(rect.top !== undefined ? { top: rect.top } : {}),
                ...(rect.bottom !== undefined ? { bottom: rect.bottom } : {}),
                maxHeight: rect.maxHeight,
                zIndex: 100,
              }}
              className="flex min-w-[12rem] flex-col overflow-hidden rounded-xl border border-(--color-border) bg-(--color-surface) shadow-2xl backdrop-blur-xl"
            >
              {showSearch ? (
                <div className="flex items-center gap-2 border-(--color-border) border-b px-3 py-2">
                  <Search size={14} className="text-(--color-muted)" aria-hidden="true" />
                  <input
                    ref={inputRef}
                    type="text"
                    value={query}
                    onChange={(e) => {
                      setQuery(e.target.value);
                      setActiveIndex(0);
                    }}
                    onKeyDown={handleKeyDown}
                    placeholder={t('common.comboSearchPlaceholder')}
                    aria-label={t('common.comboSearchPlaceholder')}
                    aria-controls={listboxId}
                    aria-activedescendant={activeOptionId}
                    aria-autocomplete="list"
                    role="combobox"
                    aria-expanded="true"
                    className="w-full bg-transparent text-(--color-text) text-sm outline-none placeholder:text-(--color-muted)"
                  />
                </div>
              ) : null}

              {filtered.length === 0 ? (
                <p className="px-4 py-3 text-(--color-muted) text-sm" role="status">
                  {t('common.comboNoResults')}
                </p>
              ) : (
                <div
                  id={listboxId}
                  role="listbox"
                  aria-label={label}
                  tabIndex={showSearch ? -1 : 0}
                  onKeyDown={showSearch ? undefined : handleKeyDown}
                  className="min-h-0 flex-1 overflow-y-auto p-1 outline-none"
                >
                  {filtered.map((option, index) => {
                    const isSelected = option.value === value;
                    const isActive = index === activeIndex;
                    return (
                      <button
                        key={option.value}
                        ref={(el) => {
                          optionRefs.current[index] = el;
                        }}
                        type="button"
                        id={`${baseId}-opt-${index}`}
                        role="option"
                        tabIndex={-1}
                        aria-selected={isSelected}
                        onClick={() => commit(option.value)}
                        onMouseEnter={() => setActiveIndex(index)}
                        className={`flex w-full cursor-pointer items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm ${
                          isActive
                            ? 'bg-(--color-primary)/20 text-(--color-text)'
                            : 'text-(--color-muted)'
                        }`}
                      >
                        <span className={isSelected ? 'font-medium text-(--color-text)' : ''}>
                          {option.label}
                        </span>
                        {isSelected ? (
                          <Check
                            size={14}
                            className="shrink-0 text-(--color-primary)"
                            aria-hidden="true"
                          />
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              )}
            </motion.div>
          ) : null}
        </AnimatePresence>,
        document.body,
      )}
    </div>
  );
}
