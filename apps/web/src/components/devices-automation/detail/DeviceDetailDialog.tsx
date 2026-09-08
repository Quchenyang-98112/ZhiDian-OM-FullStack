import * as Dialog from '@radix-ui/react-dialog';
import { VisuallyHidden } from '@radix-ui/react-visually-hidden';
import { motion } from 'motion/react';
import { useTranslation } from 'react-i18next';
import type { UnifiedEnergyModel } from '../../../core/adapters/EnergyAdapter';
import type { EnergyData, StoredSettings } from '../../../types';
import { ControlPanel as ControlPanelUI } from '../../ui/ControlPanel';
import { DEVICES } from '../constants';
import type { SendCommand } from '../types';
import { DeviceDetailContent } from './DeviceDetailContent';

export function DeviceDetailDialog({
  deviceId,
  onClose,
  data,
  unified,
  settings,
  sendCommand,
}: {
  deviceId: string | null;
  onClose: () => void;
  data: EnergyData;
  unified: UnifiedEnergyModel;
  settings: StoredSettings;
  sendCommand: SendCommand;
}) {
  const { t } = useTranslation();
  const device = DEVICES.find((d) => d.id === deviceId);

  return (
    <Dialog.Root
      open={deviceId != null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay asChild>
          <motion.div
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />
        </Dialog.Overlay>
        <Dialog.Content asChild>
          <motion.div
            className="fixed top-1/2 left-1/2 z-50 max-h-[85vh] w-[95vw] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl"
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
          >
            <Dialog.Title asChild>
              <VisuallyHidden>{device ? t(device.titleKey) : ''}</VisuallyHidden>
            </Dialog.Title>
            <Dialog.Description asChild>
              <VisuallyHidden>{t('devicesAuto.detailDescription')}</VisuallyHidden>
            </Dialog.Description>

            <ControlPanelUI
              title={
                <span className="flex items-center gap-2">
                  {device?.icon}
                  {device ? t(device.titleKey) : ''}
                </span>
              }
              onClose={onClose}
              closeLabel={t('common.close')}
            >
              {deviceId && (
                <DeviceDetailContent
                  deviceId={deviceId}
                  data={data}
                  unified={unified}
                  settings={settings}
                  sendCommand={sendCommand}
                />
              )}
            </ControlPanelUI>
          </motion.div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
