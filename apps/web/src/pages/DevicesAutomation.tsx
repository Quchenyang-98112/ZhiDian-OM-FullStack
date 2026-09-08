import { Zap } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { DemoBadge } from '../components/DemoBadge';
import {
  DeviceDetailDialog,
  DevicesFilterBar,
  DevicesGrid,
  FloorplanView,
  useDevicesAutomation,
  ViewToggle,
} from '../components/devices-automation';
import { PageHeader } from '../components/layout/PageHeader';

export default function DevicesAutomation() {
  const { t } = useTranslation();
  const devices = useDevicesAutomation();
  const { ConfirmationDialog } = devices;

  return (
    <div className="space-y-6">
      <DemoBadge />
      <PageHeader
        title={t('devicesAuto.title')}
        subtitle={t('devicesAuto.subtitle')}
        icon={<Zap size={22} aria-hidden />}
        actions={<ViewToggle view={devices.view} onChange={devices.setView} />}
      />

      <AnimatePresence mode="wait">
        {devices.view === 'floorplan' ? (
          <motion.div
            key="floorplan"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.25 }}
          >
            <FloorplanView />
          </motion.div>
        ) : (
          <motion.div
            key="grid"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            transition={{ duration: 0.25 }}
            className="space-y-6"
          >
            <DevicesFilterBar
              search={devices.search}
              onSearch={devices.setSearch}
              category={devices.category}
              onCategory={devices.setCategory}
            />
            <DevicesGrid
              devices={devices.filtered}
              data={devices.data}
              unified={devices.unified}
              settings={devices.settings}
              sendCommand={devices.sendCommand}
              onOpenDetail={devices.setDetailDevice}
              onReset={devices.resetFilters}
            />
          </motion.div>
        )}
      </AnimatePresence>

      <DeviceDetailDialog
        deviceId={devices.detailDevice}
        onClose={() => devices.setDetailDevice(null)}
        data={devices.data}
        unified={devices.unified}
        settings={devices.settings}
        sendCommand={devices.sendCommand}
      />
      <ConfirmationDialog />
    </div>
  );
}
