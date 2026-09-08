import type {
  HAConnectionMode,
  HAEntityRoleConfig,
  HomeAssistantMQTTConfig,
} from '../core/adapters/contrib/homeassistant-mqtt';
import { MQTT_BROKER_AUTH_FIELD } from './mqtt-credential-keys';
import type { AdapterCredentials } from './secure-store';

export type HaSettingsHydratedState = {
  haMode: HAConnectionMode;
  haBaseUrl: string;
  haToken: string;
  mqttHost: string;
  mqttPort: number;
  mqttUser: string;
  mqttBrokerAuth: string;
  enabled: boolean;
  entityRoles: HAEntityRoleConfig[];
};

const DEFAULT_STATE: HaSettingsHydratedState = {
  haMode: 'ha-ws-api',
  haBaseUrl: 'http://homeassistant.local:8123',
  haToken: '',
  mqttHost: '',
  mqttPort: 1883,
  mqttUser: '',
  mqttBrokerAuth: '',
  enabled: false,
  entityRoles: [],
};

/** Build HA settings form defaults from adapter registry config and credential vault. */
export function hydrateHomeAssistantSettingsFromAdapter(
  config: HomeAssistantMQTTConfig | null | undefined,
  credentials: AdapterCredentials | null | undefined,
  enabled: boolean,
): HaSettingsHydratedState {
  if (!config) {
    return { ...DEFAULT_STATE, enabled };
  }

  const haMode = config.haMode ?? 'mqtt-broker';
  const haBaseUrl =
    config.haBaseUrl ??
    (config.host
      ? `http${config.tls ? 's' : ''}://${config.host}:${config.port ?? 8123}`
      : DEFAULT_STATE.haBaseUrl);

  return {
    haMode,
    haBaseUrl,
    haToken: credentials?.authToken ?? config.haToken ?? '',
    mqttHost: haMode === 'mqtt-broker' ? (config.host ?? '') : '',
    mqttPort: config.port ?? 1883,
    mqttUser: credentials?.extra?.mqttUser ?? config.mqttUser ?? '',
    mqttBrokerAuth: resolveMqttBrokerAuth(credentials, config),
    enabled,
    entityRoles: config.entityRoles ? [...config.entityRoles] : [],
  };
}

function resolveMqttBrokerAuth(
  credentials: AdapterCredentials | null | undefined,
  config: HomeAssistantMQTTConfig,
): string {
  const fromVault = credentials?.extra?.[MQTT_BROKER_AUTH_FIELD];
  if (fromVault) return fromVault;
  if (credentials?.authToken) return credentials.authToken;
  const configRecord = config as Record<string, string | undefined>;
  return configRecord[MQTT_BROKER_AUTH_FIELD] ?? '';
}
