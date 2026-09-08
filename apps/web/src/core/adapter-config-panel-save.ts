/** AdapterConfigPanel save: validate, vault, persist, registry activation. */

import type { z } from 'zod';
import { canConnectHardwareAdapter } from '../lib/adapter-mode';
import { ignorePromiseRejection } from '../lib/ignore-promise-rejection';
import {
  type AdapterCredentialId,
  type AdapterCredentials,
  saveAdapterCredentials,
} from '../lib/secure-store';
import { useAppStore } from '../store';
import type { GatewayType, StoredSettings } from '../types';
import {
  eebusConfigSchema,
  knxConfigSchema,
  modbusConfigSchema,
  ocppConfigSchema,
  validateAdapterCredentials,
  victronConfigSchema,
} from './adapter-config-schemas';
import type { AdapterConnectionConfig } from './adapters/EnergyAdapter';
import type { VictronGatewayType } from './adapters/VictronMQTTAdapter';
import { type AdapterId, attachAdapterEntry, useEnergyStoreBase } from './useEnergyStore';

export type AdapterPanelType = 'victron' | 'modbus' | 'knx' | 'ocpp' | 'eebus';

export interface AdapterPanelSaveInput {
  id: string;
  type: AdapterPanelType;
  name: string;
  enabled: boolean;
  host: string;
  port: number;
  tls: boolean;
  authToken: string;
  pollIntervalMs: number;
  gatewayType?: 'cerbo-gx' | 'venus-gx' | 'rpi-victron';
  securityProfile?: 0 | 1 | 2 | 3;
  stationId?: string;
  iso15118?: boolean;
  clientCert?: string;
  clientKey?: string;
  skiFingerprint?: string;
}

export type SaveAdapterPanelResult =
  | { ok: true; registryId: AdapterId }
  | { ok: false; error: string };

const PANEL_TO_REGISTRY: Record<AdapterPanelType, AdapterCredentialId> = {
  victron: 'victron-mqtt',
  modbus: 'modbus-sunspec',
  knx: 'knx',
  ocpp: 'ocpp-21',
  eebus: 'eebus',
};

const SCHEMA_BY_TYPE: Record<AdapterPanelType, z.ZodType> = {
  victron: victronConfigSchema,
  modbus: modbusConfigSchema,
  knx: knxConfigSchema,
  ocpp: ocppConfigSchema,
  eebus: eebusConfigSchema,
};

const mapGatewayType = (gw?: AdapterPanelSaveInput['gatewayType']): VictronGatewayType => {
  if (gw === 'venus-gx') return 'cerbo-gx-mk2';
  if (gw === 'rpi-victron') return 'raspberry-pi';
  return 'cerbo-gx';
};

const mapGatewayToStored = (gw?: AdapterPanelSaveInput['gatewayType']): GatewayType => {
  if (gw === 'venus-gx') return 'cerbo-gx-mk2';
  if (gw === 'rpi-victron') return 'raspberry-pi';
  return 'cerbo-gx';
};

const buildValidationPayload = (entry: AdapterPanelSaveInput): Record<string, unknown> => {
  const base = {
    name: entry.name.trim(),
    host: entry.host.trim(),
    port: entry.port,
    tls: entry.tls,
    pollIntervalMs: entry.pollIntervalMs,
    authToken: entry.authToken.trim() || undefined,
    clientCert: entry.clientCert?.trim() || undefined,
    clientKey: entry.clientKey?.trim() || undefined,
  };

  switch (entry.type) {
    case 'victron':
      return { ...base, gatewayType: entry.gatewayType ?? 'cerbo-gx' };
    case 'ocpp':
      return {
        ...base,
        securityProfile: entry.securityProfile ?? 2,
        stationId: entry.stationId?.trim() || 'CP001',
      };
    case 'eebus':
      return {
        ...base,
        tls: true,
        skiFingerprint: entry.skiFingerprint?.trim() || undefined,
      };
    default:
      return base;
  }
};

