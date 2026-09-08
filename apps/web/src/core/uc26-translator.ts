/**
 * UC26Translator — UC 2.6 Incentive-Response / Flex-Bidding Translator
 *
 * Implements the translation layer between OpenADR 3.1.0 events and
 * Matter DEM (Device Energy Management) requests per the Matter↔OpenADR
 * Interworking Specification v1.0 (Spring 2024), UC 2.6.
 *
 * Three use cases covered:
 *   UC 2.6.1 — Energy Request (DEM clusters: Forecast Adjust, Constraints)
 *   UC 2.6.2 — Flex Bid Offer  (DEM clusters: Power Adjustment, State)
 *   UC 2.6.3 — VPP Dispatch    (DEM clusters: Pausable, Power Forecast Reporting)
 *
 * DER Bitmap mapping (ISO 15118-20 §8.3.5.3.3 / CharIN Guide 2.0):
 *   Bit 0 → DEM FA (Forecast Adjust)
 *   Bit 1 → DEM CON (Constraints)
 *   Bit 2 → DEM STA (State)
 *   Bit 3 → DEM PAU (Pausable)
 *   Bit 4 → DEM PA  (Power Adjustment)
 *   Bit 5 → DEM PFR (Power Forecast Reporting)
 *
 * References:
 *   - docs/Matter-OpenADR-Interworking-Guide.md
 *   - docs/adr/ADR-012-openadr-ven-client.md
 *   - Matter 1.3 DEM cluster spec (0x98)
 */

import type { ActiveDREvent, OpenADREventType } from './adapters/contrib/openadr-3-1';

// ─── DEM Feature flags (Matter 1.3 DEM cluster 0x98) ─────────────────

/** Matter DEM cluster feature bitmap (corresponds to DER bitmap via translation) */
export const DEMFeature = {
  /** PowerAdjustment (PA): short-term power increase/decrease */
  PA: 0x01,
  /** PowerForecastReporting (PFR): report expected power schedule */
  PFR: 0x02,
  /** StateForecast (STA): optional state-machine reporting */
  STA: 0x04,
  /** Pausable (PAU): allow device to be paused/resumed */
  PAU: 0x08,
  /** ForecastAdjustment (FA): VPP can adjust forecast schedule */
  FA: 0x10,
  /** Constraints (CON): operational constraints (deadlines, SOC) */
  CON: 0x20,
} as const;

export type DEMFeatureKey = keyof typeof DEMFeature;

// ─── DEM Energy Request (UC 2.6.1) ───────────────────────────────────

/** A DEM Energy Request slot — one 15-minute period */
export interface DEMEnergyRequestSlot {
  /** Slot start (Unix ms) */
  startMs: number;
  /** Slot end (Unix ms) */
  endMs: number;
  /** Minimum power in milliwatts (can be negative for export) */
  minPowerMw: number;
  /** Maximum power in milliwatts */
  maxPowerMw: number;
  /** Nominal power (VPP's preferred operating point) */
  nominalPowerMw: number;
  /** DEM feature that applies to this slot */
  demFeature: number;
}

/** Full DEM Energy Request (output of UC 2.6.1 translation) */
export interface DEMEnergyRequest {
  /** Source OpenADR event ID */
  openADREventId: string;
  /** Source program ID */
  programId: string;
  /** UC version (always 2.6.1) */
  ucVersion: '2.6.1';
  slots: DEMEnergyRequestSlot[];
  /** DEM features required as bitmap */
  requiredFeatures: number;
  /** Human-readable description for UI */
  description: string;
}

// ─── Flex Bid Offer (UC 2.6.2) ───────────────────────────────────────

/** A single flex bid offering for VPP market participation */
export interface FlexBidOffer {
  /** Source OpenADR event/program ID this bid responds to */
  openADREventId: string;
  /** UC version (always 2.6.2) */
  ucVersion: '2.6.2';
  /** Bid start time (Unix ms) */
  startMs: number;
  /** Bid end time (Unix ms) */
  endMs: number;
  /** Offered power adjustment (W, positive = curtailment, negative = increase) */
  offeredPowerW: number;
  /** Minimum accepted power (W) */
  minPowerW: number;
  /** Maximum available power (W) */
  maxPowerW: number;
  /** Willingness-to-pay / price floor (€/kWh, 0 = free) */
  priceFloorEurKWh: number;
  /** DEM PA feature constraints */
  demFeature: number;
}

// ─── VPP Dispatch Signal (UC 2.6.3) ──────────────────────────────────

/** VPP dispatch signal for immediate execution */
export interface VPPDispatchSignal {
  /** Source OpenADR event ID */
  openADREventId: string;
  /** UC version (always 2.6.3) */
  ucVersion: '2.6.3';
  /** Target power for this device (W) */
  targetPowerW: number;
  /** Duration (ms) */
  durationMs: number;
  /** Device type being dispatched */
  deviceType: 'battery' | 'ev' | 'heat_pump' | 'flexible_load';
  /** DEM features needed for execution */
  demFeatures: number;
  /** Urgency (higher = override other controllers) */
  urgency: 'immediate' | 'scheduled' | 'advisory';
}

