/**
 * Protocol Adapter Registry — Backend
 *
 * Instantiates and starts all configured protocol adapters based on
 * the ADAPTER_MODE environment variable and device-map.json.
 *
 * ADAPTER_MODE=mock (default) → No real hardware adapters started (safe for CI/demo)
 * ADAPTER_MODE=live + ALLOW_LIVE_HARDWARE=true → Modbus + MQTT adapters from device-map.json
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { IProtocolAdapter } from '@nexus-hems/shared-types';
import {
  getEffectiveAdapterMode,
  isLiveHardwareAllowed,
  logAdapterModeStartup,
} from '../config/adapter-mode.js';
import type { EventBus } from '../core/EventBus.js';
import {
  publishAllAdapterMetrics,
  recordAdapterConnection,
  recordAdapterDatapoint,
  recordAdapterHealthSnapshot,
  recordAdapterRegistration,
} from '../middleware/adapter-metrics.js';
import { EebusProtocolAdapter } from './eebus/EebusProtocolAdapter.js';
import { EvccAdapter } from './evcc/EvccAdapter.js';
import { createHeatPumpAdapterFromEnv } from './heatpump/HeatPumpAdapter.js';
import { createHomeAssistantMqttAdapterFromEnv } from './homeassistant/HomeAssistantMqttProtocolAdapter.js';
import { createHomeAssistantAdapterFromEnv } from './homeassistant/HomeAssistantProtocolAdapter.js';
import { KnxAdapter, type KnxGaMapping } from './knx/KnxAdapter.js';
import { createMatterAdapterFromEnv } from './matter/MatterProtocolAdapter.js';
import { type DeviceConfig, ModbusAdapter } from './modbus/ModbusAdapter.js';
import { MqttAdapter } from './mqtt/MqttAdapter.js';
import { createOcppCsmsAdapterFromEnv } from './ocpp/OcppCsmsProtocolAdapter.js';
import { createOpenEMSAdapterFromEnv } from './openems/OpenEMSProtocolAdapter.js';
import {
  clearProtocolCommandHandlers,
  registerCommandCapableAdapter,
  unregisterCommandCapableAdapter,
} from './ProtocolCommandRouter.js';
import { createZigbee2MQTTAdapterFromEnv } from './zigbee2mqtt/Zigbee2MQTTProtocolAdapter.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEVICE_MAP_PATH = join(__dirname, '../data/device-map.json');
const KNX_GA_MAP_PATH = join(__dirname, '../data/knx-ga-map.json');

/**
 * Log a safety warning when live hardware mode is active and device-map.json
 * lists one or more targets (Perfection Roadmap 0.1).
 */
export function warnIfLiveDeviceMapActive(
  deviceCount: number,
  env: NodeJS.ProcessEnv = process.env,
): void {
  if (!isLiveHardwareAllowed(env) || deviceCount <= 0) return;

  console.warn(`[Adapters] LIVE MODE: device-map.json lists ${deviceCount} device target(s).`);
  console.warn(
    '[Adapters] Verify each IP/host before polling — see docs/Safety-Certification-Notice.md',
  );
}

const activeAdapters: IProtocolAdapter[] = [];

export type AdapterStatus = 'starting' | 'healthy' | 'unhealthy' | 'failed' | 'stopped';

export interface AdapterRunState {
  id: string;
  protocol: string;
  status: AdapterStatus;
  error?: string | undefined;
  startedAt?: number | undefined;
  lastCheckAt?: number | undefined;
}

const adapterStates = new Map<string, AdapterRunState>();
const activeAdapterRefs = new Map<string, IProtocolAdapter>();

let metricsRefreshTimer: ReturnType<typeof setInterval> | null = null;

function mapRunStatusToConnection(
  status: AdapterStatus,
): 'connected' | 'disconnected' | 'degraded' | 'failed' {
  switch (status) {
    case 'healthy':
      return 'connected';
    case 'starting':
    case 'unhealthy':
      return 'degraded';
    case 'failed':
      return 'failed';
    default:
      return 'disconnected';
  }
}

