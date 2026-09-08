/**
 * evcc Backend Integration Adapter
 *
 * Integrates with evcc (https://evcc.io) as a high-performance Go-based backend.
 * evcc natively supports 95%+ of inverters, wallboxes, meters, and batteries,
 * making it the ideal backend for real-time hardware control.
 *
 * Communication: REST API + WebSocket for real-time updates
 * Reference: https://docs.evcc.io/docs/reference/api
 */

import { BaseAdapter } from './BaseAdapter';
import type {
  AdapterCapability,
  AdapterCommand,
  AdapterConnectionConfig,
  UnifiedEnergyModel,
} from './EnergyAdapter';

// ─── evcc API Types ──────────────────────────────────────────────────

/** evcc /api/state response (subset) */
interface EvccState {
  result: {
    // Grid
    gridPower: number;
    gridCurrents: number[];
    gridEnergy: number;

    // PV
    pvPower: number;
    pvEnergy: number;

    // Battery
    batteryPower: number;
    batterySoc: number;
    batteryCapacity: number;
    batteryEnergy: number;

    // Home
    homePower: number;

    // Tariff
    tariffGrid: number;
    tariffFeedIn: number;
    tariffEffectivePrice: number;
    tariffCo2: number;

    // Site metadata
    siteTitle: string;
    currency: string;
    savingsTotalAmount: number;

    // Loadpoints (chargers)
    loadpoints: EvccLoadpoint[];

    // Vehicle
    vehicles: Record<string, EvccVehicle>;

    // Statistics
    statistics: {
      total: { avgPrice: number; avgCo2: number; chargedKWh: number; solarPercentage: number };
      thisYear: { avgPrice: number; avgCo2: number; chargedKWh: number; solarPercentage: number };
      '30d': { avgPrice: number; avgCo2: number; chargedKWh: number; solarPercentage: number };
    };
  };
}

interface EvccLoadpoint {
  title: string;
  mode: 'off' | 'now' | 'minpv' | 'pv';
  charging: boolean;
  connected: boolean;
  enabled: boolean;
  chargePower: number;
  chargedEnergy: number;
  chargeDuration: number;
  vehicleSoc: number;
  vehicleRange: number;
  vehicleName: string;
  chargerFeatureIntegratedDevice: boolean;
  chargerFeatureHeating: boolean;
  phasesActive: number;
  phasesEnabled: number;
  maxCurrent: number;
  minCurrent: number;
  targetSoc: number;
  planActive: boolean;
  planProjectedStart: string;
  effectivePlanTime: string;
  smartCostActive: boolean;
  smartCostLimit: number;
  limitEnergy: number;
  limitSoc: number;
}

interface EvccVehicle {
  title: string;
  minSoc: number;
  limitSoc: number;
  soc: number;
  range: number;
}

// ─── Adapter Implementation ──────────────────────────────────────────

/** Extended evcc statistics */
export interface EvccStatistics {
  totalCharged: { avgPrice: number; avgCo2: number; chargedKWh: number; solarPercentage: number };
  thisYear: { avgPrice: number; avgCo2: number; chargedKWh: number; solarPercentage: number };
  last30d: { avgPrice: number; avgCo2: number; chargedKWh: number; solarPercentage: number };
  savingsTotalAmount: number;
  currency: string;
}

/** evcc tariff rates (grid, feedin, co2) */
export interface EvccTariffRates {
  grid: number;
  feedIn: number;
  effectivePrice: number;
  co2: number;
}

export class EvccAdapter extends BaseAdapter {
  readonly id = 'evcc';
  readonly name = 'evcc Backend';
  readonly capabilities: AdapterCapability[] = [
    'pv',
    'battery',
    'grid',
    'load',
    'evCharger',
    'tariff',
  ];

  private baseUrl = '';
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private ws: WebSocket | null = null;
  private statistics: EvccStatistics | null = null;
  private tariffRates: EvccTariffRates | null = null;
  private loadpointCount = 1;

  constructor(config?: Partial<AdapterConnectionConfig>) {
    super({
      name: 'evcc Backend',
      host: config?.host ?? 'localhost',
      port: config?.port ?? 7070,
      tls: config?.tls ?? false,
      ...config,
    });
    const host = config?.host ?? 'localhost';
    const port = config?.port ?? 7070;
    const protocol = config?.tls ? 'https' : 'http';
    this.baseUrl = `${protocol}://${host}:${port}`;
  }

