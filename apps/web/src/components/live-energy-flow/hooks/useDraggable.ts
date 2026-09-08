import { type PointerEvent as RPointerEvent, useRef, useState } from 'react';
import type { Position } from '../types';

/**
 * Pointer + keyboard driven drag positioning for a floating panel. Dragging is
 * gated to elements marked `[data-drag-handle]`; arrow keys nudge the panel
 * (Shift = large step) for keyboard accessibility.
 */
export function useDraggable(initial: Position) {
  const [pos, setPos] = useState(initial);
  const dragging = useRef(false);
  const offset = useRef({ x: 0, y: 0 });

  const onPointerDown = (e: RPointerEvent) => {
    const target = e.target as HTMLElement;
    if (!target.closest('[data-drag-handle]')) return;
    dragging.current = true;
    offset.current = { x: e.clientX - pos.x, y: e.clientY - pos.y };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: RPointerEvent) => {
    if (!dragging.current) return;
    setPos({
      x: e.clientX - offset.current.x,
      y: e.clientY - offset.current.y,
    });
  };

  const onPointerUp = () => {
    dragging.current = false;
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const step = e.shiftKey ? 50 : 10;
    if (e.key === 'ArrowLeft') setPos((p) => ({ ...p, x: p.x - step }));
    else if (e.key === 'ArrowRight') setPos((p) => ({ ...p, x: p.x + step }));
    else if (e.key === 'ArrowUp') setPos((p) => ({ ...p, y: p.y - step }));
    else if (e.key === 'ArrowDown') setPos((p) => ({ ...p, y: p.y + step }));
    else return;
    e.preventDefault();
  };

  return { pos, onKeyDown, handlers: { onPointerDown, onPointerMove, onPointerUp } };
}