export const validateAdapterPanelEntry = (
  entry: AdapterPanelSaveInput,
): { ok: true } | { ok: false; error: string } => {
  const schema = SCHEMA_BY_TYPE[entry.type];
  const parsed = schema.safeParse(buildValidationPayload(entry));
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues.map((i) => i.message).join('; ') };
  }

  const creds = buildCredentials(entry);
  if (Object.keys(creds).length > 0) {
    const credResult = validateAdapterCredentials(creds);
    if (!credResult.valid) {
      return { ok: false, error: credResult.error };
    }
  }

  return { ok: true };
};

const buildCredentials = (entry: AdapterPanelSaveInput): AdapterCredentials => {
  const creds: AdapterCredentials = {};
  const token = entry.authToken.trim();
  if (token) creds.authToken = token;
  const cert = entry.clientCert?.trim();
  if (cert) creds.clientCert = cert;
  const key = entry.clientKey?.trim();
  if (key) creds.clientKey = key;
  const ski = entry.skiFingerprint?.trim();
  if (ski) creds.skiFingerprint = ski;
  if (entry.type === 'ocpp' && entry.securityProfile !== undefined) {
    creds.ocppSecurityProfile = entry.securityProfile;
  }
  return creds;
};

const buildAdapterConfig = (
  entry: AdapterPanelSaveInput,
): AdapterConnectionConfig & Record<string, unknown> => {
  const config: AdapterConnectionConfig & Record<string, unknown> = {
    name: entry.name.trim(),
    host: entry.host.trim(),
    port: entry.port,
    tls: entry.tls,
    pollIntervalMs: entry.pollIntervalMs,
  };

  switch (entry.type) {
    case 'victron':
      config.gatewayType = mapGatewayType(entry.gatewayType);
      break;
    case 'ocpp':
      config.securityProfile = entry.securityProfile ?? 2;
      config.stationId = entry.stationId?.trim() || 'CP001';
      config.iso15118 = entry.iso15118 ?? false;
      break;
    case 'eebus':
      config.tls = true;
      if (entry.skiFingerprint?.trim()) {
        config.skiFingerprint = entry.skiFingerprint.trim();
      }
      break;
    default:
      break;
  }

  return config;
};

const buildSettingsPatch = (entry: AdapterPanelSaveInput): Partial<StoredSettings> => {
  if (entry.type === 'victron') {
    return {
      victronIp: entry.host.trim(),
      wsPort: entry.port,
      gatewayType: mapGatewayToStored(entry.gatewayType),
    };
  }
  if (entry.type === 'knx') {
    return { knxIp: entry.host.trim() };
  }
  return {};
};

/**
 * Validate, persist credentials + settings, reconfigure registry slot, optional connect.
 */
export const saveAdapterPanelEntry = async (
  entry: AdapterPanelSaveInput,
): Promise<SaveAdapterPanelResult> => {
  const validation = validateAdapterPanelEntry(entry);
  if (!validation.ok) {
    return validation;
  }

  const registryId = PANEL_TO_REGISTRY[entry.type] as AdapterId;
  const credentials = buildCredentials(entry);

  if (Object.keys(credentials).length > 0) {
    await saveAdapterCredentials(PANEL_TO_REGISTRY[entry.type], credentials);
  }

  const settingsPatch = buildSettingsPatch(entry);
  if (Object.keys(settingsPatch).length > 0) {
    useAppStore.getState().updateSettings(settingsPatch);
  }

  const config = buildAdapterConfig(entry);
  const state = useEnergyStoreBase.getState();
  if (!state.adapters[registryId]) {
    return { ok: false, error: `Unknown adapter registry id: ${registryId}` };
  }

  useEnergyStoreBase.getState().reconfigureAdapter(registryId, config, entry.enabled);
  attachAdapterEntry(registryId);

  if (entry.enabled && canConnectHardwareAdapter(true)) {
    const updated = useEnergyStoreBase.getState().adapters[registryId];
    if (updated?.adapter) {
      updated.adapter.connect().catch(ignorePromiseRejection);
    }
  }

  return { ok: true, registryId };
};

export const panelTypeToRegistryId = (type: AdapterPanelType): AdapterId => {
  return PANEL_TO_REGISTRY[type] as AdapterId;
};