function setState(
  id: string,
  protocol: string,
  status: AdapterStatus,
  error?: string,
): AdapterRunState {
  const existing = adapterStates.get(id);
  const state: AdapterRunState = {
    ...existing,
    id,
    protocol,
    status,
    error,
    lastCheckAt: Date.now(),
  };
  adapterStates.set(id, state);
  recordAdapterConnection(id, protocol, mapRunStatusToConnection(status));
  return state;
}

/**
 * Start all protocol adapters and connect them to the EventBus.
 * Called once on server startup.
 */
export async function startProtocolAdapters(eventBus: EventBus): Promise<void> {
  logAdapterModeStartup();

  if (!isLiveHardwareAllowed()) {
    return;
  }

  // -------------------------------------------------------------------------
  // Modbus Adapters (from device-map.json)
  // -------------------------------------------------------------------------
  let deviceMap: DeviceConfig[] = [];
  try {
    const raw = readFileSync(DEVICE_MAP_PATH, 'utf8');
    deviceMap = JSON.parse(raw) as DeviceConfig[];
  } catch (err) {
    console.warn(
      '[Adapters] device-map.json not found or invalid — no Modbus adapters started:',
      err,
    );
  }

  warnIfLiveDeviceMapActive(deviceMap.length);

  for (const device of deviceMap) {
    if (device.protocol !== 'modbus-sunspec') continue;

    const adapter = new ModbusAdapter(device);
    activeAdapters.push(adapter);
    activeAdapterRefs.set(device.deviceId, adapter);
    recordAdapterRegistration(device.deviceId, device.protocol);
    setState(device.deviceId, device.protocol, 'starting');

    // Connect and pipe data stream to EventBus
    adapter
      .connect()
      .then(() => {
        setState(device.deviceId, device.protocol, 'healthy');
        pipeAdapterToEventBus(adapter, eventBus);
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        setState(device.deviceId, device.protocol, 'failed', message);
        console.error('[Adapters] Failed to start ModbusAdapter:', device.deviceId, err);
      });
  }

  // -------------------------------------------------------------------------
  // MQTT Adapter (Victron Venus OS / generic MQTT brokers)
  // -------------------------------------------------------------------------
  const mqttBrokerUrl = process.env.MQTT_BROKER_URL;
  if (mqttBrokerUrl) {
    const mqttAdapter = new MqttAdapter({
      id: 'victron-mqtt-01',
      protocol: 'victron-mqtt',
      brokerUrl: mqttBrokerUrl,
      topicPatterns: [
        {
          pattern: 'N/+/system/+/Dc/Battery/Power',
          metric: 'POWER_W',
          deviceIdExtract: 'topic[1]',
          role: 'battery',
        },
        {
          pattern: 'N/+/system/+/Dc/Battery/Soc',
          metric: 'SOC_PERCENT',
          deviceIdExtract: 'topic[1]',
          role: 'battery',
        },
        {
          pattern: 'N/+/vebus/+/Ac/Out/P',
          metric: 'POWER_W',
          deviceIdExtract: 'topic[1]',
          role: 'load',
        },
      ],
    });
    activeAdapters.push(mqttAdapter);
    activeAdapterRefs.set(mqttAdapter.id, mqttAdapter);
    recordAdapterRegistration(mqttAdapter.id, mqttAdapter.protocol);
    setState(mqttAdapter.id, mqttAdapter.protocol, 'starting');

    mqttAdapter
      .connect()
      .then(() => {
        setState(mqttAdapter.id, mqttAdapter.protocol, 'healthy');
        pipeAdapterToEventBus(mqttAdapter, eventBus);
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        setState(mqttAdapter.id, mqttAdapter.protocol, 'failed', message);
        console.error('[Adapters] Failed to start MqttAdapter:', err);
      });
  }

  // -------------------------------------------------------------------------
  // KNX/IP Adapter (WebSocket JSON bridge — knxd / custom gateway)
  // -------------------------------------------------------------------------
  const knxBridgeUrl = process.env.KNX_BRIDGE_WS_URL;
  if (knxBridgeUrl) {
    let knxMappings: KnxGaMapping[] = [];
    try {
      const raw = readFileSync(KNX_GA_MAP_PATH, 'utf8');
      knxMappings = JSON.parse(raw) as KnxGaMapping[];
    } catch (err) {
      console.warn(
        '[Adapters] knx-ga-map.json not found or invalid — KNX adapter needs mappings:',
        err,
      );
    }

    if (knxMappings.length > 0) {
      const knxAdapter = new KnxAdapter({
        id: 'knx-bridge-01',
        wsUrl: knxBridgeUrl,
        mappings: knxMappings,
      });
      activeAdapters.push(knxAdapter);
      activeAdapterRefs.set(knxAdapter.id, knxAdapter);
      recordAdapterRegistration(knxAdapter.id, knxAdapter.protocol);
      setState(knxAdapter.id, knxAdapter.protocol, 'starting');

      knxAdapter
        .connect()
        .then(() => {
          setState(knxAdapter.id, knxAdapter.protocol, 'healthy');
          pipeAdapterToEventBus(knxAdapter, eventBus);
        })
        .catch((err: unknown) => {
          const message = err instanceof Error ? err.message : String(err);
          setState(knxAdapter.id, knxAdapter.protocol, 'failed', message);
          console.error('[Adapters] Failed to start KnxAdapter:', err);
        });
    } else {
      console.warn(
        '[Adapters] KNX_BRIDGE_WS_URL set but knx-ga-map.json is empty — copy knx-ga-map.example.json',
      );
    }
  }

  // -------------------------------------------------------------------------
  // evcc Adapter (REST /api/state + optional /ws push)
  // -------------------------------------------------------------------------
  const evccBaseUrl = process.env.EVCC_BASE_URL;
  if (evccBaseUrl) {
    const evccAdapter = new EvccAdapter({
      id: 'evcc-01',
      baseUrl: evccBaseUrl,
      ...(process.env.EVCC_AUTH_TOKEN ? { authToken: process.env.EVCC_AUTH_TOKEN } : {}),
      ...(process.env.EVCC_DEVICE_ID ? { deviceId: process.env.EVCC_DEVICE_ID } : {}),
    });
    activeAdapters.push(evccAdapter);
    activeAdapterRefs.set(evccAdapter.id, evccAdapter);
    recordAdapterRegistration(evccAdapter.id, evccAdapter.protocol);
    setState(evccAdapter.id, evccAdapter.protocol, 'starting');

    evccAdapter
      .connect()
      .then(() => {
        setState(evccAdapter.id, evccAdapter.protocol, 'healthy');
        pipeAdapterToEventBus(evccAdapter, eventBus);
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        setState(evccAdapter.id, evccAdapter.protocol, 'failed', message);
        console.error('[Adapters] Failed to start EvccAdapter:', err);
      });
  }

  // -------------------------------------------------------------------------
  // EEBUS SPINE/SHIP Adapter
  // Activates when the EEBUS trust store contains at least one trusted device.
  // Disable explicitly with EEBUS_DISABLE=true (e.g. for environments without
  // local network access to EEBUS devices).
  // -------------------------------------------------------------------------
  if (process.env.EEBUS_DISABLE !== 'true') {
    const eebusAdapter = new EebusProtocolAdapter({ id: 'eebus-spine-01' });
    activeAdapters.push(eebusAdapter);
    activeAdapterRefs.set(eebusAdapter.id, eebusAdapter);
    recordAdapterRegistration(eebusAdapter.id, eebusAdapter.protocol);
    setState(eebusAdapter.id, eebusAdapter.protocol, 'starting');

    eebusAdapter
      .connect()
      .then(() => {
        setState(eebusAdapter.id, eebusAdapter.protocol, 'healthy');
        pipeAdapterToEventBus(eebusAdapter, eventBus);
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        setState(eebusAdapter.id, eebusAdapter.protocol, 'failed', message);
        console.error('[Adapters] Failed to start EebusProtocolAdapter:', err);
      });
  }

  // -------------------------------------------------------------------------
  // Heat Pump Adapter (Modbus TCP — Stiebel, Viessmann, Wolf, NIBE, Alpha, Daikin)
  // Enable via env: HEATPUMP_HOST=192.168.1.x HEATPUMP_MANUFACTURER=stiebel
  // -------------------------------------------------------------------------
  const heatPumpAdapter = createHeatPumpAdapterFromEnv();
  if (heatPumpAdapter) {
    activeAdapters.push(heatPumpAdapter);
    activeAdapterRefs.set(heatPumpAdapter.id, heatPumpAdapter);
    recordAdapterRegistration(heatPumpAdapter.id, heatPumpAdapter.protocol);
    setState(heatPumpAdapter.id, heatPumpAdapter.protocol, 'starting');

    heatPumpAdapter
      .connect()
      .then(() => {
        setState(heatPumpAdapter.id, heatPumpAdapter.protocol, 'healthy');
        pipeAdapterToEventBus(heatPumpAdapter, eventBus);
        registerCommandCapableAdapter(heatPumpAdapter);
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        setState(heatPumpAdapter.id, heatPumpAdapter.protocol, 'failed', message);
        console.error('[Adapters] Failed to start HeatPumpAdapter:', err);
      });
  }

  // -------------------------------------------------------------------------
  // OpenEMS Edge Adapter (JSON-RPC over WebSocket)
  // Enable via env: OPENEMS_HOST=192.168.1.x
  // -------------------------------------------------------------------------
  const openEmsAdapter = createOpenEMSAdapterFromEnv();
  if (openEmsAdapter) {
    activeAdapters.push(openEmsAdapter);
    activeAdapterRefs.set(openEmsAdapter.id, openEmsAdapter);
    recordAdapterRegistration(openEmsAdapter.id, openEmsAdapter.protocol);
    setState(openEmsAdapter.id, openEmsAdapter.protocol, 'starting');

    openEmsAdapter
      .connect()
      .then(() => {
        registerCommandCapableAdapter(openEmsAdapter);
        setState(openEmsAdapter.id, openEmsAdapter.protocol, 'healthy');
        pipeAdapterToEventBus(openEmsAdapter, eventBus);
      })
      .catch((err: unknown) => {
        unregisterCommandCapableAdapter(openEmsAdapter);
        const message = err instanceof Error ? err.message : String(err);
        setState(openEmsAdapter.id, openEmsAdapter.protocol, 'failed', message);
        console.error('[Adapters] Failed to start OpenEMSProtocolAdapter:', err);
      });
  }

  // -------------------------------------------------------------------------
  // Home Assistant (WebSocket API — read-only telemetry)
  // Enable via env: HA_HOST=homeassistant.local HA_TOKEN=<long-lived-token>
  // -------------------------------------------------------------------------
  const homeAssistantAdapter = createHomeAssistantAdapterFromEnv();
  if (homeAssistantAdapter) {
    activeAdapters.push(homeAssistantAdapter);
    activeAdapterRefs.set(homeAssistantAdapter.id, homeAssistantAdapter);
    recordAdapterRegistration(homeAssistantAdapter.id, homeAssistantAdapter.protocol);
    setState(homeAssistantAdapter.id, homeAssistantAdapter.protocol, 'starting');

    homeAssistantAdapter
      .connect()
      .then(() => {
        registerCommandCapableAdapter(homeAssistantAdapter);
        setState(homeAssistantAdapter.id, homeAssistantAdapter.protocol, 'healthy');
        pipeAdapterToEventBus(homeAssistantAdapter, eventBus);
      })
      .catch((err: unknown) => {
        unregisterCommandCapableAdapter(homeAssistantAdapter);
        const message = err instanceof Error ? err.message : String(err);
        setState(homeAssistantAdapter.id, homeAssistantAdapter.protocol, 'failed', message);
        console.error('[Adapters] Failed to start HomeAssistantProtocolAdapter:', err);
      });
  }

  // -------------------------------------------------------------------------
  // Home Assistant MQTT (Discovery broker — read-only telemetry)
  // Enable via env: HA_MQTT_BROKER_URL=mqtt://mosquitto:1883
  // -------------------------------------------------------------------------
  const homeAssistantMqttAdapter = createHomeAssistantMqttAdapterFromEnv();
  if (homeAssistantMqttAdapter) {
    activeAdapters.push(homeAssistantMqttAdapter);
    activeAdapterRefs.set(homeAssistantMqttAdapter.id, homeAssistantMqttAdapter);
    recordAdapterRegistration(homeAssistantMqttAdapter.id, homeAssistantMqttAdapter.protocol);
    setState(homeAssistantMqttAdapter.id, homeAssistantMqttAdapter.protocol, 'starting');

    homeAssistantMqttAdapter
      .connect()
      .then(() => {
        registerCommandCapableAdapter(homeAssistantMqttAdapter);
        setState(homeAssistantMqttAdapter.id, homeAssistantMqttAdapter.protocol, 'healthy');
        pipeAdapterToEventBus(homeAssistantMqttAdapter, eventBus);
      })
      .catch((err: unknown) => {
        unregisterCommandCapableAdapter(homeAssistantMqttAdapter);
        const message = err instanceof Error ? err.message : String(err);
        setState(homeAssistantMqttAdapter.id, homeAssistantMqttAdapter.protocol, 'failed', message);
        console.error('[Adapters] Failed to start HomeAssistantMqttProtocolAdapter:', err);
      });
  }

  // -------------------------------------------------------------------------
  // Zigbee2MQTT (MQTT bridge — telemetry + SET commands for heat pump / EV plugs)
  // Enable via env: Z2M_BROKER_URL=mqtt://mosquitto:1883
  // -------------------------------------------------------------------------
  const zigbee2MqttAdapter = createZigbee2MQTTAdapterFromEnv();
  if (zigbee2MqttAdapter) {
    activeAdapters.push(zigbee2MqttAdapter);
    activeAdapterRefs.set(zigbee2MqttAdapter.id, zigbee2MqttAdapter);
    recordAdapterRegistration(zigbee2MqttAdapter.id, zigbee2MqttAdapter.protocol);
    setState(zigbee2MqttAdapter.id, zigbee2MqttAdapter.protocol, 'starting');

    zigbee2MqttAdapter
      .connect()
      .then(() => {
        setState(zigbee2MqttAdapter.id, zigbee2MqttAdapter.protocol, 'healthy');
        pipeAdapterToEventBus(zigbee2MqttAdapter, eventBus);
        registerCommandCapableAdapter(zigbee2MqttAdapter);
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        setState(zigbee2MqttAdapter.id, zigbee2MqttAdapter.protocol, 'failed', message);
        console.error('[Adapters] Failed to start Zigbee2MQTTProtocolAdapter:', err);
      });
  }

  // -------------------------------------------------------------------------
  // Matter/Thread (WebSocket controller — telemetry + SET_HEAT_PUMP_MODE writes)
  // Enable via env: MATTER_BRIDGE_HOST=matter.local
  // -------------------------------------------------------------------------
  const matterAdapter = createMatterAdapterFromEnv();
  if (matterAdapter) {
    activeAdapters.push(matterAdapter);
    activeAdapterRefs.set(matterAdapter.id, matterAdapter);
    recordAdapterRegistration(matterAdapter.id, matterAdapter.protocol);
    setState(matterAdapter.id, matterAdapter.protocol, 'starting');

    matterAdapter
      .connect()
      .then(() => {
        setState(matterAdapter.id, matterAdapter.protocol, 'healthy');
        pipeAdapterToEventBus(matterAdapter, eventBus);
        registerCommandCapableAdapter(matterAdapter);
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        setState(matterAdapter.id, matterAdapter.protocol, 'failed', message);
        console.error('[Adapters] Failed to start MatterProtocolAdapter:', err);
      });
  }

  // -------------------------------------------------------------------------
  // OCPP 2.1 CSMS Gateway (WebSocket server for charge points)
  // Enable via env: OCPP_CSMS_PORT=9000
  // -------------------------------------------------------------------------
  const ocppCsmsAdapter = createOcppCsmsAdapterFromEnv();
  if (ocppCsmsAdapter) {
    activeAdapters.push(ocppCsmsAdapter);
    activeAdapterRefs.set(ocppCsmsAdapter.id, ocppCsmsAdapter);
    recordAdapterRegistration(ocppCsmsAdapter.id, ocppCsmsAdapter.protocol);
    setState(ocppCsmsAdapter.id, ocppCsmsAdapter.protocol, 'starting');

    ocppCsmsAdapter
      .connect()
      .then(() => {
        registerCommandCapableAdapter(ocppCsmsAdapter);
        setState(ocppCsmsAdapter.id, ocppCsmsAdapter.protocol, 'healthy');
        pipeAdapterToEventBus(ocppCsmsAdapter, eventBus);
      })
      .catch((err: unknown) => {
        unregisterCommandCapableAdapter(ocppCsmsAdapter);
        const message = err instanceof Error ? err.message : String(err);
        setState(ocppCsmsAdapter.id, ocppCsmsAdapter.protocol, 'failed', message);
        console.error('[Adapters] Failed to start OcppCsmsProtocolAdapter:', err);
      });
  }

  console.log(`[Adapters] Started ${activeAdapters.length} adapter(s).`);
  startAdapterMetricsRefresh();
}

