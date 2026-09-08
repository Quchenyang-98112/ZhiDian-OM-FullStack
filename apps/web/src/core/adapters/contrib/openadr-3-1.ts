/**
 * OpenADR31Adapter — OpenADR 3.1.0 VEN-client Contrib Adapter
 *
 * Implements an OpenADR 3.1.0 Virtual End Node (VEN) client that receives
 * demand-response (DR) events from a Virtual Top Node (VTN) and translates
 * them into HEMS actions.
 *
 * Architecture:
 *   VTN (Utility/Aggregator) → OAuth2 API Proxy (apps/api) → This Adapter
 *
 * All VTN communication is proxied through `/api/openadr/*` to prevent
 * SSRF and keep credentials server-side.
 *
 * Supported OpenADR 3.1.0 Event Types:
 *   LOAD_CONTROL      — §14a EnWG demand curtailment (evMaxPowerW, hvacMaxPowerW)
 *   SIMPLE            — Simple DR signal 0–4 (maps to SG Ready states)
 *   ELECTRICITY_PRICE — Dynamic tariff override for MPC optimizer
 *   CARBON_REDUCTION  — Self-consumption boost signal
 *
 * References:
 *   - OpenADR 3.1.0 Specification (2024-11)
 *   - docs/OpenADR-Integration-Guide.md
 *   - docs/adr/ADR-012-openadr-ven-client.md
 */

import { dispatchOpenADRAggregateState } from '../../openadr-hardware-dispatch';
import { registerAdapter } from '../adapter-registry';
import { BaseAdapter } from '../BaseAdapter';
import type {
  AdapterCapability,
  AdapterCommand,
  AdapterConnectionConfig,
  TariffData,
  UnifiedEnergyModel,
} from '../EnergyAdapter';

// ─── OpenADR 3.1.0 Data Models ──────────────────────────────────────

/** OpenADR 3.1.0 event types supported by this adapter */
export type OpenADREventType = 'LOAD_CONTROL' | 'SIMPLE' | 'ELECTRICITY_PRICE' | 'CARBON_REDUCTION';

/** ValuesMap: a typed key→values pair from OpenADR payloads */
interface ValuesMap {
  type: string;
  values: (number | string | boolean)[];
}

/** OpenADR 3.1.0 IntervalPeriod (ISO 8601) */
interface IntervalPeriod {
  start: string; // ISO 8601 datetime
  duration: string; // ISO 8601 duration (e.g. "PT15M")
  randomizeStart?: string; // ISO 8601 duration
}

/** OpenADR 3.1.0 Interval within an event */
interface OpenADRInterval {
  id: number;
  intervalPeriod?: IntervalPeriod;
  payloads: ValuesMap[];
}

/** OpenADR 3.1.0 PayloadDescriptor */
interface PayloadDescriptor {
  payloadType: string;
  objectType?: string;
  units?: string;
  currency?: string;
}

/** OpenADR 3.1.0 Event object */
export interface OpenADREvent {
  id: string;
  eventName: string;
  priority?: number;
  programID: string;
  targets?: ValuesMap[];
  reportDescriptors?: unknown[];
  payloadDescriptors?: PayloadDescriptor[];
  intervalPeriod?: IntervalPeriod;
  intervals: OpenADRInterval[];
  createdDateTime?: string;
  modificationDateTime?: string;
}

/** Processed, adapter-internal DR event with computed activation windows */
export interface ActiveDREvent {
  raw: OpenADREvent;
  eventType: OpenADREventType;
  /** Unix ms start of earliest active interval */
  activeFrom: number;
  /** Unix ms end of latest active interval */
  activeTo: number;
  /** For ELECTRICITY_PRICE: price in EUR/kWh */
  priceEurKWh?: number;
  /** For LOAD_CONTROL: EV max power limit in W */
  evMaxPowerW?: number;
  /** For LOAD_CONTROL: HVAC max power limit in W */
  hvacMaxPowerW?: number;
  /** For SIMPLE: DR level 0–4 */
  simpleLevel?: number;
  acknowledged: boolean;
}

interface DRAggregateFold {
  lowestPrice: number | null;
  highestPriority: number;
  evDisabled: boolean;
  sgReady: 1 | 2 | 3 | 4 | undefined;
  evMaxPowerW: number | undefined;
  hvacMaxPowerW: number | undefined;
}

