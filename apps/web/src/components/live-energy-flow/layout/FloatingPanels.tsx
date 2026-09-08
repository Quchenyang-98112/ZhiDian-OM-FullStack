import { AnimatePresence } from 'motion/react';
import { type DevicePanelProps, PANEL_CONFIG, PANEL_DEFAULTS, type PanelId } from '../types';
import { DevicePanelContent } from './DevicePanelContent';
import { FloatingDevicePanel } from './FloatingDevicePanel';

/** Desktop layout: absolutely-positioned, draggable floating panels. */
export function FloatingPanels({
  openPanels,
  onClose,
  ...panelProps
}: { openPanels: Set<PanelId>; onClose: (id: PanelId) => void } & DevicePanelProps) {
  return (
    <AnimatePresence>
      {PANEL_CONFIG.filter((c) => openPanels.has(c.id)).map((c) => (
        <FloatingDevicePanel
          key={c.id}
          id={c.id}
          initial={PANEL_DEFAULTS[c.id]}
          onClose={onClose}
          {...(c.anchorRight ? { anchorRight: true } : {})}
        >
          <DevicePanelContent id={c.id} props={panelProps} />
        </FloatingDevicePanel>
      ))}
    </AnimatePresence>
  );
}
