import { Activity, Cable, Gauge, Plug, Radio, type Server } from 'lucide-react';

export type AdapterType = 'victron' | 'modbus' | 'knx' | 'ocpp' | 'eebus';

export interface GAMappingEntry {
  roomId: string;
  roomName: string;
  lightGA: string;
  dimmerGA: string;
  temperatureGA: string;
  setpointGA: string;
  windowGA: string;
  humidityGA: string;
}

export interface AdapterEntry {
  id: string;
  type: AdapterType;
  name: string;
  enabled: boolean;
  host: string;
  port: number;
  tls: boolean;
  authToken: string;
  pollIntervalMs: number;
  // Victron
  gatewayType?: 'cerbo-gx' | 'venus-gx' | 'rpi-victron';
  // OCPP
  securityProfile?: 0 | 1 | 2 | 3;
  stationId?: string;
  iso15118?: boolean;
  clientCert?: string;
  clientKey?: string;
  // EEBUS
  skiFingerprint?: string;
  // KNX
  knxTransport?: 'websocket' | 'mqtt';
  gaMapping?: GAMappingEntry[];
}

export const ADAPTER_DEFAULTS: Record<AdapterType, Partial<AdapterEntry>> = {
  victron: { port: 1880, tls: false, gatewayType: 'cerbo-gx', pollIntervalMs: 3000 },
  modbus: { port: 502, tls: false, pollIntervalMs: 5000 },
  knx: { port: 3671, tls: false, knxTransport: 'websocket', gaMapping: [], pollIntervalMs: 3000 },
  ocpp: {
    port: 9000,
    tls: true,
    securityProfile: 2,
    stationId: 'CP001',
    iso15118: false,
    pollIntervalMs: 5000,
  },
  eebus: { port: 4712, tls: true, skiFingerprint: '', pollIntervalMs: 5000 },
};

export const ADAPTER_META: Record<
  AdapterType,
  { icon: typeof Server; color: string; capabilities: string[] }
> = {
  victron: {
    icon: Activity,
    color: 'text-blue-400',
    capabilities: ['pv', 'battery', 'grid', 'load'],
  },
  modbus: { icon: Gauge, color: 'text-amber-400', capabilities: ['pv', 'battery', 'grid'] },
  knx: { icon: Radio, color: 'text-green-400', capabilities: ['knx'] },
  ocpp: { icon: Plug, color: 'text-cyan-400', capabilities: ['evCharger'] },
  eebus: { icon: Cable, color: 'text-purple-400', capabilities: ['evCharger', 'load', 'grid'] },
};