function applyPriceEvent(fold: DRAggregateFold, event: ActiveDREvent): void {
  if (event.eventType !== 'ELECTRICITY_PRICE' || event.priceEurKWh === undefined) return;
  const priority = event.raw.priority ?? 0;
  if (priority >= fold.highestPriority) {
    fold.lowestPrice = event.priceEurKWh;
    fold.highestPriority = priority;
  }
}

function applyLoadControlEvent(fold: DRAggregateFold, event: ActiveDREvent): void {
  if (event.eventType !== 'LOAD_CONTROL') return;
  if ((event.evMaxPowerW ?? Infinity) <= 0) {
    fold.evDisabled = true;
  }
  if (event.evMaxPowerW !== undefined) {
    fold.evMaxPowerW =
      fold.evMaxPowerW === undefined
        ? event.evMaxPowerW
        : Math.min(fold.evMaxPowerW, event.evMaxPowerW);
  }
  if (event.hvacMaxPowerW !== undefined) {
    fold.hvacMaxPowerW =
      fold.hvacMaxPowerW === undefined
        ? event.hvacMaxPowerW
        : Math.min(fold.hvacMaxPowerW, event.hvacMaxPowerW);
  }
}

function applySimpleEvent(fold: DRAggregateFold, event: ActiveDREvent): void {
  if (event.eventType !== 'SIMPLE' || event.simpleLevel === undefined) return;
  fold.sgReady = Math.min(4, Math.max(1, event.simpleLevel + 1)) as 1 | 2 | 3 | 4;
}

function foldActiveDREvents(events: Iterable<ActiveDREvent>, now: number): DRAggregateFold {
  const fold: DRAggregateFold = {
    lowestPrice: null,
    highestPriority: -1,
    evDisabled: false,
    sgReady: undefined,
    evMaxPowerW: undefined,
    hvacMaxPowerW: undefined,
  };

  for (const event of events) {
    if (event.activeFrom > now || event.activeTo < now) continue;
    applyPriceEvent(fold, event);
    applyLoadControlEvent(fold, event);
    applySimpleEvent(fold, event);
  }

  return fold;
}

// ─── OAuth2 token response ───────────────────────────────────────────

interface OAuth2TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope?: string;
}

// ─── Zod-compatible runtime schema (no Zod import required) ─────────

/** Narrow-guard: is the response a valid events array? */
function isEventsArray(data: unknown): data is OpenADREvent[] {
  return (
    Array.isArray(data) &&
    data.every((e) => typeof e === 'object' && e !== null && 'id' in e && 'intervals' in e)
  );
}

function isTokenResponse(data: unknown): data is OAuth2TokenResponse {
  return (
    typeof data === 'object' &&
    data !== null &&
    'access_token' in data &&
    typeof (data as Record<string, unknown>).access_token === 'string'
  );
}

// ─── ISO 8601 duration parser (subset: PTxM, PTxH, PTxS) ────────────

function parseDurationMs(duration: string): number {
  const match = /^PT?(\d+H)?(\d+M)?(\d+S)?$/.exec(duration);
  if (!match) return 0;
  const hours = parseInt(match[1] ?? '0H', 10) || 0;
  const minutes = parseInt(match[2] ?? '0M', 10) || 0;
  const seconds = parseInt(match[3] ?? '0S', 10) || 0;
  return (hours * 3600 + minutes * 60 + seconds) * 1000;
}

// ─── Config ─────────────────────────────────────────────────────────

export interface OpenADR31Config extends Partial<AdapterConnectionConfig> {
  /**
   * VTN program identifier to subscribe to.
   * Sent to the API proxy which filters events by program.
   */
  programId?: string;
  /** Polling interval in ms (default: 5 minutes). Must be >= 60 s per OpenADR spec. */
  pollIntervalMs?: number;
  /** VEN identifier (sent in report submissions) */
  venId?: string;
  /** VEN name (human-readable) */
  venName?: string;
}

const DEFAULT_POLL_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const MIN_POLL_INTERVAL_MS = 60_000; // OpenADR 3 spec minimum

// ─── Adapter ────────────────────────────────────────────────────────

export class OpenADR31Adapter extends BaseAdapter {
  readonly id = 'openadr-3-1';
  readonly name = 'OpenADR 3.1.0 VEN Client';
  readonly capabilities: AdapterCapability[] = ['tariff'];

  private programId: string;
  private pollIntervalMs: number;
  private venId: string;
  private venName: string;

  /** Current OAuth2 bearer token from API proxy */
  private accessToken: string | null = null;
  /** Unix ms when the current token expires */
  private tokenExpiresAt = 0;

