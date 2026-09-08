import { motion } from 'motion/react';
import { useTranslation } from 'react-i18next';
import type { UnifiedEnergyModel } from '../../../core/adapters/EnergyAdapter';
import type { EnergyData, StoredSettings } from '../../../types';
import { EnergyCard } from '../../ui/EnergyCard';
import { QuickAction } from '../quick-actions/QuickAction';
import { DeviceStatusBadge } from '../status/DeviceStatusBadge';
import type { DeviceDefinition, SendCommand } from '../types';
import { DeviceInlineDetails } from './DeviceInlineDetails';
import { DeviceMetricRow } from './DeviceMetricRow';

export function DeviceCard({
  device,
  data,
  unified,
  settings,
  sendCommand,
  onOpenDetail,
}: {
  device: DeviceDefinition;
  data: EnergyData;
  unified: UnifiedEnergyModel;
  settings: StoredSettings;
  sendCommand: SendCommand;
  onOpenDetail: () => void;
}) {
  const { t } = useTranslation();

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.25 }}
    >
      <EnergyCard
        variant={device.variant}
        footer={
          <QuickAction
            deviceId={device.id}
            data={data}
            settings={settings}
            sendCommand={sendCommand}
          />
        }
        details={
          <DeviceInlineDetails
            deviceId={device.id}
            data={data}
            unified={unified}
            settings={settings}
            onOpenDetail={onOpenDetail}
          />
        }
      >
        <div className="flex w-full flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="text-(--color-primary)">{device.icon}</span>
              <span className="font-medium text-(--color-text)">{t(device.titleKey)}</span>
            </div>
            <DeviceStatusBadge deviceId={device.id} data={data} unified={unified} />
          </div>
          <DeviceMetricRow deviceId={device.id} data={data} unified={unified} settings={settings} />
        </div>
      </EnergyCard>
    </motion.div>
  );
}
