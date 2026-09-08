import { useTranslation } from 'react-i18next';
import { inputClass } from './styles';

export const SystemNetworkFields = ({
  victronIp,
  knxIp,
  wsPort,
  refreshRateMs,
  onVictronIpChange,
  onKnxIpChange,
  onWsPortChange,
  onRefreshRateChange,
}: {
  victronIp: string;
  knxIp: string;
  wsPort: number;
  refreshRateMs: number;
  onVictronIpChange: (value: string) => void;
  onKnxIpChange: (value: string) => void;
  onWsPortChange: (value: number) => void;
  onRefreshRateChange: (value: number) => void;
}) => {
  const { t } = useTranslation();

  return (
    <>
      <div className="space-y-2">
        <label htmlFor="settings-victron-ip" className="font-medium text-sm">
          {t('settings.victronIp')}
        </label>
        <input
          id="settings-victron-ip"
          type="text"
          value={victronIp}
          onChange={(e) => onVictronIpChange(e.target.value)}
          className={inputClass}
          placeholder="192.168.1.100"
        />
        <p className="text-(--color-muted) text-xs">
          {t('settings.victronIpHint', 'IP address of your Victron Cerbo GX')}
        </p>
      </div>
      <div className="space-y-2">
        <label htmlFor="settings-knx-ip" className="font-medium text-sm">
          {t('settings.knxIp')}
        </label>
        <input
          id="settings-knx-ip"
          type="text"
          value={knxIp}
          onChange={(e) => onKnxIpChange(e.target.value)}
          className={inputClass}
          placeholder="192.168.1.101"
        />
        <p className="text-(--color-muted) text-xs">
          {t('settings.knxIpHint', 'IP address of your KNX IP router')}
        </p>
      </div>
      <div className="space-y-2">
        <label htmlFor="settings-ws-port" className="font-medium text-sm">
          {t('settings.wsPort')}
        </label>
        <input
          id="settings-ws-port"
          type="number"
          value={wsPort}
          onChange={(e) => onWsPortChange(Number(e.target.value))}
          className={inputClass}
          min={1}
          max={65535}
        />
        <p className="text-(--color-muted) text-xs">
          {t('settings.wsPortHint', 'Node-RED WebSocket port (default: 1880)')}
        </p>
      </div>
      <div className="space-y-2">
        <label htmlFor="settings-refresh-rate" className="font-medium text-sm">
          {t('settings.refreshRate')}
        </label>
        <input
          id="settings-refresh-rate"
          type="number"
          value={refreshRateMs}
          onChange={(e) => onRefreshRateChange(Number(e.target.value))}
          className={inputClass}
          min={500}
          max={30000}
          step={100}
        />
        <p className="text-(--color-muted) text-xs">
          {t('settings.refreshRateHint', 'Data polling interval in milliseconds')}
        </p>
      </div>
    </>
  );
};