  /** Currently active DR events (keyed by event ID) */
  private activeEvents: Map<string, ActiveDREvent> = new Map();

  /** Polling timer */
  private pollTimer: ReturnType<typeof setTimeout> | null = null;

  /** Current tariff override from ELECTRICITY_PRICE events (null = use normal tariff) */
  private tariffOverride: TariffData | null = null;

  /** §14a flag: when true, EV charging must be limited */
  private evDisabledBy14a = false;

  constructor(config?: OpenADR31Config) {
    super({
      name: 'OpenADR 3.1 VEN',
      host: config?.host ?? 'localhost',
      port: config?.port ?? 3000,
      tls: config?.tls ?? false,
      reconnect: {
        enabled: true,
        initialDelayMs: 10_000,
        maxDelayMs: 60_000,
        backoffMultiplier: 2,
        ...config?.reconnect,
      },
      ...config,
    });
    this.programId = config?.programId ?? 'nexus-hems-program';
    this.pollIntervalMs = Math.max(
      config?.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS,
      MIN_POLL_INTERVAL_MS,
    );
    this.venId = config?.venId ?? 'nexus-ven-1';
    this.venName = config?.venName ?? 'Nexus HEMS VEN';
  }

  // ─── BaseAdapter abstract implementations ─────────────────────────

  protected async _connect(): Promise<void> {
    this.setStatus('connecting');
    // Fetch initial token to validate connectivity
    await this.refreshToken();
    // Initial poll
    await this.pollEvents();
    this.setStatus('connected');
    // Schedule ongoing polling
    this.schedulePoll();
  }

  protected async _disconnect(): Promise<void> {
    if (this.pollTimer !== null) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
    this.accessToken = null;
    this.tokenExpiresAt = 0;
    this.activeEvents.clear();
    this.tariffOverride = null;
    this.evDisabledBy14a = false;
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  protected async _sendCommand(command: AdapterCommand): Promise<boolean> {
    switch (command.type) {
      case 'OPENADR_ACKNOWLEDGE_EVENT': {
        const eventId = String(command.value);
        const optIn = command.payload?.optIn !== false; // default opt-in
        return this.acknowledgeEvent(eventId, optIn);
      }
      case 'OPENADR_SUBMIT_REPORT':
        return this.submitReport();
      default:
        return false;
    }
  }

  protected _cleanup(): void {
    if (this.pollTimer !== null) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
  }

  override getSnapshot(): Partial<UnifiedEnergyModel> {
    if (this.tariffOverride) {
      return { tariff: this.tariffOverride };
    }
    return {};
  }

  // ─── Public accessors (used by UC26Translator + VPP service) ──────

  /** All currently active DR events */
  getActiveEvents(): ReadonlyMap<string, ActiveDREvent> {
    return this.activeEvents;
  }

  /** True when §14a LOAD_CONTROL event requires EV charging limitation */
  isEVDisabledBy14a(): boolean {
    return this.evDisabledBy14a;
  }

  /** Current ELECTRICITY_PRICE tariff override (null = use normal tariff) */
  getTariffOverride(): TariffData | null {
    return this.tariffOverride;
  }

  // ─── OAuth2 client-credentials via API proxy ──────────────────────

  private async refreshToken(): Promise<void> {
    // Token still valid with 30s margin → skip refresh
    if (this.accessToken && Date.now() < this.tokenExpiresAt - 30_000) return;

    const resp = await fetch('/api/openadr/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ programId: this.programId }),
    });

    if (!resp.ok) {
      throw new Error(`OpenADR token refresh failed: ${resp.status} ${resp.statusText}`);
    }

    const data: unknown = await resp.json();
    if (!isTokenResponse(data)) {
      throw new Error('OpenADR token response has unexpected format');
    }

    this.accessToken = data.access_token;
    this.tokenExpiresAt = Date.now() + data.expires_in * 1000;
  }

  // ─── Event polling ────────────────────────────────────────────────

  private schedulePoll(): void {
    this.pollTimer = setTimeout(() => {
      void this.pollEvents().finally(() => {
        if (this.status === 'connected') this.schedulePoll();
      });
    }, this.pollIntervalMs);
  }

