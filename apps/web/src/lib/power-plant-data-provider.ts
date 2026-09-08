import {
  generatingUnits,
  plantMetrics,
  powerPlant,
  powerPlantAlarms,
  powerPlantDevices,
  powerPlantMeasurementPoints,
  trendData,
} from './power-plant-data';

export type PlantDataMode = 'local' | 'backend';

export interface PowerPlantSnapshot {
  plant: typeof powerPlant;
  units: typeof generatingUnits;
  metrics: typeof plantMetrics;
  alarms: typeof powerPlantAlarms;
  devices: typeof powerPlantDevices;
  measurementPoints: typeof powerPlantMeasurementPoints;
  trend: typeof trendData;
  source: PlantDataMode;
  updatedAt: string;
}

export interface PowerPlantDataProvider {
  readonly mode: PlantDataMode;
  getSnapshot(signal?: AbortSignal): Promise<PowerPlantSnapshot>;
  health(signal?: AbortSignal): Promise<boolean>;
}

const modeKey = 'zhidian-power-plant-data-mode';
const urlKey = 'zhidian-power-plant-api-url';

export function getPlantDataMode(): PlantDataMode {
  if (typeof window === 'undefined') return 'local';
  const stored = window.localStorage.getItem(modeKey);
  // The FastAPI adapter is the default development source. If it is stopped,
  // loadPowerPlantSnapshot still falls back to the bundled local snapshot.
  return stored === 'local' ? 'local' : 'backend';
}

export function setPlantDataMode(mode: PlantDataMode): void {
  window.localStorage.setItem(modeKey, mode);
}

export function getPlantDataApiUrl(): string {
  if (typeof window !== 'undefined') {
    const stored = window.localStorage.getItem(urlKey);
    if (stored?.trim()) return stored.trim().replace(/\/$/, '');
  }
  return (import.meta.env.VITE_POWER_PLANT_API_URL as string | undefined)?.replace(/\/$/, '') ?? '';
}

export function setPlantDataApiUrl(url: string): void {
  window.localStorage.setItem(urlKey, url.trim().replace(/\/$/, ''));
}

function localSnapshot(): PowerPlantSnapshot {
  return {
    plant: powerPlant,
    units: generatingUnits,
    metrics: plantMetrics,
    alarms: powerPlantAlarms,
    devices: powerPlantDevices,
    measurementPoints: powerPlantMeasurementPoints,
    trend: trendData,
    source: 'local',
    updatedAt: new Date().toISOString(),
  };
}

class LocalDataProvider implements PowerPlantDataProvider {
  readonly mode = 'local' as const;

  async getSnapshot(): Promise<PowerPlantSnapshot> {
    return localSnapshot();
  }

  async health(): Promise<boolean> {
    return true;
  }
}

class BackendDataProvider implements PowerPlantDataProvider {
  readonly mode = 'backend' as const;

  async getSnapshot(signal?: AbortSignal): Promise<PowerPlantSnapshot> {
    const init: RequestInit = { headers: { Accept: 'application/json' } };
    if (signal) init.signal = signal;
    const response = await fetch(`${getPlantDataApiUrl()}/api/plant/overview`, init);
    if (!response.ok) throw new Error(`电厂数据接口响应异常（${response.status}）`);
    const payload = (await response.json()) as Omit<PowerPlantSnapshot, 'source' | 'updatedAt'>;
    return { ...payload, source: 'backend', updatedAt: new Date().toISOString() };
  }

  async health(signal?: AbortSignal): Promise<boolean> {
    try {
      const init: RequestInit = {};
      if (signal) init.signal = signal;
      const response = await fetch(`${getPlantDataApiUrl()}/api/plant/health`, init);
      return response.ok;
    } catch {
      return false;
    }
  }
}

export function createPowerPlantDataProvider(mode = getPlantDataMode()): PowerPlantDataProvider {
  return mode === 'backend'
    ? new BackendDataProvider()
    : new LocalDataProvider();
}

export async function loadPowerPlantSnapshot(signal?: AbortSignal): Promise<PowerPlantSnapshot> {
  const provider = createPowerPlantDataProvider();
  try {
    return await provider.getSnapshot(signal);
  } catch {
    return localSnapshot();
  }
}
