/**
 * EnergyRouterService — Day-Ahead price-aware LP optimizer.
 *
 * Fetches hourly aWATTar DE market prices every 60 minutes,
 * then runs a 5-minute optimization cycle to decide whether to:
 *   - FORCE_CHARGE (grid price in lower quartile AND battery SoC < 50%)
 *   - MAXIMIZE_SELF_CONSUMPTION (PV surplus AND battery low)
 *   - DISCHARGE_PEAK_SHAVING (grid price in upper quartile AND battery high)
 *   - HOLD (no action needed)
 *
 * All decisions are logged to the audit trail regardless of action.
 * In Phase 3 (Read-Only), no Modbus write commands are sent.
 *
 * Environment:
 *   AWATTAR_BASE_URL  (default: https://api.awattar.de/v1)
 */

import type { UnifiedEnergyDatapoint } from '@nexus-hems/shared-types';
import type { EventBus } from '../core/EventBus.js';
import { writeAuditEntry } from '../data/audit-log.js';

const AWATTAR_BASE_URL = process.env.AWATTAR_BASE_URL ?? 'https://api.awattar.de/v1';

const PRICE_REFRESH_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
const OPTIMIZATION_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_GRID_CHARGE_W = 4_200; // §14a EnWG residential cap

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface HourlyPrice {
  startTimestamp: number;
  endTimestamp: number;
  priceEurKwh: number;
}

type RouterAction =
  | 'FORCE_CHARGE'
  | 'MAXIMIZE_SELF_CONSUMPTION'
  | 'DISCHARGE_PEAK_SHAVING'
  | 'HOLD';

interface OptimizationResult {
  action: RouterAction;
  reason: string;
  priceEurKwh: number;
  socPercent: number;
  pvPowerW: number;
  lowerQuartileEurKwh: number;
  upperQuartileEurKwh: number;
}

// ---------------------------------------------------------------------------
// EnergyRouterService
// ---------------------------------------------------------------------------

export class EnergyRouterService {
  private readonly eventBus: EventBus;
  private cachedPrices: HourlyPrice[] = [];
  private priceRefreshTimer: ReturnType<typeof setInterval> | null = null;
  private optimizationTimer: ReturnType<typeof setInterval> | null = null;

  // Latest values from EventBus (updated on each batch)
  private lastSocPercent = 50;
  private lastPvPowerW = 0;
  private lastHouseLoadW = 0;

  constructor(eventBus: EventBus) {
    this.eventBus = eventBus;
  }

  async start(): Promise<void> {
    // Listen to EventBus batches to keep real-time values updated
    this.eventBus.subscribe('energy-router', {
      onBatch: (datapoints: UnifiedEnergyDatapoint[]) => {
        for (const dp of datapoints) {
          if (dp.metric === 'SOC_PERCENT') this.lastSocPercent = dp.value;
          if (dp.metric === 'POWER_W' && dp.protocol === 'victron-mqtt') {
            // Use latest PV power from Victron (heuristic)
            this.lastPvPowerW = Math.max(0, dp.value);
          }
        }
      },
    });

    // Initial price fetch
    await this.fetchAndCachePrices();

    // Run optimization once on startup
    this.runOptimizationCycle();

    // Schedule recurring jobs
    this.priceRefreshTimer = setInterval(() => {
      this.fetchAndCachePrices().catch((err: unknown) => {
        console.warn('[EnergyRouter] Price refresh failed:', err);
      });
    }, PRICE_REFRESH_INTERVAL_MS);

    this.optimizationTimer = setInterval(() => {
      this.runOptimizationCycle();
    }, OPTIMIZATION_INTERVAL_MS);

    console.log('[EnergyRouter] Started. Optimization loop active.');
  }

