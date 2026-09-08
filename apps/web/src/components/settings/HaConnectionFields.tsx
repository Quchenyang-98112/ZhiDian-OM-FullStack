import type { HAConnectionMode } from '../../core/adapters/contrib/homeassistant-mqtt';

const inputClass =
  'w-full rounded-xl border border-(--color-border) bg-(--color-surface) px-4 py-2.5 text-(--color-text) focus:border-(--color-primary)/70 focus:outline-none focus:ring-2 focus:ring-(--color-primary)/20';

export const HaWsApiFields = ({
  haBaseUrl,
  haToken,
  isReadOnly,
  onBaseUrlChange,
  onTokenChange,
  t,
}: {
  haBaseUrl: string;
  haToken: string;
  isReadOnly: boolean;
  onBaseUrlChange: (value: string) => void;
  onTokenChange: (value: string) => void;
  t: (key: string) => string;
}) => (
  <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
    <div className="space-y-2 md:col-span-2">
      <label htmlFor="settings-ha-base-url" className="font-medium text-sm">
        {t('settings.haBaseUrl')}
      </label>
      <input
        id="settings-ha-base-url"
        type="url"
        value={haBaseUrl}
        onChange={(e) => onBaseUrlChange(e.target.value)}
        className={inputClass}
        placeholder="http://homeassistant.local:8123"
        disabled={isReadOnly}
      />
    </div>
    <div className="space-y-2 md:col-span-2">
      <label htmlFor="settings-ha-token" className="font-medium text-sm">
        {t('settings.haToken')}
      </label>
      <input
        id="settings-ha-token"
        type="password"
        value={haToken}
        onChange={(e) => onTokenChange(e.target.value)}
        className={inputClass}
        autoComplete="off"
        disabled={isReadOnly}
      />
      <p className="text-(--color-muted) text-xs">{t('settings.haTokenHint')}</p>
    </div>
  </div>
);

export const MqttBrokerFields = ({
  mqttHost,
  mqttPort,
  mqttUser,
  mqttBrokerAuth,
  isReadOnly,
  onHostChange,
  onPortChange,
  onUserChange,
  onBrokerAuthChange,
  t,
}: {
  mqttHost: string;
  mqttPort: number;
  mqttUser: string;
  mqttBrokerAuth: string;
  isReadOnly: boolean;
  onHostChange: (value: string) => void;
  onPortChange: (value: number) => void;
  onUserChange: (value: string) => void;
  onBrokerAuthChange: (value: string) => void;
  t: (key: string) => string;
}) => (
  <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
    <div className="space-y-2">
      <label htmlFor="settings-mqtt-broker-host" className="font-medium text-sm">
        {t('mqtt.brokerUrl')}
      </label>
      <input
        id="settings-mqtt-broker-host"
        type="text"
        value={mqttHost}
        onChange={(e) => onHostChange(e.target.value)}
        className={inputClass}
        placeholder="192.168.1.50"
        disabled={isReadOnly}
      />
    </div>
    <div className="space-y-2">
      <label htmlFor="settings-mqtt-broker-port" className="font-medium text-sm">
        {t('mqtt.port')}
      </label>
      <input
        id="settings-mqtt-broker-port"
        type="number"
        value={mqttPort}
        onChange={(e) => onPortChange(Number(e.target.value))}
        className={inputClass}
        min={1}
        max={65535}
        disabled={isReadOnly}
      />
    </div>
    <div className="space-y-2">
      <label htmlFor="settings-mqtt-username" className="font-medium text-sm">
        {t('mqtt.username')}
      </label>
      <input
        id="settings-mqtt-username"
        type="text"
        value={mqttUser}
        onChange={(e) => onUserChange(e.target.value)}
        className={inputClass}
        disabled={isReadOnly}
      />
    </div>
    <div className="space-y-2">
      <label htmlFor="settings-mqtt-password" className="font-medium text-sm">
        {t('mqtt.password')}
      </label>
      <input
        id="settings-mqtt-password"
        type="password"
        value={mqttBrokerAuth}
        onChange={(e) => onBrokerAuthChange(e.target.value)}
        className={inputClass}
        disabled={isReadOnly}
      />
    </div>
  </div>
);

export type { HAConnectionMode };
