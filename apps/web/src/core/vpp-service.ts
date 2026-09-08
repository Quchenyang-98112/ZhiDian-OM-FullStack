/**
 * VPP (Virtual Power Plant) Service — UC 2.6.2 / VDE-AR-E 2829-6
 *
 * Aggregates distributed energy resources (DER) in a single home — battery,
 * EV (V2G), and heat pump — into a flex-market bid targeting grid balancing
 * and tertiary reserve markets.
 *
 * Design: single-node VPP ("prosumer node"). The home itself is the VPP
 * participant. The service composes flex offers from the active adapters,
 * submits them via the OpenADR 3.1 API proxy, and tracks realized revenue.
 *
 * VDE-AR-E 2829-6 CERT / DEV mode:
 *  - DEV:  bids are local-only, logged but never submitted to the VTN.
 *  - CERT: bids are submitted after the user grants the §14a-compatible
 *          consent that was stored during onboarding.
 *
 * @module vpp-service
 */

import type { ActiveDREvent } from './adapters/contrib/openadr-3-1.js';
import { uc26Translator } from './uc26-translator.js';

// ─── DER Resource Types ────────────────────────────────────────────────────

export type DERResourceType = 'battery' | 'ev' | 'heat_pump' | 'pv_inverter';

export type FlexDirection = 'up' | 'down' | 'bidirectional';

/** A single DER resource registered with the VPP service */
export interface VPPNode {
  /** Unique stable identifier (e.g. adapter id + device id) */
  id: string;
  /** Human-readable name */
  name: string;
  resourceType: DERResourceType;
  /** Installed capacity (W) */
  capacityW: number;
  /** Currently available flex power (W) */
  availableFlexW: number;
  /** Directions this resource can flex */
  flexDirection: FlexDirection;
  /** Adapter id that owns this resource */
  adapterId: string;
  /** Whether this resource is temporarily opted out */
  optedOut: boolean;
}

// ─── Flex Offer / Bid ──────────────────────────────────────────────────────

export interface FlexOfferWindow {
  startTime: number; // Unix ms
  endTime: number; // Unix ms
}

export interface FlexOffer {
  /** Unique offer id (UUID v4) */
  offerId: string;
  /** Resources included in this offer */
  resourceIds: string[];
  /** Aggregated flex power (positive = increase generation or reduce load) */
  flexPowerW: number;
  /** Direction of flex */
  direction: FlexDirection;
  /** Delivery window */
  window: FlexOfferWindow;
  /** Minimum acceptable price (€/kWh) */
  minPriceEurKwh: number;
  /** VPP mode when this offer was created */
  mode: VPPOperatingMode;
  /** Submission status */
  status: 'draft' | 'submitted' | 'accepted' | 'rejected' | 'expired';
  createdAt: number;
}

// ─── Revenue Tracking ─────────────────────────────────────────────────────

export interface VPPRevenueSummary {
  /** Accumulated revenue (€) since VPP was first enabled */
  totalEur: number;
  /** Revenue in the current calendar month (€) */
  currentMonthEur: number;
  /** Last flex event payout (€) */
  lastPayoutEur: number;
  lastPayoutAt: number;
  /** Number of accepted offers all-time */
  acceptedOffersCount: number;
}

// ─── Operating Modes ─────────────────────────────────────────────────────

/**
 * VDE-AR-E 2829-6 operating modes:
 *  - `dev`:  local-only; bids are logged but never submitted to VTN.
 *  - `cert`: production mode; bids submitted after user consent.
 */
export type VPPOperatingMode = 'dev' | 'cert';

// ─── Dispatch Signal ──────────────────────────────────────────────────────

export interface VPPDispatchSignal {
  offerId: string;
  flexPowerW: number;
  direction: FlexDirection;
  window: FlexOfferWindow;
  priceEurKwh: number;
  confirmedAt: number;
}

// ─── VPP Service ─────────────────────────────────────────────────────────

export class VPPService {
  private nodes: Map<string, VPPNode> = new Map();
  private offers: Map<string, FlexOffer> = new Map();
  private revenue: VPPRevenueSummary = {
    totalEur: 0,
    currentMonthEur: 0,
    lastPayoutEur: 0,
    lastPayoutAt: 0,
    acceptedOffersCount: 0,
  };
  private mode: VPPOperatingMode = 'dev';

