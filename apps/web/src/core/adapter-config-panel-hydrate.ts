/** Build AdapterConfigPanel entries from registry state, settings, and credential vault. */

import type { AdapterEntry, AdapterType } from '../components/adapter-config-types';
import { ADAPTER_DEFAULTS } from '../components/adapter-config-types';
import type { AdapterCredentialId, AdapterCredentials } from '../lib/secure-store';
import { getAdapterCredentials } from '../lib/secure-store';
import type { StoredSettings } from '../types';
import type { AdapterPanelType } from './adapter-config-panel-save';
import type { AdapterConnectionConfig, EnergyAdapter } from './adapters/EnergyAdapter';
import type { AdapterId } from './useEnergyStore';

const REGISTRY_TO_PANEL: Record<string, AdapterPanelType> = {
  'victron-mqtt': 'victron',
  'modbus-sunspec': 'modbus',
  knx: 'knx',
  'ocpp-21': 'ocpp',
  eebus: 'eebus',
};

const PANEL_REGISTRY_IDS = Object.keys(REGISTRY_TO_PANEL) as AdapterId[];

const mapStoredGateway = (gw: StoredSettings['gatewayType']): AdapterEntry['gatewayType'] => {
  if (gw === 'cerbo-gx-mk2') return 'venus-gx';
  if (gw === 'raspberry-pi') return 'rpi-victron';
  return 'cerbo-gx';
};

const mapConfigGateway = (
  config: AdapterConnectionConfig,
): AdapterEntry['gatewayType'] | undefined => {
  const gw = (config as unknown as Record<string, unknown>).gatewayType;
  if (gw === 'cerbo-gx-mk2') return 'venus-gx';
  if (gw === 'raspberry-pi') return 'rpi-victron';
  if (gw === 'cerbo-gx') return 'cerbo-gx';
  return undefined;
};

const readConnectionConfig = (adapter: EnergyAdapter): AdapterConnectionConfig | null => {
  return adapter.getConnectionConfig?.() ?? null;
};

const isConfiguredAdapter = (
  host: string,
  enabled: boolean,
  creds: AdapterCredentials,
): boolean => {
  const hasCredentials = Object.keys(creds).length > 0;
  const hasHost = host.trim() !== '' && host !== 'localhost';
  return enabled || hasCredentials || hasHost;
};

const resolveHost = (
  panelType: AdapterPanelType,
  settings: StoredSettings,
  config: AdapterConnectionConfig | null,
): string => {
  const hostFromSettings =
    panelType === 'victron' ? settings.victronIp : panelType === 'knx' ? settings.knxIp : '';
  return (hostFromSettings || config?.host || '').trim();
};

const resolvePort = (
  panelType: AdapterPanelType,
  settings: StoredSettings,
  config: AdapterConnectionConfig | null,
  defaults: (typeof ADAPTER_DEFAULTS)[AdapterPanelType],
): number => {
  if (panelType === 'victron' && settings.wsPort) return settings.wsPort;
  return config?.port ?? defaults.port ?? 1880;
};

const normalizeSecurityProfile = (
  creds: AdapterCredentials,
  configRecord: Record<string, unknown>,
  defaults: (typeof ADAPTER_DEFAULTS)[AdapterPanelType],
): AdapterEntry['securityProfile'] => {
  const raw =
    creds.ocppSecurityProfile ??
    (configRecord.securityProfile as number | undefined) ??
    defaults.securityProfile;
  if (raw === 0 || raw === 1 || raw === 2 || raw === 3) return raw;
  return defaults.securityProfile;
};

