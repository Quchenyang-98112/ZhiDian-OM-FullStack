import type { TFunction } from 'i18next';
import {
  Bell,
  Cable,
  Cpu,
  Database,
  FileKey,
  Gauge,
  Palette,
  Server,
  Shield,
  Sparkles,
  Zap,
} from 'lucide-react';
import type { SettingsTab } from './SettingsTabPanels';

export const buildSettingsTabs = (
  t: TFunction,
): { key: SettingsTab; icon: React.ReactNode; label: string }[] => {
  return [
    {
      key: 'appearance',
      icon: <Palette size={18} />,
      label: t('settings.appearance', 'Appearance'),
    },
    { key: 'system', icon: <Server size={18} />, label: t('settings.system') },
    { key: 'energy', icon: <Zap size={18} />, label: t('settings.energyShort', 'Energy') },
    {
      key: 'controllers',
      icon: <Cpu size={18} />,
      label: t('settings.controllersTab', 'Controllers'),
    },
    {
      key: 'adapters',
      icon: <Cable size={18} />,
      label: t('adapterConfig.tabLabel', 'Adapters'),
    },
    { key: 'security', icon: <Shield size={18} />, label: t('settings.security') },
    {
      key: 'certificates',
      icon: <FileKey size={18} />,
      label: t('settings.certificatesTab', 'EEBUS Certs'),
    },
    { key: 'storage', icon: <Database size={18} />, label: t('settings.storageShort', 'Storage') },
    {
      key: 'notifications',
      icon: <Bell size={18} />,
      label: t('settings.notifications', 'Notifications'),
    },
    { key: 'advanced', icon: <Gauge size={18} />, label: t('settings.advanced', 'Advanced') },
    { key: 'ai', icon: <Sparkles size={18} />, label: t('settings.aiTab', 'AI Providers') },
  ];
};