  // ─── Resource Registry ─────────────────────────────────────────────

  registerNode(node: VPPNode): void {
    this.nodes.set(node.id, { ...node });
  }

  unregisterNode(nodeId: string): void {
    this.nodes.delete(nodeId);
  }

  getNode(nodeId: string): VPPNode | undefined {
    return this.nodes.get(nodeId);
  }

  getAllNodes(): VPPNode[] {
    return Array.from(this.nodes.values());
  }

  setNodeOptOut(nodeId: string, optedOut: boolean): void {
    const node = this.nodes.get(nodeId);
    if (node) {
      node.optedOut = optedOut;
      this.nodes.set(nodeId, node);
    }
  }

  // ─── Operating Mode ────────────────────────────────────────────────

  setMode(mode: VPPOperatingMode): void {
    this.mode = mode;
  }

  getMode(): VPPOperatingMode {
    return this.mode;
  }

  // ─── Flex Offer Creation ───────────────────────────────────────────

  /**
   * Compose a flex offer from all non-opted-out resources.
   * Applies UC 2.6.2 FlexBidOffer semantics: aggregates available flex,
   * sets a minimum price based on current tariff, and tags the offer with
   * the operating mode for audit purposes.
   */
  createFlexOffer(params: {
    windowMs: FlexOfferWindow;
    direction: FlexDirection;
    currentTariffEurKwh: number;
    /** Minimum bid premium above spot (fraction, e.g. 0.2 = +20%) */
    premiumFraction?: number;
  }): FlexOffer | null {
    const eligible = Array.from(this.nodes.values()).filter(
      (n) => !n.optedOut && n.availableFlexW > 0,
    );
    if (eligible.length === 0) return null;

    const totalFlexW = eligible.reduce((sum, n) => sum + n.availableFlexW, 0);
    const premium = params.premiumFraction ?? 0.15;
    const minPrice = Number((params.currentTariffEurKwh * (1 + premium)).toFixed(4));

    const offer: FlexOffer = {
      offerId: crypto.randomUUID(),
      resourceIds: eligible.map((n) => n.id),
      flexPowerW: totalFlexW,
      direction: params.direction,
      window: params.windowMs,
      minPriceEurKwh: minPrice,
      mode: this.mode,
      status: 'draft',
      createdAt: Date.now(),
    };

    this.offers.set(offer.offerId, offer);
    return offer;
  }

  // ─── Bid Submission ────────────────────────────────────────────────

