import { AnimatePresence, motion } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { ControlPanel as ControlPanelUI } from '../../ui/ControlPanel';
import { PanelTitle } from '../panels/PanelTitle';
import { type DevicePanelProps, PANEL_CONFIG, type PanelId } from '../types';
import { DevicePanelContent } from './DevicePanelContent';

/**
 * Mobile layout: on phone-width viewports the absolutely-positioned floating
 * panels land off-screen (fixed x/y offsets like y:560, right-anchored panels),
 * so open panels are stacked full-width in a scrollable bottom sheet where every
 * panel — EV, heat-pump/SG-Ready, battery, KNX, stats — stays reachable.
 */
export function MobilePanelSheet({
  openPanels,
  onClose,
  ...panelProps
}: { openPanels: Set<PanelId>; onClose: (id: PanelId) => void } & DevicePanelProps) {
  const { t } = useTranslation();
  const openIds = PANEL_CONFIG.filter((c) => openPanels.has(c.id)).map((c) => c.id);

  // AnimatePresence is required for the slide-down `exit` to play on unmount.
  return (
    <AnimatePresence>
      {openIds.length > 0 && (
        <motion.div
          key="mobile-panel-sheet"
          // Sit ABOVE the fixed mobile bottom nav (3.5rem tall) so the sheet's
          // lower edge / close buttons aren't hidden behind it. Matches the
          // offset the mobile-nav's own popover uses.
          className="fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom,0px))] z-20 max-h-[70dvh] space-y-3 overflow-y-auto rounded-t-2xl border-(--color-border) border-t bg-(--color-background)/95 p-3 shadow-2xl backdrop-blur-md"
          initial={{ y: '100%' }}
          animate={{ y: 0 }}
          exit={{ y: '100%' }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
          role="dialog"
          aria-label={t('liveEnergy.devicePanels')}
        >
          {openIds.map((id) => (
            <ControlPanelUI
              key={id}
              title={<PanelTitle id={id} />}
              onClose={() => onClose(id)}
              closeLabel={t('common.close')}
            >
              <DevicePanelContent id={id} props={panelProps} />
            </ControlPanelUI>
          ))}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