  private async pollEvents(): Promise<void> {
    await this.refreshToken();

    const resp = await fetch(
      `/api/openadr/events?programId=${encodeURIComponent(this.programId)}`,
      {
        headers: {
          Authorization: `Bearer ${this.accessToken ?? ''}`,
          Accept: 'application/json',
        },
      },
    );

    if (!resp.ok) {
      throw new Error(`OpenADR event poll failed: ${resp.status} ${resp.statusText}`);
    }

    const data: unknown = await resp.json();
    if (!isEventsArray(data)) return;

    const now = Date.now();

    // Clear expired events
    for (const [id, event] of this.activeEvents) {
      if (event.activeTo < now) this.activeEvents.delete(id);
    }

    // Process new/updated events
    for (const rawEvent of data) {
      const processed = this.processEvent(rawEvent);
      if (processed && processed.activeTo > now) {
        const isNew = !this.activeEvents.has(rawEvent.id);
        this.activeEvents.set(rawEvent.id, processed);
        if (isNew) this.applyEvent(processed);
      }
    }

    // Rebuild aggregate state from all active events
    await this.rebuildAggregateState();
    this.emitCurrentState();
  }

  // ─── Event processing ─────────────────────────────────────────────

  private processEvent(raw: OpenADREvent): ActiveDREvent | null {
    // Detect event type from payloadDescriptors
    const payloadType = raw.payloadDescriptors?.[0]?.payloadType ?? '';
    const eventType = this.detectEventType(payloadType);
    if (!eventType) return null;

    // Compute active window from intervals
    const { activeFrom, activeTo } = this.computeActiveWindow(raw);
    if (activeTo === 0) return null; // Unparsable intervals

    const processed: ActiveDREvent = {
      raw,
      eventType,
      activeFrom,
      activeTo,
      acknowledged: false,
    };

    // Extract payload values per event type
    switch (eventType) {
      case 'ELECTRICITY_PRICE': {
        const priceValue = this.extractFirstNumericValue(raw, 'PRICE');
        if (priceValue !== null) processed.priceEurKWh = priceValue;
        break;
      }
      case 'LOAD_CONTROL': {
        const evLimit = this.extractFirstNumericValue(raw, 'EV_MAX_POWER_W');
        const hvacLimit = this.extractFirstNumericValue(raw, 'HVAC_MAX_POWER_W');
        if (evLimit !== null) processed.evMaxPowerW = evLimit;
        if (hvacLimit !== null) processed.hvacMaxPowerW = hvacLimit;
        break;
      }
      case 'SIMPLE': {
        const level = this.extractFirstNumericValue(raw, 'SIMPLE');
        if (level !== null) processed.simpleLevel = Math.round(level);
        break;
      }
    }

    return processed;
  }

  private detectEventType(payloadType: string): OpenADREventType | null {
    const normalized = payloadType.toUpperCase();
    if (normalized.includes('LOAD_CONTROL') || normalized.includes('DEMAND_RESPONSE'))
      return 'LOAD_CONTROL';
    if (normalized.includes('PRICE') || normalized.includes('ELECTRICITY_PRICE'))
      return 'ELECTRICITY_PRICE';
    if (normalized.includes('SIMPLE')) return 'SIMPLE';
    if (normalized.includes('CARBON')) return 'CARBON_REDUCTION';
    return null;
  }

  private computeActiveWindow(raw: OpenADREvent): { activeFrom: number; activeTo: number } {
    let activeFrom = Number.MAX_SAFE_INTEGER;
    let activeTo = 0;

    const globalPeriod = raw.intervalPeriod;
    const globalStart = globalPeriod ? new Date(globalPeriod.start).getTime() : 0;
    const globalDuration = globalPeriod ? parseDurationMs(globalPeriod.duration) : 0;

    for (const interval of raw.intervals) {
      const period = interval.intervalPeriod ?? globalPeriod;
      if (!period) continue;

      const start = new Date(period.start).getTime() || globalStart;
      const duration = parseDurationMs(period.duration) || globalDuration;
      if (start === 0 || duration === 0) continue;

      const end = start + duration;
      if (start < activeFrom) activeFrom = start;
      if (end > activeTo) activeTo = end;
    }

    return {
      activeFrom: activeFrom === Number.MAX_SAFE_INTEGER ? 0 : activeFrom,
      activeTo,
    };
  }

  private extractFirstNumericValue(raw: OpenADREvent, type: string): number | null {
    for (const interval of raw.intervals) {
      for (const payload of interval.payloads) {
        if (payload.type.toUpperCase() === type.toUpperCase() && payload.values.length > 0) {
          const val = payload.values[0];
          if (typeof val === 'number') return val;
        }
      }
    }
    return null;
  }