  protected async _connect(): Promise<void> {
    this.setStatus('connecting');
    // Verify evcc is reachable
    const health = await this.fetchApi('/api/health');
    if (!health?.ok) {
      throw new Error('evcc backend not reachable');
    }

    // Initial state fetch
    await this.pollState();

    // Set up WebSocket for real-time updates
    this.connectWebSocket();

    // Fallback polling every 3s
    const interval = this.config?.pollIntervalMs ?? 3000;
    this.pollTimer = setInterval(() => this.pollState(), interval);

    this.setStatus('connected');
  }

  protected async _disconnect(): Promise<void> {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    if (this.ws) {
      this.ws.close(1000, 'disconnect');
      this.ws = null;
    }
  }

  protected async _sendCommand(command: AdapterCommand): Promise<boolean> {
    switch (command.type) {
      case 'SET_EV_CURRENT': {
        const lp = Number(command.targetDeviceId ?? 1);
        await this.postApi(`/api/loadpoints/${lp}/maxcurrent/${command.value}`);
        return true;
      }
      case 'START_CHARGING': {
        const lp = Number(command.targetDeviceId ?? 1);
        await this.postApi(`/api/loadpoints/${lp}/mode/now`);
        return true;
      }
      case 'STOP_CHARGING': {
        const lp = Number(command.targetDeviceId ?? 1);
        await this.postApi(`/api/loadpoints/${lp}/mode/off`);
        return true;
      }
      case 'SET_BATTERY_MODE': {
        const mode = String(command.value);
        if (mode === 'charge') {
          await this.postApi('/api/batterygridchargeactive/true');
        } else {
          await this.postApi('/api/batterygridchargeactive/false');
        }
        return true;
      }
      case 'SET_BATTERY_POWER': {
        await this.postApi(`/api/batterydischargecontrol/${Number(command.value) < 0}`);
        return true;
      }
      case 'SET_HEAT_PUMP_MODE': {
        const lpId = Number(command.targetDeviceId ?? 1);
        const modes: Record<string, string> = { '1': 'off', '2': 'pv', '3': 'minpv', '4': 'now' };
        await this.postApi(`/api/loadpoints/${lpId}/mode/${modes[String(command.value)] ?? 'pv'}`);
        return true;
      }
      case 'SET_EV_MODE': {
        // Direct evcc mode control: off | now | minpv | pv
        const lp = Number(command.targetDeviceId ?? 1);
        const modeStr = String(command.value);
        if (['off', 'now', 'minpv', 'pv'].includes(modeStr)) {
          await this.postApi(`/api/loadpoints/${lp}/mode/${modeStr}`);
        }
        return true;
      }
      case 'SET_EV_TARGET_SOC': {
        const lp = Number(command.targetDeviceId ?? 1);
        await this.postApi(`/api/loadpoints/${lp}/limitsoc/${command.value}`);
        return true;
      }
      case 'SET_EV_PHASES': {
        const lp = Number(command.targetDeviceId ?? 1);
        const phases = Number(command.value) === 3 ? 3 : 1;
        await this.postApi(`/api/loadpoints/${lp}/phases/${phases}`);
        return true;
      }
      case 'SET_EV_MIN_CURRENT': {
        const lp = Number(command.targetDeviceId ?? 1);
        await this.postApi(`/api/loadpoints/${lp}/mincurrent/${command.value}`);
        return true;
      }
      case 'SET_SMART_COST_LIMIT': {
        const lp = Number(command.targetDeviceId ?? 1);
        await this.postApi(`/api/loadpoints/${lp}/smartcostlimit/${command.value}`);
        return true;
      }
      default:
        return false;
    }
  }

  protected _cleanup(): void {
    this.statistics = null;
    this.tariffRates = null;
  }

  getSnapshot(): Partial<UnifiedEnergyModel> {
    return this.snapshot;
  }

  /** Get accumulated evcc statistics */
  getStatistics(): EvccStatistics | null {
    return this.statistics;
  }

  /** Get current tariff rates */
  getTariffRates(): EvccTariffRates | null {
    return this.tariffRates;
  }

  /** Get the number of loadpoints in evcc */
  getLoadpointCount(): number {
    return this.loadpointCount;
  }

  /** Fetch evcc tariff plans (grid, feedin, planner) */
  async fetchTariffPlan(
    type: 'grid' | 'feedin' | 'planner',
  ): Promise<Array<{ start: string; end: string; price: number }>> {
    try {
      const response = await this.fetchApi(`/api/tariff/${type}`);
      if (!response.ok) return [];
      const data = await response.json();
      return data?.result?.rates ?? [];
    } catch {
      return [];
    }
  }

