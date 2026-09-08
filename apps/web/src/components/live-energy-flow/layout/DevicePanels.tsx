import { useIsCompactViewport } from '../hooks/useIsCompactViewport';
import type { DevicePanelProps, PanelId } from '../types';
import { FloatingPanels } from './FloatingPanels';
import { MobilePanelSheet } from './MobilePanelSheet';

/**
 * Chooses the panel layout by viewport: draggable floating panels on desktop,
 * an always-visible stacked bottom sheet on phone-width screens.
 */
export function DevicePanels(
  props: { openPanels: Set<PanelId>; onClose: (id: PanelId) => void } & DevicePanelProps,
) {
  const isCompact = useIsCompactViewport();
  return isCompact ? <MobilePanelSheet {...props} /> : <FloatingPanels {...props} />;
}
