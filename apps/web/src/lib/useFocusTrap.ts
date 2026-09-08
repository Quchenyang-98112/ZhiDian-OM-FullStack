import { type RefObject, useEffect, useRef } from 'react';

/**
 * Selector for elements that can receive keyboard focus inside a trapped region.
 * Excludes `tabindex="-1"` (programmatic-only focus) and disabled controls.
 */
const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

export interface FocusTrapOptions {
  /** Invoked when Escape is pressed while the trap is active (e.g. to close). */
  onEscape?: () => void;
  /**
   * Element to focus when the trap activates. Defaults to the first focusable
   * descendant of the container.
   */
  initialFocusRef?: RefObject<HTMLElement | null>;
  /**
   * Restore focus to the element that was focused before activation when the
   * trap deactivates. Defaults to true (WCAG 2.4.3 Focus Order).
   */
  restoreFocus?: boolean;
}

/**
 * Reusable focus trap for modal dialogs, sheets, and drawers.
 *
 * While `active` is true it:
 *  - saves the currently-focused element,
 *  - moves focus into the container (to `initialFocusRef` or the first focusable),
 *  - keeps Tab / Shift+Tab cycling within the container (WCAG 2.1.2 No Keyboard Trap
 *    is satisfied because Escape still exits via `onEscape`),
 *  - calls `onEscape` on the Escape key,
 *  - and restores focus to the saved element on deactivation.
 *
 * Attach the returned ref to the container element that should trap focus.
 *
 * @example
 * const ref = useFocusTrap<HTMLDivElement>(isOpen, { onEscape: onClose });
 * return isOpen ? <div ref={ref} role="dialog" aria-modal="true">…</div> : null;
 */
export function useFocusTrap<T extends HTMLElement>(
  active: boolean,
  options: FocusTrapOptions = {},
): RefObject<T | null> {
  const containerRef = useRef<T>(null);
  const savedFocusRef = useRef<HTMLElement | null>(null);
  const { onEscape, initialFocusRef, restoreFocus = true } = options;

  // Hold onEscape in a ref so an inline callback identity does not re-run the
  // trap effect (which would re-grab focus) on every parent render.
  const onEscapeRef = useRef(onEscape);
  useEffect(() => {
    onEscapeRef.current = onEscape;
  }, [onEscape]);

  useEffect(() => {
    if (!active) return;
    const container = containerRef.current;
    if (!container) return;

    savedFocusRef.current = document.activeElement as HTMLElement | null;

    // Move focus in after the element has been committed/painted.
    const raf = requestAnimationFrame(() => {
      const target =
        initialFocusRef?.current ?? container.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
      target?.focus();
    });

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onEscapeRef.current?.();
        return;
      }
      if (e.key !== 'Tab') return;

      const focusable = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
      if (focusable.length === 0) {
        // Nothing to focus inside — keep focus on the container itself.
        e.preventDefault();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const activeEl = document.activeElement;

      if (e.shiftKey && (activeEl === first || !container.contains(activeEl))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (activeEl === last || !container.contains(activeEl))) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('keydown', handleKeyDown);
      if (restoreFocus) savedFocusRef.current?.focus();
    };
  }, [active, initialFocusRef, restoreFocus]);

  return containerRef;
}
