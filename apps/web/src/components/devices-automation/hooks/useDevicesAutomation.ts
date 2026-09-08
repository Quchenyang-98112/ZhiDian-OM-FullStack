import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useEnergyContext } from '../../../core/EnergyContext';
import { useLegacySendCommand } from '../../../core/useLegacySendCommand';
import { useAppStoreShallow } from '../../../store';
import { DEVICES } from '../constants';
import type { DeviceCategory, DeviceView } from '../types';

/**
 * View/filter/dialog state + live context (data, settings, command dispatch via
 * command-safety) so the page stays a thin orchestrator.
 */
export function useDevicesAutomation() {
  const { t } = useTranslation();
  const { data, unified } = useEnergyContext();
  const { sendCommand, ConfirmationDialog } = useLegacySendCommand();
  const settings = useAppStoreShallow((s) => s.settings);

  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<DeviceCategory>('all');
  const [detailDevice, setDetailDevice] = useState<string | null>(null);
  const [view, setView] = useState<DeviceView>('grid');

  const filtered = DEVICES.filter((d) => {
    if (category !== 'all' && d.category !== category) return false;
    if (search.trim()) return t(d.titleKey).toLowerCase().includes(search.trim().toLowerCase());
    return true;
  });

  return {
    data,
    unified,
    settings,
    sendCommand,
    ConfirmationDialog,
    search,
    setSearch,
    category,
    setCategory,
    detailDevice,
    setDetailDevice,
    view,
    setView,
    filtered,
    resetFilters: () => {
      setSearch('');
      setCategory('all');
    },
  };
}
