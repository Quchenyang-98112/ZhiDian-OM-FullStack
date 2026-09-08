import { useTranslation } from 'react-i18next';
import { useShallow } from 'zustand/react/shallow';
import { useEnergyStore } from '../../core/useEnergyStore';
import { useAppStoreShallow } from '../../store';
import { SystemTabLayout } from './SystemTabLayout';

/** Settings → System tab: gateway type, device IPs/ports, connection status, MQTT. */
export const SystemTab = () => {
  const { t } = useTranslation();
  const { settings, updateSettings, wsConnected } = useAppStoreShallow((s) => ({
    settings: s.settings,
    updateSettings: s.updateSettings,
    wsConnected: s.connected,
  }));
  const { victronStatus, knxStatus } = useEnergyStore(
    useShallow((s) => ({
      victronStatus: s.adapters['victron-mqtt']?.status,
      knxStatus: s.adapters.knx?.status,
    })),
  );

  const connectionDevices = [
    { name: t('devices.cerboGx'), status: victronStatus === 'connected' },
    { name: t('devices.knxRouter'), status: knxStatus === 'connected' },
    { name: 'Node-RED', status: wsConnected },
  ];

  return (
    <SystemTabLayout
      gatewayType={settings.gatewayType}
      victronIp={settings.victronIp}
      knxIp={settings.knxIp}
      wsPort={settings.wsPort}
      refreshRateMs={settings.refreshRateMs}
      connectionDevices={connectionDevices}
      onGatewayTypeChange={(gatewayType) => updateSettings({ gatewayType })}
      onVictronIpChange={(value) => updateSettings({ victronIp: value })}
      onKnxIpChange={(value) => updateSettings({ knxIp: value })}
      onWsPortChange={(value) => updateSettings({ wsPort: value })}
      onRefreshRateChange={(value) => updateSettings({ refreshRateMs: value })}
    />
  );
};
