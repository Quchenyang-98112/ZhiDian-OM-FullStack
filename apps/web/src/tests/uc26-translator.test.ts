import { describe, expect, it } from 'vitest';
import type { ActiveDREvent } from '../core/adapters/contrib/openadr-3-1';
import { DEMFeature, UC26Translator } from '../core/uc26-translator';

// ─── UC26Translator Unit Tests ─────────────────────────────────────────────

const translator = new UC26Translator();

/** Helper: build a minimal ActiveDREvent for testing */
const makeEvent = (
  eventType: ActiveDREvent['eventType'],
  opts: Partial<ActiveDREvent> = {},
): ActiveDREvent => ({
  raw: {
    id: `evt-${eventType.toLowerCase()}`,
    programID: 'prog-test',
    eventName: `test-${eventType}`,
    intervals: [{ id: 0, payloads: [{ type: eventType, values: [1] }] }],
  },
  eventType,
  activeFrom: Date.now(),
  activeTo: Date.now() + 3_600_000,
  acknowledged: false,
  ...opts,
});

const priceEvent = makeEvent('ELECTRICITY_PRICE', { priceEurKWh: 0.45 });
const loadControlEvent = makeEvent('LOAD_CONTROL', { evMaxPowerW: 4140 });
const simpleEvent = makeEvent('SIMPLE', { simpleLevel: 2 });

describe('UC26Translator — translateToEnergyRequest (UC 2.6.1)', () => {
  it('maps ELECTRICITY_PRICE event to DEMEnergyRequest with FA+CON features', () => {
    const req = translator.translateToEnergyRequest(priceEvent);

    expect(req.openADREventId).toBe('evt-electricity_price');
    expect(req.programId).toBe('prog-test');
    expect(Array.isArray(req.slots)).toBe(true);
    expect(req.slots.length).toBeGreaterThan(0);
    expect(typeof req.slots[0].nominalPowerMw).toBe('number');
    expect(req.requiredFeatures & DEMFeature.FA).toBeGreaterThan(0);
    expect(req.requiredFeatures & DEMFeature.CON).toBeGreaterThan(0);
  });

  it('maps LOAD_CONTROL event (§14a) to DEMEnergyRequest with CON feature', () => {
    const req = translator.translateToEnergyRequest(loadControlEvent);

    expect(req.openADREventId).toBe('evt-load_control');
    expect(req.requiredFeatures & DEMFeature.CON).toBeGreaterThan(0);
  });

  it('maps SIMPLE event to DEMEnergyRequest with slots', () => {
    const req = translator.translateToEnergyRequest(simpleEvent);

    expect(req.openADREventId).toBe('evt-simple');
    expect(req.slots.length).toBeGreaterThan(0);
  });

  it('honors custom derBitmap (bit 3 = PAU)', () => {
    const req = translator.translateToEnergyRequest(loadControlEvent, 0x08);
    expect(req.requiredFeatures & DEMFeature.PAU).toBeGreaterThan(0);
  });
});

describe('UC26Translator — translateToFlexBidOffer (UC 2.6.2)', () => {
  it('creates a FlexBidOffer with correct event ID and UC version', () => {
    const bid = translator.translateToFlexBidOffer(priceEvent, 7400, 0.25);

    expect(bid.openADREventId).toBe('evt-electricity_price');
    expect(bid.ucVersion).toBe('2.6.2');
    expect(typeof bid.offeredPowerW).toBe('number');
    expect(bid.offeredPowerW).toBeGreaterThanOrEqual(0);
  });

  it('derives offered power from availablePowerW', () => {
    const bid = translator.translateToFlexBidOffer(priceEvent, 5000, 0.25);
    // offeredPower = min(5000, 7400) = 5000
    expect(bid.offeredPowerW).toBeLessThanOrEqual(5000);
  });

  it('curtailment offer for LOAD_CONTROL: offeredPower = available - evMaxPower', () => {
    const bid = translator.translateToFlexBidOffer(loadControlEvent, 11_000, 0.25);
    // max(0, 11000 - 4140) = 6860
    expect(bid.offeredPowerW).toBe(6860);
  });

  it('price floor is computed from currentPriceEurKWh', () => {
    // eventPrice(0.45) > currentPrice(0.25)*1.2=0.30 → discount applies
    const bid = translator.translateToFlexBidOffer(priceEvent, 7400, 0.25);
    expect(bid.priceFloorEurKWh).toBeGreaterThan(0);
    expect(bid.priceFloorEurKWh).toBeLessThan(0.25);
  });

  it('returns zero-power offer when event window has already passed', () => {
    const pastEvent = makeEvent('ELECTRICITY_PRICE', {
      activeFrom: Date.now() - 7200_000,
      activeTo: Date.now() - 3600_000,
      priceEurKWh: 0.45,
    });
    const bid = translator.translateToFlexBidOffer(pastEvent, 7400, 0.25);
    expect(bid.offeredPowerW).toBe(0);
  });
});

describe('UC26Translator — translateToVPPDispatch (UC 2.6.3)', () => {
  it('creates a VPPDispatchSignal from SIMPLE event targeting heat_pump', () => {
    const signal = translator.translateToVPPDispatch(simpleEvent, 'SIMPLE');

    expect(signal.openADREventId).toBe('evt-simple');
    expect(signal.ucVersion).toBe('2.6.3');
    expect(signal.deviceType).toBe('heat_pump');
    expect(typeof signal.targetPowerW).toBe('number');
    expect(signal.durationMs).toBeGreaterThan(0);
  });

  it('creates LOAD_CONTROL dispatch targeting EV with immediate urgency', () => {
    const signal = translator.translateToVPPDispatch(loadControlEvent, 'LOAD_CONTROL');

    expect(signal.deviceType).toBe('ev');
    expect(signal.urgency).toBe('immediate');
    expect(signal.targetPowerW).toBe(4140);
  });

  it('creates ELECTRICITY_PRICE dispatch targeting battery', () => {
    const signal = translator.translateToVPPDispatch(priceEvent, 'ELECTRICITY_PRICE');

    expect(signal.deviceType).toBe('battery');
    expect(signal.targetPowerW).toBeGreaterThan(0);
  });

  it('creates CARBON_REDUCTION dispatch targeting flexible_load', () => {
    const carbonEvent = makeEvent('CARBON_REDUCTION');
    const signal = translator.translateToVPPDispatch(carbonEvent, 'CARBON_REDUCTION');

    expect(signal.deviceType).toBe('flexible_load');
    expect(signal.urgency).toBe('advisory');
  });
});

describe('UC26Translator — getDEMFeatureNames', () => {
  it('decodes DEM feature bitmap to human-readable names', () => {
    // FA=0x10, CON=0x20 → 0x30
    const names = translator.getDEMFeatureNames(0x30);
    expect(names).toContain('FA');
    expect(names).toContain('CON');
    expect(names).not.toContain('PA');
  });

  it('returns empty array for bitmap = 0', () => {
    const names = translator.getDEMFeatureNames(0);
    expect(names).toHaveLength(0);
  });

  it('decodes all 6 features when full bitmap set', () => {
    const names = translator.getDEMFeatureNames(0x3f);
    expect(names).toHaveLength(6);
    expect(names).toContain('PA');
    expect(names).toContain('PFR');
    expect(names).toContain('STA');
    expect(names).toContain('PAU');
    expect(names).toContain('FA');
    expect(names).toContain('CON');
  });
});
