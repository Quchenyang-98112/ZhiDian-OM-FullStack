import { Search } from 'lucide-react';
import { AnimatePresence } from 'motion/react';
import { useTranslation } from 'react-i18next';
import type { UnifiedEnergyModel } from '../../../core/adapters/EnergyAdapter';
import type { EnergyData, StoredSettings } from '../../../types';
import { EmptyState } from '../../ui/EmptyState';
import { DeviceCard } from '../cards/DeviceCard';
import type { DeviceDefinition, SendCommand } from '../types';

export function DevicesGrid({
  devices,
  data,
  unified,
  settings,
  sendCommand,
  onOpenDetail,
  onReset,
}: {
  devices: DeviceDefinition[];
  data: EnergyData;
  unified: UnifiedEnergyModel;
  settings: StoredSettings;
  sendCommand: SendCommand;
  onOpenDetail: (deviceId: string) => void;
  onReset: () => void;
}) {
  const { t } = useTranslation();

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <AnimatePresence mode="popLayout">
          {devices.map((device) => (
            <DeviceCard
              key={device.id}
              device={device}
              data={data}
              unified={unified}
              settings={settings}
              sendCommand={sendCommand}
              onOpenDetail={() => onOpenDetail(device.id)}
            />
          ))}
        </AnimatePresence>
      </div>

      {devices.length === 0 && (
        <EmptyState
          icon={Search}
          title={t('devicesAuto.noResults')}
          description={t('tour.devices.emptyDesc')}
          pulse
          action={
            <button
              type="button"
              onClick={onReset}
              className="focus-ring rounded-xl bg-(--color-primary)/15 px-4 py-2 font-semibold text-(--color-primary) text-xs transition-colors hover:bg-(--color-primary)/25"
            >
              {t('devicesAuto.filterAll')}
            </button>
          }
        />
      )}
    </>
  );
}