  // ─── Private Helpers ─────────────────────────────────────────────

  private async fetchApi(path: string): Promise<Response> {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (this.config?.authToken) {
      headers.Authorization = `Bearer ${this.config.authToken}`;
    }
    return fetch(`${this.baseUrl}${path}`, { headers, signal: AbortSignal.timeout(10000) });
  }

  private async postApi(path: string): Promise<Response> {
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    };
    if (this.config?.authToken) {
      headers.Authorization = `Bearer ${this.config.authToken}`;
    }
    return fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers,
      signal: AbortSignal.timeout(10000),
    });
  }

  private connectWebSocket(): void {
    try {
      const wsProtocol = this.config?.tls ? 'wss' : 'ws';
      const host = this.config?.host ?? 'localhost';
      const port = this.config?.port ?? 7070;
      this.ws = new WebSocket(`${wsProtocol}://${host}:${port}/ws`);

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(String(event.data));
          if (data?.result) {
            this.snapshot = this.mapEvccState(data as EvccState);
            this.emitData(this.snapshot);
          }
        } catch {
          // Ignore malformed WS messages
        }
      };

      this.ws.onerror = () => {
        // Close broken connection and rely on polling fallback
        if (this.ws) {
          this.ws.close();
          this.ws = null;
        }
      };

      this.ws.onclose = () => {
        this.ws = null;
      };
    } catch {
      // WebSocket not supported/available, rely on polling
    }
  }

  private async pollState(): Promise<void> {
    try {
      const response = await this.fetchApi('/api/state');
      if (!response.ok) return;
      const state: EvccState = await response.json();
      this.snapshot = this.mapEvccState(state);
      this.emitData(this.snapshot);
    } catch {
      // Will retry on next poll
    }
  }

  private mapEvccState(state: EvccState): Partial<UnifiedEnergyModel> {
    const r = state.result;
    const lps = r.loadpoints ?? [];
    this.loadpointCount = lps.length;
    const lp = lps[0];

    // Extract statistics
    if (r.statistics) {
      this.statistics = {
        totalCharged: r.statistics.total,
        thisYear: r.statistics.thisYear,
        last30d: r.statistics['30d'],
        savingsTotalAmount: r.savingsTotalAmount ?? 0,
        currency: r.currency ?? 'EUR',
      };
    }

    // Extract tariff rates
    this.tariffRates = {
      grid: r.tariffGrid ?? 0,
      feedIn: r.tariffFeedIn ?? 0,
      effectivePrice: r.tariffEffectivePrice ?? 0,
      co2: r.tariffCo2 ?? 0,
    };

    // Sum all loadpoints for total EV power
    const totalEvPower = lps.reduce((sum, l) => sum + (l.chargePower ?? 0), 0);

    const model: Partial<UnifiedEnergyModel> = {
      timestamp: Date.now(),
      pv: {
        totalPowerW: r.pvPower ?? 0,
        yieldTodayKWh: (r.pvEnergy ?? 0) / 1000,
      },
      battery: {
        powerW: r.batteryPower ?? 0,
        socPercent: r.batterySoc ?? 0,
        voltageV: 0,
        currentA: 0,
      },
      grid: {
        powerW: r.gridPower ?? 0,
        voltageV: 230,
        frequencyHz: 50,
        energyImportKWh: (r.gridEnergy ?? 0) / 1000,
        phases: r.gridCurrents?.map((c: number) => ({
          voltageV: 230,
          currentA: c,
          powerW: c * 230,
        })),
      },
      load: {
        totalPowerW: r.homePower ?? 0,
        heatPumpPowerW: 0,
        evPowerW: totalEvPower,
        otherPowerW: (r.homePower ?? 0) - totalEvPower,
      },
      tariff: {
        currentPriceEurKWh: r.tariffGrid ?? 0,
        provider: 'tibber',
      },
    };

    if (lp) {
      model.evCharger = {
        status: lp.charging ? 'charging' : lp.connected ? 'preparing' : 'available',
        powerW: lp.chargePower ?? 0,
        energySessionKWh: (lp.chargedEnergy ?? 0) / 1000,
        socPercent: lp.vehicleSoc,
        currentA: lp.maxCurrent,
        voltageV: 230,
        maxCurrentA: lp.maxCurrent,
        vehicleConnected: lp.connected,
        v2xCapable: false,
        v2xActive: false,
      };
    }

    return model;
  }
}