// ─── DER bitmap → DEM feature mapping ────────────────────────────────

/**
 * Maps ISO 15118-20 DER Capability Bitmap bits to Matter DEM cluster features.
 * Source: Matter↔OpenADR Interworking Spec v1.0, §4.2 Table 3.
 */
function derBitmapToDEMFeatures(derBitmap: number): number {
  let features = 0;
  if (derBitmap & 0x01) features |= DEMFeature.FA; // Bit 0: Charge → Forecast Adjust
  if (derBitmap & 0x02) features |= DEMFeature.PA; // Bit 1: Discharge → Power Adjustment
  if (derBitmap & 0x04) features |= DEMFeature.PFR; // Bit 2: Reactive-Q → PFR
  if (derBitmap & 0x08) features |= DEMFeature.PAU; // Bit 3: Islanding → Pausable
  // Default: always include CON (constraints for SOC guardrails)
  features |= DEMFeature.CON;
  return features;
}

/**
 * UC26Translator class — stateless translation service.
 * Instantiate once, call the three UC 2.6.x methods as needed.
 */
export class UC26Translator {
  // ─── UC 2.6.1 — Energy Request ──────────────────────────────────

  /**
   * Translate an ELECTRICITY_PRICE OpenADR event into DEM Energy Request slots.
   * The VPP tells the HEMS "use X watts during Y period at Z price".
   * The DEM FA (Forecast Adjust) feature is used to update device schedules.
   *
   * @param event Active DR event (must be ELECTRICITY_PRICE or LOAD_CONTROL)
   * @param derBitmap DER capability bitmap from BPT negotiation (or 0x03 default)
   * @param slotDurationMs Duration per slot in ms (default 15 minutes)
   */
  translateToEnergyRequest(
    event: ActiveDREvent,
    derBitmap = 0x03,
    slotDurationMs = 15 * 60_000,
  ): DEMEnergyRequest {
    const requiredFeatures = derBitmapToDEMFeatures(derBitmap);
    const slots: DEMEnergyRequestSlot[] = [];
    const now = Date.now();

    // Compute how many slots fit in the active window
    const windowMs = event.activeTo - Math.max(event.activeFrom, now);
    const numSlots = Math.max(1, Math.ceil(windowMs / slotDurationMs));

    for (let i = 0; i < numSlots; i++) {
      const slotStart = Math.max(event.activeFrom, now) + i * slotDurationMs;
      const slotEnd = slotStart + slotDurationMs;

      let nominalPowerMw = 0;
      let minPowerMw = 0;
      let maxPowerMw = 0;

      switch (event.eventType) {
        case 'ELECTRICITY_PRICE': {
          // High price → request zero consumption (DEM FA: shape to 0)
          const priceEur = event.priceEurKWh ?? 0;
          const isHighPrice = priceEur > 0.25;
          nominalPowerMw = isHighPrice ? 0 : 7400_000; // 0W or 7.4kW nominal
          minPowerMw = 0;
          maxPowerMw = isHighPrice ? 1000_000 : 11_000_000; // 1kW or 11kW max
          break;
        }
        case 'LOAD_CONTROL': {
          const evMaxW = event.evMaxPowerW ?? 0;
          nominalPowerMw = evMaxW * 1000;
          minPowerMw = 0;
          maxPowerMw = evMaxW * 1000;
          break;
        }
        case 'CARBON_REDUCTION': {
          // Reduce consumption during high-carbon grid mix
          nominalPowerMw = 2000_000; // 2kW floor
          minPowerMw = 0;
          maxPowerMw = 7400_000;
          break;
        }
        default:
          nominalPowerMw = 0;
          maxPowerMw = 11_000_000; // No restriction
      }

      slots.push({
        startMs: slotStart,
        endMs: slotEnd,
        minPowerMw,
        maxPowerMw,
        nominalPowerMw,
        demFeature: requiredFeatures,
      });
    }

    return {
      openADREventId: event.raw.id,
      programId: event.raw.programID,
      ucVersion: '2.6.1',
      slots,
      requiredFeatures,
      description: `OpenADR ${event.eventType} → DEM Energy Request (UC 2.6.1)`,
    };
  }

  // ─── UC 2.6.2 — Flex Bid Offer ──────────────────────────────────