/**
 * Periodically refresh adapter health snapshots into Prometheus gauges.
 */
function startAdapterMetricsRefresh(): void {
  if (metricsRefreshTimer !== null) return;

  metricsRefreshTimer = setInterval(() => {
    publishAllAdapterMetrics();
    for (const [id, adapter] of activeAdapterRefs) {
      adapter
        .healthCheck()
        .then((health) => {
          recordAdapterHealthSnapshot(id, adapter.protocol, {
            status: health.status,
            ...(health.lastSuccessMs !== undefined ? { lastSuccessMs: health.lastSuccessMs } : {}),
            ...(health.consecutiveErrors !== undefined
              ? { consecutiveErrors: health.consecutiveErrors }
              : {}),
          });
        })
        .catch(() => {
          recordAdapterConnection(id, adapter.protocol, 'failed');
        });
    }
  }, 15_000);

  if (typeof metricsRefreshTimer === 'object' && 'unref' in metricsRefreshTimer) {
    metricsRefreshTimer.unref();
  }
}

function stopAdapterMetricsRefresh(): void {
  if (metricsRefreshTimer !== null) {
    clearInterval(metricsRefreshTimer);
    metricsRefreshTimer = null;
  }
}

/**
 * Gracefully disconnect all active adapters.
 * Called on SIGTERM / SIGINT.
 */
