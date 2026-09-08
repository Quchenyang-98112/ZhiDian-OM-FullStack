import { listRegisteredAdapters } from '../core/adapters/adapter-registry';
import type { DeviceDefinition, DeviceProtocol } from '../core/hardware-registry';

/** Preferred adapter registry id per hardware protocol (first registered match wins). */
const PROTOCOL_ADAPTER_CANDIDATES: Partial<Record<DeviceProtocol, string[]>> = {
  'victron-dbus': ['victron-mqtt'],
  mqtt: ['victron-mqtt', 'homeassistant-mqtt', 'zigbee2mqtt'],
  'modbus-tcp': ['modbus-sunspec'],
  'modbus-rtu': ['modbus-sunspec'],
  sunspec: ['modbus-sunspec'],
  knx: ['knx'],
  'ocpp-16': ['ocpp-21'],
  'ocpp-20': ['ocpp-21'],
  'ocpp-21': ['ocpp-21'],
  eebus: ['eebus'],
  'http-rest': ['shelly-rest'],
  'shelly-gen2': ['shelly-rest'],
  homeassistant: ['homeassistant-mqtt'],
  'evcc-api': ['evcc'],
  openwb: ['evcc'],
  websocket: ['openems'],
};

const DEFAULT_PORTS: Record<string, number> = {
  'victron-mqtt': 9001,
  'modbus-sunspec': 8080,
  knx: 3671,
  'ocpp-21': 8080,
  eebus: 4712,
  evcc: 7070,
  openems: 8085,
  'homeassistant-mqtt': 1883,
  zigbee2mqtt: 1883,
  'shelly-rest': 80,
};

export function suggestAdapterIdForDevice(device: DeviceDefinition): string | null {
  const registered = new Set(listRegisteredAdapters().map((a) => a.id));
  for (const protocol of device.protocols) {
    const candidates = PROTOCOL_ADAPTER_CANDIDATES[protocol] ?? [];
    for (const id of candidates) {
      if (registered.has(id)) return id;
    }
  }
  return null;
}

export function defaultPortForAdapter(adapterId: string, device?: DeviceDefinition): number {
  if (device?.defaultPort) return device.defaultPort;
  return DEFAULT_PORTS[adapterId] ?? 8080;
}

export function defaultHostForDevice(device?: DeviceDefinition): string {
  return device ? '192.168.1.100' : '';
}