  /**
   * Translate an ELECTRICITY_PRICE event into a Flex Bid Offer for VPP market.
   * The HEMS proactively offers flexibility back to the aggregator.
   *
   * @param event Active DR event (ELECTRICITY_PRICE or LOAD_CONTROL)
   * @param availablePowerW Available flexible power in W (from VPP resource registry)
   * @param currentPriceEurKWh Current grid price (to compute willingness-to-pay floor)
   */
  translateToFlexBidOffer(
    event: ActiveDREvent,
    availablePowerW: number,
    currentPriceEurKWh: number,
  ): FlexBidOffer {
    const now = Date.now();
    const startMs = Math.max(event.activeFrom, now);
    const endMs = event.activeTo;
    const durationMs = endMs - startMs;

    // Willingness-to-pay: offer flexibility if price exceeds 1.2× current
    const eventPrice = event.priceEurKWh ?? currentPriceEurKWh;
    const priceFloor =
      eventPrice > currentPriceEurKWh * 1.2
        ? currentPriceEurKWh * 0.9 // Accept 10% discount from current
        : 0;

    // For LOAD_CONTROL: offer to curtail EV to evMaxPowerW
    const offeredPower =
      event.eventType === 'LOAD_CONTROL'
        ? Math.max(0, availablePowerW - (event.evMaxPowerW ?? 0))
        : Math.min(availablePowerW, 7400);

    // Use ms duration to prevent zero-duration offers
    if (durationMs <= 0) {
      return {
        openADREventId: event.raw.id,
        ucVersion: '2.6.2',
        startMs: now,
        endMs: now + 3600_000,
        offeredPowerW: 0,
        minPowerW: 0,
        maxPowerW: 0,
        priceFloorEurKWh: 0,
        demFeature: DEMFeature.PA,
      };
    }

    return {
      openADREventId: event.raw.id,
      ucVersion: '2.6.2',
      startMs,
      endMs,
      offeredPowerW: Math.round(offeredPower),
      minPowerW: 0,
      maxPowerW: Math.round(availablePowerW),
      priceFloorEurKWh: Number(priceFloor.toFixed(4)),
      demFeature: DEMFeature.PA | DEMFeature.CON,
    };
  }

  // ─── UC 2.6.3 — VPP Dispatch ────────────────────────────────────

  /**
   * Translate any active DR event into a VPP Dispatch Signal for immediate execution.
   * Maps event type to device type and DEM features for the relevant resource.
   *
   * @param event Active DR event
   * @param eventType OpenADR event type for this dispatch
   */
  translateToVPPDispatch(event: ActiveDREvent, eventType: OpenADREventType): VPPDispatchSignal {
    let deviceType: VPPDispatchSignal['deviceType'] = 'flexible_load';
    let targetPowerW = 0;
    let demFeatures = 0;
    let urgency: VPPDispatchSignal['urgency'] = 'scheduled';

    const now = Date.now();

    switch (eventType) {
      case 'LOAD_CONTROL': {
        // §14a: EV curtailment is immediate
        const evMaxW = event.evMaxPowerW ?? 0;
        deviceType = 'ev';
        targetPowerW = evMaxW;
        demFeatures = DEMFeature.PA | DEMFeature.CON;
        urgency = 'immediate'; // §14a requires immediate response
        break;
      }
      case 'ELECTRICITY_PRICE': {
        // High tariff → battery discharge during expensive period
        const isHighPrice = (event.priceEurKWh ?? 0) > 0.3;
        deviceType = isHighPrice ? 'battery' : 'ev';
        targetPowerW = isHighPrice ? 5000 : 7400; // ~5kW battery, 7.4kW EV
        demFeatures = DEMFeature.PA | DEMFeature.PFR | DEMFeature.FA;
        urgency = event.activeFrom <= now ? 'immediate' : 'scheduled';
        break;
      }
      case 'SIMPLE': {
        // Simple DR → heat pump SG Ready dispatch
        const level = event.simpleLevel ?? 2;
        deviceType = 'heat_pump';
        targetPowerW = level >= 3 ? 6000 : level >= 2 ? 3000 : 0;
        demFeatures = DEMFeature.STA | DEMFeature.CON;
        urgency = 'scheduled';
        break;
      }
      case 'CARBON_REDUCTION': {
        // Carbon reduction → flexible load curtailment
        deviceType = 'flexible_load';
        targetPowerW = 0; // Full curtailment
        demFeatures = DEMFeature.PAU | DEMFeature.PFR;
        urgency = 'advisory';
        break;
      }
    }

    const durationMs = Math.max(0, event.activeTo - Math.max(event.activeFrom, now));

    return {
      openADREventId: event.raw.id,
      ucVersion: '2.6.3',
      targetPowerW,
      durationMs,
      deviceType,
      demFeatures,
      urgency,
    };
  }

  // ─── DER bitmap helper (public for adapter integration) ──────────

  /**
   * Convert DER capability bitmap to human-readable DEM feature names.
   * Useful for UI display and debugging.
   */
  getDEMFeatureNames(demBitmap: number): DEMFeatureKey[] {
    const names: DEMFeatureKey[] = [];
    for (const [key, bit] of Object.entries(DEMFeature)) {
      if (demBitmap & bit) names.push(key as DEMFeatureKey);
    }
    return names;
  }
}

/** Singleton translator instance */
export const uc26Translator = new UC26Translator();