export async function stopProtocolAdapters(): Promise<void> {
  stopAdapterMetricsRefresh();
  for (const adapter of activeAdapters) {
    unregisterCommandCapableAdapter(adapter);
  }
  clearProtocolCommandHandlers();
  await Promise.allSettled(activeAdapters.map((a) => a.disconnect()));
  for (const adapter of activeAdapters) {
    setState(adapter.id, adapter.protocol, 'stopped');
  }
  activeAdapters.length = 0;
  activeAdapterRefs.clear();
}

/**
 * Pipe the async data stream from an adapter into the EventBus.
 * Runs in the background — errors are logged but do not crash the server.
 */
function pipeAdapterToEventBus(adapter: IProtocolAdapter, eventBus: EventBus): void {
  (async () => {
    for await (const datapoint of adapter.getDataStream()) {
      recordAdapterDatapoint(adapter.id, adapter.protocol);
      eventBus.emit(datapoint);
    }
  })().catch((err: unknown) => {
    console.error('[Adapters] Data stream error for adapter:', adapter.id, err);
    recordAdapterConnection(adapter.id, adapter.protocol, 'failed');
  });
}

/**
 * Return the current run-state snapshot for all configured adapters.
 */
export function getAdapterRunStates(): AdapterRunState[] {
  return Array.from(adapterStates.values());
}