  stop(): void {
    if (this.priceRefreshTimer !== null) {
      clearInterval(this.priceRefreshTimer);
      this.priceRefreshTimer = null;
    }
    if (this.optimizationTimer !== null) {
      clearInterval(this.optimizationTimer);
      this.optimizationTimer = null;
    }
    this.eventBus.unsubscribe('energy-router');
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  private async fetchAndCachePrices(): Promise<void> {
    try {
      const url = `${AWATTAR_BASE_URL}/marketdata`;
      const response = await fetch(url, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(15_000),
      });

      if (!response.ok) {
        throw new Error(`aWATTar API returned ${response.status}`);
      }

      const json = (await response.json()) as {
        data: Array<{
          start_timestamp: number;
          end_timestamp: number;
          marketprice: number;
        }>;
      };

      this.cachedPrices = json.data.map((item) => ({
        startTimestamp: item.start_timestamp,
        endTimestamp: item.end_timestamp,
        // ct/MWh → €/kWh: divide by 10 000
        priceEurKwh: item.marketprice / 10_000,
      }));

      console.log(`[EnergyRouter] Fetched ${this.cachedPrices.length} price slots from aWATTar DE`);
    } catch (err) {
      console.warn('[EnergyRouter] Price fetch failed:', err);
    }
  }

  private runOptimizationCycle(): void {
    if (this.cachedPrices.length === 0) {
      console.debug('[EnergyRouter] No cached prices yet — skipping optimization cycle.');
      return;
    }

    const result = this.optimize();
    this.logDecision(result);
  }

  private optimize(): OptimizationResult {
    const now = Date.now();
    const currentSlot = this.cachedPrices.find(
      (p) => p.startTimestamp <= now && p.endTimestamp > now,
    );
    const currentPrice = currentSlot?.priceEurKwh ?? 0;

    // Compute lower and upper quartiles
    const sorted = [...this.cachedPrices].map((p) => p.priceEurKwh).sort((a, b) => a - b);
    const lowerQuartile = sorted[Math.floor(sorted.length * 0.25)] ?? 0;
    const upperQuartile = sorted[Math.floor(sorted.length * 0.75)] ?? Infinity;

    const isCheap = currentPrice <= lowerQuartile;
    const isExpensive = currentPrice >= upperQuartile;
    const batteryLow = this.lastSocPercent < 50;
    const batteryHigh = this.lastSocPercent > 80;
    const pvSurplus = this.lastPvPowerW > this.lastHouseLoadW * 1.1;

    let action: RouterAction = 'HOLD';
    let reason = 'No favorable conditions for action';

    if (isCheap && batteryLow) {
      action = 'FORCE_CHARGE';
      reason = `cheap_price_low_soc: price=${currentPrice.toFixed(4)}€/kWh <= quartile=${lowerQuartile.toFixed(4)}, SoC=${this.lastSocPercent.toFixed(1)}%`;
    } else if (pvSurplus && batteryLow) {
      action = 'MAXIMIZE_SELF_CONSUMPTION';
      reason = `pv_surplus_low_soc: pvPower=${this.lastPvPowerW}W, SoC=${this.lastSocPercent.toFixed(1)}%`;
    } else if (isExpensive && batteryHigh) {
      action = 'DISCHARGE_PEAK_SHAVING';
      reason = `expensive_price_high_soc: price=${currentPrice.toFixed(4)}€/kWh >= quartile=${upperQuartile.toFixed(4)}, SoC=${this.lastSocPercent.toFixed(1)}%`;
    }

    if (action === 'FORCE_CHARGE') {
      const safeChargeW = Math.min(MAX_GRID_CHARGE_W, 5000);
      console.log(
        `[EnergyRouter] FORCE_CHARGE recommended: ${safeChargeW}W (§14a cap: ${MAX_GRID_CHARGE_W}W)`,
      );
    }

    return {
      action,
      reason,
      priceEurKwh: currentPrice,
      socPercent: this.lastSocPercent,
      pvPowerW: this.lastPvPowerW,
      lowerQuartileEurKwh: lowerQuartile,
      upperQuartileEurKwh: upperQuartile,
    };
  }

  private logDecision(result: OptimizationResult): void {
    writeAuditEntry({
      ts: Date.now(),
      action: result.action,
      reason: result.reason,
      priceEurKwh: result.priceEurKwh,
      socPercent: result.socPercent,
      pvPowerW: result.pvPowerW,
      inverterLimitW: MAX_GRID_CHARGE_W,
    });

    if (result.action !== 'HOLD') {
      console.log(`[EnergyRouter] Decision: ${result.action} — ${result.reason}`);
    }
  }
}
