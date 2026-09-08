import { Server, Wifi } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { registerBuiltinAdapterSettingsSections } from '../../core/adapters/register-builtin-settings-sections';
import { ConnectionStatusCards } from './ConnectionStatusCards';
import { GatewayTypeSelector } from './GatewayTypeSelector';
import { RegisteredAdapterSettingsSection } from './RegisteredAdapterSettingsSection';
import { SettingsFeatureBar } from './SettingsFeatureBar';
import { SystemNetworkFields } from './SystemNetworkFields';
import { sectionClass, sectionHeaderClass } from './styles';

registerBuiltinAdapterSettingsSections();

export const SystemTabLayout = ({
  gatewayType,
  victronIp,
  knxIp,
  wsPort,
  refreshRateMs,
  connectionDevices,
  onGatewayTypeChange,
  onVictronIpChange,
  onKnxIpChange,
  onWsPortChange,
  onRefreshRateChange,
}: {
  gatewayType: 'cerbo-gx' | 'cerbo-gx-mk2' | 'raspberry-pi';
  victronIp: string;
  knxIp: string;
  wsPort: number;
  refreshRateMs: number;
  connectionDevices: { name: string; status: boolean }[];
  onGatewayTypeChange: (value: 'cerbo-gx' | 'cerbo-gx-mk2' | 'raspberry-pi') => void;
  onVictronIpChange: (value: string) => void;
  onKnxIpChange: (value: string) => void;
  onWsPortChange: (value: number) => void;
  onRefreshRateChange: (value: number) => void;
}) => {
  const { t } = useTranslation();

  return (
    <>
      <SettingsFeatureBar tabId="system" />
      <section className={sectionClass}>
        <h2 className={sectionHeaderClass}>
          <Server size={20} className="text-blue-400" aria-hidden="true" />
          {t('settings.system')}
        </h2>
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <GatewayTypeSelector value={gatewayType} onChange={onGatewayTypeChange} />
          <SystemNetworkFields
            victronIp={victronIp}
            knxIp={knxIp}
            wsPort={wsPort}
            refreshRateMs={refreshRateMs}
            onVictronIpChange={onVictronIpChange}
            onKnxIpChange={onKnxIpChange}
            onWsPortChange={onWsPortChange}
            onRefreshRateChange={onRefreshRateChange}
          />
        </div>
      </section>

      <section className={sectionClass}>
        <h2 className={sectionHeaderClass}>
          <Wifi size={20} className="text-emerald-400" aria-hidden="true" />
          {t('settings.connectionStatus', 'Connection Status')}
        </h2>
        <ConnectionStatusCards devices={connectionDevices} />
      </section>

      <RegisteredAdapterSettingsSection adapterId="homeassistant-mqtt" />
    </>
  );
};