export interface AdapterHealthSummary {
  mode: string;
  overall: 'healthy' | 'degraded' | 'unhealthy';
  adapters: AdapterRunState[];
}

/**
 * Pure health computation from a mode string and adapter states.
 *
 * - mock mode         → healthy (no hardware expected)
 * - live mode, no adapters configured → unhealthy (silent degradation)
 * - any failed adapter → unhealthy
 * - all healthy        → healthy
 */
export function computeAdapterHealth(
  mode: string,
  adapters: AdapterRunState[],
): AdapterHealthSummary {
  if (mode === 'mock') {
    return { mode, overall: 'healthy', adapters };
  }

  if (adapters.length === 0) {
    return { mode, overall: 'unhealthy', adapters };
  }

  const failed = adapters.some((a) => a.status === 'failed');
  if (failed) {
    return { mode, overall: 'unhealthy', adapters };
  }

  const allHealthy = adapters.every((a) => a.status === 'healthy');
  return { mode, overall: allHealthy ? 'healthy' : 'degraded', adapters };
}

/**
 * Compute overall health from configured adapter states and the current env.
 */
export function getAdapterHealthSummary(): AdapterHealthSummary {
  const mode = getEffectiveAdapterMode();
  const adapters = getAdapterRunStates();
  return computeAdapterHealth(mode, adapters);
}