  // ─── Event application ────────────────────────────────────────────

  private applyEvent(event: ActiveDREvent): void {
    switch (event.eventType) {
      case 'LOAD_CONTROL':
        // §14a EnWG: if evMaxPowerW <= 0 → EV charging fully blocked
        this.evDisabledBy14a = (event.evMaxPowerW ?? Infinity) <= 0;
        break;
      case 'ELECTRICITY_PRICE':
        if (event.priceEurKWh !== undefined) {
          this.tariffOverride = {
            currentPriceEurKWh: event.priceEurKWh,
            provider: 'entsoe', // OpenADR replaces the normal provider signal
          };
        }
        break;
      case 'SIMPLE':
        if (event.simpleLevel !== undefined) {
          // Map Simple DR levels 0–4 to SG Ready states 1–4
          const sgReady = Math.min(4, Math.max(1, event.simpleLevel + 1)) as 1 | 2 | 3 | 4;
          if (this.tariffOverride) {
            this.tariffOverride = { ...this.tariffOverride, sgReadyState: sgReady };
          } else {
            this.tariffOverride = {
              currentPriceEurKWh: 0,
              provider: 'none',
              sgReadyState: sgReady,
            };
          }
        }
        break;
    }
  }

  private async rebuildAggregateState(): Promise<void> {
    const fold = foldActiveDREvents(this.activeEvents.values(), Date.now());
    const { lowestPrice, evDisabled, sgReady, evMaxPowerW, hvacMaxPowerW } = fold;

    this.evDisabledBy14a = evDisabled;

    if (lowestPrice !== null) {
      this.tariffOverride = {
        currentPriceEurKWh: lowestPrice,
        provider: 'entsoe',
        sgReadyState: sgReady,
      };
    } else if (sgReady !== undefined) {
      this.tariffOverride = {
        currentPriceEurKWh: 0,
        provider: 'none',
        sgReadyState: sgReady,
      };
    } else {
      this.tariffOverride = null;
    }

    const aggregateEvLimit =
      evMaxPowerW !== undefined ? { evMaxPowerW } : evDisabled ? { evMaxPowerW: 0 } : {};

    await dispatchOpenADRAggregateState({
      ...(sgReady !== undefined ? { sgReady } : {}),
      ...aggregateEvLimit,
      ...(hvacMaxPowerW !== undefined ? { hvacMaxPowerW } : {}),
    });
  }

  private emitCurrentState(): void {
    const model: Partial<UnifiedEnergyModel> = {};
    if (this.tariffOverride) model.tariff = this.tariffOverride;
    this.emitData(model);
  }

  // ─── Event acknowledgment ─────────────────────────────────────────

  private acknowledgeEvent(eventId: string, optIn: boolean): boolean {
    const event = this.activeEvents.get(eventId);
    if (!event) return false;

    void this.refreshToken()
      .then(() => {
        return fetch(`/api/openadr/events/${encodeURIComponent(eventId)}/acknowledge`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.accessToken ?? ''}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            venId: this.venId,
            eventId,
            optIn,
            createdDateTime: new Date().toISOString(),
          }),
        });
      })
      .catch(() => {});

    event.acknowledged = true;
    return true;
  }

  // ─── Report submission ────────────────────────────────────────────

  private submitReport(): boolean {
    const now = new Date().toISOString();
    const resources = Array.from(this.activeEvents.values()).map((_e) => ({
      resourceName: this.venId,
      intervals: [
        {
          id: 0,
          intervalPeriod: { start: now, duration: 'PT5M' },
          payloads: this.buildReportPayloads(),
        },
      ],
    }));

    void this.refreshToken()
      .then(() => {
        return fetch('/api/openadr/reports', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.accessToken ?? ''}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            programID: this.programId,
            eventID: Array.from(this.activeEvents.keys())[0] ?? '',
            clientName: this.venName,
            createdDateTime: now,
            resources,
          }),
        });
      })
      .catch(() => {});

    return true;
  }

  private buildReportPayloads(): ValuesMap[] {
    return [
      { type: 'USAGE', values: [0] }, // Placeholder: actual usage comes from useEnergyStore
      { type: 'EV_DISABLED_14A', values: [this.evDisabledBy14a] },
    ];
  }
}

// ─── Registration ────────────────────────────────────────────────────

registerAdapter('openadr-3-1', (config) => new OpenADR31Adapter(config as OpenADR31Config));