const buildTypeSpecificFields = (
  panelType: AdapterPanelType,
  settings: StoredSettings,
  config: AdapterConnectionConfig | null,
  configRecord: Record<string, unknown>,
  creds: AdapterCredentials,
  defaults: (typeof ADAPTER_DEFAULTS)[AdapterPanelType],
): Partial<AdapterEntry> => {
  const gatewayType =
    panelType === 'victron'
      ? mapStoredGateway(settings.gatewayType)
      : config
        ? mapConfigGateway(config)
        : undefined;

  const securityProfile = normalizeSecurityProfile(creds, configRecord, defaults);
  const knxTransport =
    configRecord.knxTransport === 'websocket' || configRecord.knxTransport === 'mqtt'
      ? configRecord.knxTransport
      : defaults.knxTransport;

  return {
    ...(gatewayType ? { gatewayType } : {}),
    ...(securityProfile !== undefined ? { securityProfile } : {}),
    ...(defaults.stationId !== undefined
      ? { stationId: (configRecord.stationId as string | undefined) ?? defaults.stationId }
      : {}),
    ...(defaults.iso15118 !== undefined
      ? { iso15118: (configRecord.iso15118 as boolean | undefined) ?? defaults.iso15118 }
      : {}),
    ...(knxTransport ? { knxTransport } : {}),
    ...(defaults.gaMapping
      ? { gaMapping: (configRecord.gaMapping as AdapterEntry['gaMapping']) ?? defaults.gaMapping }
      : {}),
    clientCert: creds.clientCert ?? config?.clientCert ?? '',
    clientKey: creds.clientKey ?? config?.clientKey ?? '',
    skiFingerprint:
      creds.skiFingerprint ?? (configRecord.skiFingerprint as string | undefined) ?? '',
  };
};

const buildAdapterPanelEntry = (
  panelType: AdapterPanelType,
  counter: number,
  settings: StoredSettings,
  storeEntry: { enabled: boolean; adapter: EnergyAdapter },
  creds: AdapterCredentials,
  defaultName: (type: AdapterType) => string,
): AdapterEntry | null => {
  const config = readConnectionConfig(storeEntry.adapter);
  const defaults = ADAPTER_DEFAULTS[panelType];
  const host = resolveHost(panelType, settings, config);

  if (!isConfiguredAdapter(host, storeEntry.enabled, creds)) {
    return null;
  }

  const configRecord = (config ?? {}) as unknown as Record<string, unknown>;

  return {
    id: `${panelType}-${counter}`,
    type: panelType,
    name: config?.name?.trim() || defaultName(panelType),
    enabled: storeEntry.enabled,
    host: host || (defaults.port ? '' : 'localhost'),
    port: resolvePort(panelType, settings, config, defaults),
    tls: config?.tls ?? defaults.tls ?? false,
    authToken: creds.authToken ?? config?.authToken ?? '',
    pollIntervalMs: config?.pollIntervalMs ?? defaults.pollIntervalMs ?? 3000,
    ...buildTypeSpecificFields(panelType, settings, config, configRecord, creds, defaults),
  };
};

export function buildAdapterPanelEntriesFromState(input: {
  settings: StoredSettings;
  adapters: Record<string, { enabled: boolean; adapter: EnergyAdapter }>;
  credentials: Partial<Record<AdapterCredentialId, AdapterCredentials>>;
  defaultName: (type: AdapterType) => string;
}): AdapterEntry[] {
  const entries: AdapterEntry[] = [];
  let counter = 0;

  for (const registryId of PANEL_REGISTRY_IDS) {
    const panelType = REGISTRY_TO_PANEL[registryId];
    if (!panelType) continue;

    const storeEntry = input.adapters[registryId];
    if (!storeEntry) continue;

    const creds = input.credentials[registryId as AdapterCredentialId] ?? {};
    const entry = buildAdapterPanelEntry(
      panelType,
      counter + 1,
      input.settings,
      storeEntry,
      creds,
      input.defaultName,
    );
    if (!entry) continue;

    counter += 1;
    entries.push(entry);
  }

  return entries;
}

const ADAPTER_PANEL_CREDENTIAL_IDS: AdapterCredentialId[] = [
  'victron-mqtt',
  'modbus-sunspec',
  'knx',
  'ocpp-21',
  'eebus',
];

/** Load saved adapter credentials for the settings adapter panel. */
export async function fetchAdapterPanelCredentials(): Promise<
  Partial<Record<AdapterCredentialId, AdapterCredentials>>
> {
  const credentialEntries = await Promise.all(
    ADAPTER_PANEL_CREDENTIAL_IDS.map(async (id) => [id, await getAdapterCredentials(id)] as const),
  );
  return Object.fromEntries(credentialEntries.filter(([, creds]) => creds != null)) as Partial<
    Record<AdapterCredentialId, AdapterCredentials>
  >;
}
