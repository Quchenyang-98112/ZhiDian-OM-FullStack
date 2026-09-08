import { RefreshCw } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { lazy, type ReactNode, Suspense } from 'react';
import type { SettingsTab } from '../../lib/settings-tab-types';
import { AdapterConfigPanel } from '../AdapterConfigPanel';
import { CertificateManagement } from '../CertificateManagement';
import { AdvancedTab } from './AdvancedTab';
import { AppearanceTab } from './AppearanceTab';
import { ControllersTab } from './ControllersTab';
import { EnergyTab } from './EnergyTab';
import { NotificationsTab } from './NotificationsTab';
import { SecurityTab } from './SecurityTab';
import { SettingsFeatureBar } from './SettingsFeatureBar';
import { StorageTab } from './StorageTab';
import { SystemTab } from './SystemTab';

export type { SettingsTab } from '../../lib/settings-tab-types';

const AISettingsPage = lazy(() => import('../../pages/AISettingsPage'));

const PANEL_CONTENT: Record<SettingsTab, ReactNode> = {
  appearance: <AppearanceTab />,
  system: <SystemTab />,
  energy: <EnergyTab />,
  controllers: <ControllersTab />,
  adapters: <AdapterConfigPanel />,
  security: <SecurityTab />,
  certificates: <CertificateManagement />,
  storage: <StorageTab />,
  notifications: <NotificationsTab />,
  advanced: <AdvancedTab />,
  ai: (
    <>
      <SettingsFeatureBar tabId="ai" />
      <Suspense
        fallback={
          <div className="flex items-center justify-center py-12">
            <RefreshCw className="h-6 w-6 animate-spin text-(--color-primary)" />
          </div>
        }
      >
        <AISettingsPage />
      </Suspense>
    </>
  ),
};

export const SettingsTabPanels = ({ activeTab }: { activeTab: SettingsTab }) => {
  const panelClass = activeTab === 'adapters' || activeTab === 'ai' ? undefined : 'space-y-6';

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={activeTab}
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -20 }}
        transition={{ duration: 0.3 }}
        className={panelClass}
        role="tabpanel"
        id={`tabpanel-${activeTab}`}
        aria-labelledby={`tab-${activeTab}`}
      >
        {PANEL_CONTENT[activeTab]}
      </motion.div>
    </AnimatePresence>
  );
};