  /**
   * Submit a flex offer to the VTN via the OpenADR API proxy.
   *
   * In `dev` mode the offer is logged locally only.
   * In `cert` mode the offer is sent to `POST /api/openadr/reports`.
   */
  async submitOffer(offerId: string): Promise<boolean> {
    const offer = this.offers.get(offerId);
    if (offer?.status !== 'draft') return false;

    if (this.mode === 'dev') {
      // DEV mode: mark accepted locally for testing without network call
      offer.status = 'accepted';
      this.offers.set(offerId, offer);
      return true;
    }

    // CERT mode: translate to UC 2.6.2 FlexBidOffer and POST
    // Build a synthetic ActiveDREvent from the offer data for UC 2.6.2 translation
    const syntheticEvent: ActiveDREvent = {
      raw: {
        id: offerId,
        programID: 'vpp-prosumer',
        eventName: `flex-offer-${offerId}`,
        priority: 1,
        payloadDescriptors: [{ payloadType: 'SIMPLE', units: 'W' }],
        intervalPeriod: {
          start: new Date(offer.window.startTime).toISOString(),
          duration: `PT${Math.round((offer.window.endTime - offer.window.startTime) / 60_000)}M`,
        },
        intervals: [
          {
            id: 0,
            payloads: [{ type: 'SIMPLE', values: [offer.flexPowerW] }],
          },
        ],
        targets: [],
      },
      eventType: 'SIMPLE',
      activeFrom: offer.window.startTime,
      activeTo: offer.window.endTime,
      acknowledged: false,
    };
    const flexBid = uc26Translator.translateToFlexBidOffer(
      syntheticEvent,
      offer.flexPowerW,
      offer.minPriceEurKwh,
    );

    try {
      const resp = await fetch('/api/openadr/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          programId: flexBid.openADREventId,
          resourceName: 'nexus-hems-home',
          intervals: [
            {
              id: 0,
              payloads: [
                {
                  type: 'USAGE',
                  values: [flexBid.offeredPowerW / 1000], // kW
                },
              ],
            },
          ],
        }),
      });
      offer.status = resp.ok ? 'accepted' : 'rejected';
    } catch {
      offer.status = 'rejected';
    }

    this.offers.set(offerId, offer);
    return offer.status === 'accepted';
  }

  // ─── Dispatch Handling ────────────────────────────────────────────

  /**
   * Handle an incoming VPP dispatch signal from the VTN (UC 2.6.3).
   * Records a payout and updates revenue tracking.
   */
  handleDispatch(signal: VPPDispatchSignal): void {
    const offer = this.offers.get(signal.offerId);
    if (offer) {
      offer.status = 'accepted';
      this.offers.set(signal.offerId, offer);
    }

    // Revenue estimation: flexPowerW × duration (h) × price
    const durationH = (signal.window.endTime - signal.window.startTime) / 3_600_000;
    const revenueEur = (signal.flexPowerW / 1000) * durationH * signal.priceEurKwh;
    this.recordRevenue(revenueEur);
  }

  // ─── Revenue ──────────────────────────────────────────────────────

  private recordRevenue(amountEur: number): void {
    const now = new Date();
    const current = new Date(this.revenue.lastPayoutAt);
    const sameMonth =
      now.getFullYear() === current.getFullYear() && now.getMonth() === current.getMonth();

    this.revenue.totalEur += amountEur;
    this.revenue.currentMonthEur = sameMonth ? this.revenue.currentMonthEur + amountEur : amountEur;
    this.revenue.lastPayoutEur = amountEur;
    this.revenue.lastPayoutAt = Date.now();
    this.revenue.acceptedOffersCount += 1;
  }

  getRevenueSummary(): Readonly<VPPRevenueSummary> {
    return { ...this.revenue };
  }

  // ─── Resource Auto-Registration ───────────────────────────────────

  /**
   * Convenience helper: register resources from live energy data.
   * Call this after adapter data is updated to keep the VPP node list current.
   */
  syncFromEnergyData(data: {
    batteryCapacityKwh?: number;
    batterySoCPercent?: number;
    batteryMaxChargeW?: number;
    evSocPercent?: number;
    evMaxDischargePowerW?: number;
    evDisabledBy14a?: boolean;
  }): void {
    // Battery
    if (data.batteryCapacityKwh != null && data.batteryMaxChargeW != null) {
      const availableFlex =
        data.batterySoCPercent != null
          ? (data.batterySoCPercent / 100) * (data.batteryMaxChargeW ?? 0)
          : 0;
      this.registerNode({
        id: 'battery-main',
        name: 'Home Battery',
        resourceType: 'battery',
        capacityW: data.batteryMaxChargeW ?? 0,
        availableFlexW: availableFlex,
        flexDirection: 'bidirectional',
        adapterId: 'battery',
        optedOut: false,
      });
    }

    // EV (V2G capable)
    if (data.evMaxDischargePowerW != null && data.evDisabledBy14a !== true) {
      const socFraction = (data.evSocPercent ?? 0) / 100;
      // Available flex: proportional to SoC above 20% floor
      const usableSoc = Math.max(0, socFraction - 0.2);
      const availableFlex = usableSoc > 0 ? data.evMaxDischargePowerW * (usableSoc / 0.8) : 0;
      this.registerNode({
        id: 'ev-v2g',
        name: 'EV V2G',
        resourceType: 'ev',
        capacityW: data.evMaxDischargePowerW,
        availableFlexW: availableFlex,
        flexDirection: 'bidirectional',
        adapterId: 'ocpp21',
        optedOut: false, // already guarded: evDisabledBy14a !== true
      });
    }
  }

  // ─── Queries ──────────────────────────────────────────────────────

  getOffer(offerId: string): FlexOffer | undefined {
    return this.offers.get(offerId);
  }

  getAllOffers(): FlexOffer[] {
    return Array.from(this.offers.values()).sort((a, b) => b.createdAt - a.createdAt);
  }

  /** Total currently available flex (W) across all non-opted-out resources */
  getTotalAvailableFlexW(): number {
    return Array.from(this.nodes.values())
      .filter((n) => !n.optedOut)
      .reduce((sum, n) => sum + n.availableFlexW, 0);
  }
}

/** Singleton VPP service instance */
export const vppService = new VPPService();
