import { GripHorizontal } from 'lucide-react';
import { type MotionStyle, motion } from 'motion/react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ControlPanel as ControlPanelUI } from '../../ui/ControlPanel';
import { useDraggable } from '../hooks/useDraggable';
import { PanelTitle } from '../panels/PanelTitle';
import type { PanelId, Position } from '../types';

export function FloatingDevicePanel({
  id,
  initial,
  onClose,
  anchorRight = false,
  children,
}: {
  id: PanelId;
  initial: Position;
  onClose: (id: PanelId) => void;
  anchorRight?: boolean;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const { pos, onKeyDown, handlers } = useDraggable(initial);

  // For right-anchored panels use `-pos.x` (clamped ≥ 0) so dragging is monotonic:
  // `Math.abs` would reverse direction once a drag pushes pos.x across zero.
  const posStyle: MotionStyle = anchorRight
    ? { right: Math.max(0, -pos.x), top: pos.y }
    : { left: pos.x, top: pos.y };

  return (
    <motion.div
      className="absolute z-10 w-80 touch-none select-none"
      style={posStyle}
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ duration: 0.25 }}
      {...handlers}
    >
      <ControlPanelUI
        title={
          <span className="flex items-center gap-2">
            <button
              type="button"
              data-drag-handle
              className="focus-ring cursor-grab rounded text-(--color-muted) active:cursor-grabbing"
              aria-roledescription={t('liveEnergy.draggableHandle')}
              aria-label={t(
                'liveEnergy.movePanel',
                'Move panel — arrow keys to reposition, Shift for large steps',
              )}
              onKeyDown={onKeyDown}
            >
              <GripHorizontal size={16} aria-hidden="true" />
            </button>
            <PanelTitle id={id} />
          </span>
        }
        onClose={() => onClose(id)}
        closeLabel={t('common.close')}
      >
        {children}
      </ControlPanelUI>
    </motion.div>
  );
}
