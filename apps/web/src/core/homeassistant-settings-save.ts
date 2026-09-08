/**
 * Home Assistant settings save — load contrib adapter, vault, registry activation.
 */

import { canConnectHardwareAdapter } from '../lib/adapter-mode';
import { ignorePromiseRejection } from '../lib/ignore-promise-rejection';
import { MQTT_BROKER_AUTH_FIELD } from '../lib/mqtt-credential-keys';
import { saveAdapterCredentials } from '../lib/secure-store';
import { useAppStore } from '../store';
import { loadContribAdapter } from './adapters/adapter-registry';
import type { HAConnectionMode, HAEntityRoleConfig } from './adapters/contrib/homeassistant-mqtt';
import type { AdapterConnectionConfig } from './adapters/EnergyAdapter';
import { attachAdapterEntry, useEnergyStoreBase } from './useEnergyStore';

const HA_ADAPTER_ID = 'homeassistant-mqtt';

export interface HomeAssistantSaveInput {
  enabled: boolean;
  haMode: HAConnectionMode;
  haBaseUrl: string;
  haToken: string;
  mqttHost: string;
  mqttPort: number;
  mqttUser: string;
  mqttBrokerAuth: string;
  mqttAutoDiscovery: boolean;
  entityRoles?: HAEntityRoleConfig[];
}

export type HomeAssistantSaveResult = { ok: true } | { ok: false; error: string };

const parseBaseUrl = (url: string): { host: string; port: number; tls: boolean } | null => {
  const trimmed = url.trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed.includes('://') ? trimmed : `http://${trimmed}`);
    const port =
      parsed.port !== ''
        ? Number(parsed.port)
        : parsed.protocol === 'https:' || parsed.protocol === 'wss:'
          ? 443
          : 80;
    if (!Number.isFinite(port) || port < 1 || port > 65535) return null;
    return {
      host: parsed.hostname,
      port,
      tls: parsed.protocol === 'https:' || parsed.protocol === 'wss:',
    };
  } catch {
    return null;
  }
};

const validateInput = (input: HomeAssistantSaveInput): HomeAssistantSaveResult => {
  if (input.haMode === 'ha-ws-api') {
    if (!input.haToken.trim()) {
      return { ok: false, error: 'HA access token is required' };
    }
    if (!parseBaseUrl(input.haBaseUrl)) {
      return { ok: false, error: 'Invalid Home Assistant base URL' };
    }
    return { ok: true };
  }

  const host = input.mqttHost.trim();
  if (!host || !/^[a-zA-Z0-9._-]+$/.test(host)) {
    return { ok: false, error: 'Invalid MQTT broker host' };
  }
  if (input.mqttPort < 1 || input.mqttPort > 65535) {
    return { ok: false, error: 'MQTT port must be between 1 and 65535' };
  }
  return { ok: true };
};

const buildHaConfig = (
  input: HomeAssistantSaveInput,
): AdapterConnectionConfig & Record<string, unknown> => {
  if (input.haMode === 'ha-ws-api') {
    const parsed = parseBaseUrl(input.haBaseUrl);
    if (!parsed) {
      throw new Error('Invalid Home Assistant base URL');
    }
    return {
      name: 'Home Assistant',
      host: parsed.host,
      port: parsed.port,
      tls: parsed.tls,
      haMode: 'ha-ws-api',
      haBaseUrl: input.haBaseUrl.trim(),
      haToken: input.haToken.trim(),
      haDiscovery: input.mqttAutoDiscovery,
      entityRoles: (input.entityRoles ?? []).filter((row) => row.entityId.trim() !== ''),
    };
  }

  return {
    name: 'Home Assistant MQTT',
    host: input.mqttHost.trim(),
    port: input.mqttPort,
    tls: false,
    haMode: 'mqtt-broker',
    haDiscovery: input.mqttAutoDiscovery,
    mqttUser: input.mqttUser.trim() || undefined,
    ...(input.mqttBrokerAuth.trim()
      ? { [MQTT_BROKER_AUTH_FIELD]: input.mqttBrokerAuth.trim() }
      : {}),
  };
};

export const saveHomeAssistantSettings = async (
  input: HomeAssistantSaveInput,
): Promise<HomeAssistantSaveResult> => {
  const validation = validateInput(input);
  if (!validation.ok) return validation;

  const loaded = await loadContribAdapter(HA_ADAPTER_ID);
  if (!loaded) {
    return { ok: false, error: 'Home Assistant adapter could not be loaded' };
  }

  const credentials: { authToken?: string; extra?: Record<string, string> } = {};
  if (input.haMode === 'ha-ws-api' && input.haToken.trim()) {
    credentials.authToken = input.haToken.trim();
  }
  if (input.haMode === 'mqtt-broker') {
    const extra: Record<string, string> = {};
    const brokerAuth = input.mqttBrokerAuth.trim();
    if (input.mqttUser.trim()) extra.mqttUser = input.mqttUser.trim();
    if (brokerAuth) extra[MQTT_BROKER_AUTH_FIELD] = brokerAuth;
    if (Object.keys(extra).length > 0) credentials.extra = extra;
    if (brokerAuth) credentials.authToken = brokerAuth;
  }
  if (Object.keys(credentials).length > 0) {
    await saveAdapterCredentials(HA_ADAPTER_ID, credentials);
  }

  useAppStore.getState().updateSettings({ mqttAutoDiscovery: input.mqttAutoDiscovery });

  const config = buildHaConfig(input);
  const store = useEnergyStoreBase.getState();

  if (!store.adapters[HA_ADAPTER_ID]) {
    const added = store.addContribAdapter(HA_ADAPTER_ID, config);
    if (!added) {
      return { ok: false, error: 'Home Assistant adapter could not be registered' };
    }
  }

  useEnergyStoreBase.getState().reconfigureAdapter(HA_ADAPTER_ID, config, input.enabled);
  attachAdapterEntry(HA_ADAPTER_ID);

  if (input.enabled && canConnectHardwareAdapter(true)) {
    const entry = useEnergyStoreBase.getState().adapters[HA_ADAPTER_ID];
    if (entry?.adapter) {
      entry.adapter.connect().catch(ignorePromiseRejection);
    }
  }

  return { ok: true };
};
