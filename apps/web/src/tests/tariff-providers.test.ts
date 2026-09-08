/**
 * Tariff Providers — pure/exported function coverage
 *
 * Tests:
 *  - getDynamicGridFee() — §14a EnWG time-of-use pricing
 *  - isPeakHour() — peak period detection
 *  - getGridFeeSchedule() — hourly fee array generation
 *  - applyDynamicGridFees() — fee replacement on price points
 *  - TARIFF_PROVIDERS metadata — structural integrity
 *  - fetchTariffPrices() with provider='none' — generateFixedPrices (no network)
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GridFeeSchedule, TariffPricePoint } from '../lib/tariff-providers';
import {
  applyDynamicGridFees,
  fetchTariffPrices,
  getDynamicGridFee,
  getGridFeeSchedule,
  isPeakHour,
  TARIFF_PROVIDERS,
} from '../lib/tariff-providers';

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── getDynamicGridFee ───────────────────────────────────────────────

describe('getDynamicGridFee()', () => {
  it('returns a number in €/kWh for any valid hour', () => {
    for (let h = 0; h < 24; h++) {
      const fee = getDynamicGridFee(h);
      expect(typeof fee).toBe('number');
      expect(fee).toBeGreaterThan(0);
    }
  });

  it('off-peak hours (00–05) have lower fee than peak hours (17–20)', () => {
    const offPeak = getDynamicGridFee(2); // 02:00 — deep off-peak
    const peak = getDynamicGridFee(18); // 18:00 — evening peak
    expect(offPeak).toBeLessThan(peak);
  });

  it('returns standard fee when dynamic is disabled', () => {
    const schedule: GridFeeSchedule = {
      operator: 'Test',
      baseFeeAnnual: 100,
      standardFeeCtKwh: 8,
      offPeakFeeCtKwh: 4.8,
      peakHours: [],
      dynamicEnabled: false,
    };
    const fee = getDynamicGridFee(12, schedule);
    expect(fee).toBeCloseTo(0.08, 4); // 8 ct = 0.08 €
  });

  it('falls back to 1.0 multiplier for unknown hour when touMultipliers is absent', () => {
    const schedule: GridFeeSchedule = {
      operator: 'Test',
      baseFeeAnnual: 100,
      standardFeeCtKwh: 10,
      offPeakFeeCtKwh: 5,
      peakHours: [],
      dynamicEnabled: true,
      // no touMultipliers
    };
    const fee = getDynamicGridFee(5, schedule);
    expect(fee).toBeCloseTo(0.1, 4); // 10ct × 1.0 = 0.10 €
  });
});

// ─── isPeakHour ─────────────────────────────────────────────────────

describe('isPeakHour()', () => {
  it('identifies morning peak (06–09)', () => {
    expect(isPeakHour(6)).toBe(true);
    expect(isPeakHour(7)).toBe(true);
    expect(isPeakHour(8)).toBe(true);
    expect(isPeakHour(9)).toBe(false); // exclusive end
  });

  it('identifies evening peak (17–21)', () => {
    expect(isPeakHour(17)).toBe(true);
    expect(isPeakHour(20)).toBe(true);
    expect(isPeakHour(21)).toBe(false);
  });

  it('identifies midday peak (11–13)', () => {
    expect(isPeakHour(11)).toBe(true);
    expect(isPeakHour(12)).toBe(true);
    expect(isPeakHour(13)).toBe(false);
  });

  it('returns false for off-peak hours', () => {
    expect(isPeakHour(0)).toBe(false);
    expect(isPeakHour(3)).toBe(false);
    expect(isPeakHour(23)).toBe(false);
  });

  it('returns false when no peak periods defined', () => {
    const schedule: GridFeeSchedule = {
      operator: 'Test',
      baseFeeAnnual: 100,
      standardFeeCtKwh: 8,
      offPeakFeeCtKwh: 4.8,
      peakHours: [],
      dynamicEnabled: true,
    };
    for (let h = 0; h < 24; h++) {
      expect(isPeakHour(h, schedule)).toBe(false);
    }
  });
});

// ─── getGridFeeSchedule ──────────────────────────────────────────────

describe('getGridFeeSchedule()', () => {
  it('returns 24 hourly fees', () => {
    const { hourlyFees } = getGridFeeSchedule();
    expect(hourlyFees).toHaveLength(24);
  });

  it('all hourly fees are positive numbers', () => {
    const { hourlyFees } = getGridFeeSchedule();
    hourlyFees.forEach((fee) => {
      expect(typeof fee).toBe('number');
      expect(fee).toBeGreaterThan(0);
    });
  });

  it('accepts optional operator name', () => {
    const schedule = getGridFeeSchedule('Netze Hamburg');
    expect(schedule.operator).toBe('Netze Hamburg');
  });

  it('uses default operator when no name provided', () => {
    const schedule = getGridFeeSchedule();
    expect(schedule.operator).toBeTruthy();
  });
});

// ─── applyDynamicGridFees ────────────────────────────────────────────

describe('applyDynamicGridFees()', () => {
  const basePrices: TariffPricePoint[] = [
    {
      startsAt: new Date('2026-04-20T12:00:00'), // noon — mid multiplier
      endsAt: new Date('2026-04-20T13:00:00'),
      total: 0.3,
      energy: 0.18,
      tax: 0.04,
      gridFee: 0.08,
      renewableSurcharge: 0,
      currency: 'EUR',
    },
    {
      startsAt: new Date('2026-04-20T03:00:00'), // deep night — off-peak
      endsAt: new Date('2026-04-20T04:00:00'),
      total: 0.2,
      energy: 0.14,
      tax: 0.03,
      gridFee: 0.03,
      renewableSurcharge: 0,
      currency: 'EUR',
    },
  ];

  it('returns the same number of price points', () => {
    const result = applyDynamicGridFees(basePrices);
    expect(result).toHaveLength(basePrices.length);
  });

  it('replaces gridFee with dynamic value', () => {
    const result = applyDynamicGridFees(basePrices);
    const dynamicFee12 = getDynamicGridFee(12);
    expect(result[0].gridFee).toBeCloseTo(dynamicFee12, 6);
  });

  it('recalculates total correctly', () => {
    const result = applyDynamicGridFees(basePrices);
    const p = result[0];
    const expected = p.energy + p.tax + p.gridFee + p.renewableSurcharge;
    expect(p.total).toBeCloseTo(expected, 6);
  });

  it('preserves optional renewablePercent when present', () => {
    const prices: TariffPricePoint[] = [{ ...basePrices[0], renewablePercent: 72 }];
    const result = applyDynamicGridFees(prices);
    expect(result[0].renewablePercent).toBe(72);
  });

  it('preserves optional co2gPerKwh when present', () => {
    const prices: TariffPricePoint[] = [{ ...basePrices[0], co2gPerKwh: 180 }];
    const result = applyDynamicGridFees(prices);
    expect(result[0].co2gPerKwh).toBe(180);
  });

  it('handles empty input array', () => {
    const result = applyDynamicGridFees([]);
    expect(result).toHaveLength(0);
  });
});

// ─── TARIFF_PROVIDERS metadata ───────────────────────────────────────

describe('TARIFF_PROVIDERS metadata', () => {
  const requiredProviders = [
    'tibber',
    'tibber-pulse',
    'awattar-de',
    'awattar-at',
    'nordpool',
    'octopus',
    'awattar',
    'none',
  ] as const;

  it('contains all expected provider keys', () => {
    requiredProviders.forEach((key) => {
      expect(TARIFF_PROVIDERS).toHaveProperty(key);
    });
  });

  it('each provider has required fields', () => {
    Object.values(TARIFF_PROVIDERS).forEach((p) => {
      expect(p).toHaveProperty('provider');
      expect(p).toHaveProperty('planName');
      expect(p).toHaveProperty('currency');
      expect(p).toHaveProperty('realtimeAvailable');
      expect(typeof p.monthlyBaseFee).toBe('number');
    });
  });

  it('tibber-pulse has realtimeAvailable=true', () => {
    expect(TARIFF_PROVIDERS['tibber-pulse'].realtimeAvailable).toBe(true);
  });

  it('awattar-de has zero monthly base fee (spot market)', () => {
    expect(TARIFF_PROVIDERS['awattar-de'].monthlyBaseFee).toBe(0);
  });

  it('nordpool metadata is available with EUR pricing', () => {
    expect(TARIFF_PROVIDERS.nordpool.currency).toBe('EUR');
    expect(TARIFF_PROVIDERS.nordpool.apiEndpoint).toContain('nordpoolgroup.com');
  });
});

// ─── fetchTariffPrices with provider='none' ──────────────────────────

describe('fetchTariffPrices() — provider=none (offline, no network)', () => {
  it('returns an array of price points', async () => {
    const prices = await fetchTariffPrices('none', '');
    expect(Array.isArray(prices)).toBe(true);
    expect(prices.length).toBeGreaterThan(0);
  });

  it('each price point has the required shape', async () => {
    const prices = await fetchTariffPrices('none', '');
    prices.forEach((p) => {
      expect(p).toHaveProperty('startsAt');
      expect(p).toHaveProperty('endsAt');
      expect(p).toHaveProperty('total');
      expect(p).toHaveProperty('energy');
      expect(p).toHaveProperty('tax');
      expect(p).toHaveProperty('gridFee');
      expect(p).toHaveProperty('currency');
      expect(p.total).toBeTypeOf('number');
    });
  });

  it('fixed prices are positive', async () => {
    const prices = await fetchTariffPrices('none', '');
    prices.forEach((p) => {
      expect(p.total).toBeGreaterThan(0);
    });
  });
});

describe('fetchTariffPrices() — provider=nordpool', () => {
  it('falls back to simulated prices when the remote endpoint fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: false } as Response);

    const prices = await fetchTariffPrices('nordpool', '', 'DE-LU');

    expect(prices.length).toBeGreaterThan(0);
    expect(prices[0]?.currency).toBe('EUR');
    expect(prices[0]?.startsAt).toBeInstanceOf(Date);
  });

  it('parses Nordpool market data when the API succeeds', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          Rows: [
            {
              StartTime: '2026-04-20T10:00:00Z',
              EndTime: '2026-04-20T11:00:00Z',
              Columns: [{ Value: '45,50' }],
            },
          ],
        },
      }),
    } as Response);

    const prices = await fetchTariffPrices('nordpool', '', 'DE-LU');

    expect(prices).toHaveLength(1);
    expect(prices[0]?.energy).toBeCloseTo(0.0455, 4);
    expect(prices[0]?.total).toBeGreaterThan(prices[0]?.energy ?? 0);
  });
});

describe('fetchTariffPrices() — provider=tibber', () => {
  it('returns simulated prices when no API token is provided', async () => {
    const prices = await fetchTariffPrices('tibber', '');
    expect(prices.length).toBeGreaterThan(0);
    expect(prices[0]?.currency).toBe('EUR');
  });

  it('maps GraphQL priceInfo when Tibber API succeeds', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          viewer: {
            homes: [
              {
                currentSubscription: {
                  priceInfo: {
                    today: [
                      {
                        total: 0.31,
                        energy: 0.18,
                        tax: 0.05,
                        startsAt: '2026-04-20T12:00:00.000Z',
                      },
                    ],
                    tomorrow: [],
                  },
                },
              },
            ],
          },
        },
      }),
    } as Response);

    const prices = await fetchTariffPrices('tibber', 'test-token');

    expect(prices).toHaveLength(1);
    expect(prices[0]?.total).toBe(0.31);
    expect(prices[0]?.gridFee).toBeCloseTo(0.08, 4);
  });

  it('falls back to simulated prices when Tibber API fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network error'));

    const prices = await fetchTariffPrices('tibber', 'test-token');
    expect(prices.length).toBeGreaterThan(0);
  });
});

describe('fetchTariffPrices() — provider=tibber-pulse', () => {
  it('enhances Tibber prices with renewable and CO2 metrics', async () => {
    const prices = await fetchTariffPrices('tibber-pulse', '');
    expect(prices.length).toBeGreaterThan(0);
    expect(prices[0]?.renewablePercent).toBeTypeOf('number');
    expect(prices[0]?.co2gPerKwh).toBeTypeOf('number');
  });
});

describe('fetchTariffPrices() — provider=awattar-de / awattar-at', () => {
  it('parses aWATTar DE market data on success', async () => {
    const start = Date.now();
    const end = start + 3_600_000;
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [{ start_timestamp: start, end_timestamp: end, marketprice: 80 }],
      }),
    } as Response);

    const prices = await fetchTariffPrices('awattar-de', '');

    expect(prices).toHaveLength(1);
    expect(prices[0]?.energy).toBeCloseTo(0.08, 4);
    expect(prices[0]?.currency).toBe('EUR');
  });

  it('uses AT fee schedule for awattar-at', async () => {
    const start = Date.now();
    const end = start + 3_600_000;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      expect(String(input)).toContain('api.awattar.at');
      return {
        ok: true,
        json: async () => ({
          data: [{ start_timestamp: start, end_timestamp: end, marketprice: 60 }],
        }),
      } as Response;
    });

    const prices = await fetchTariffPrices('awattar-at', '');
    expect(prices[0]?.gridFee).toBeCloseTo(0.045, 4);
  });

  it('falls back when aWATTar response is not ok', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: false } as Response);
    const prices = await fetchTariffPrices('awattar', '');
    expect(prices.length).toBeGreaterThan(0);
  });
});

describe('fetchTariffPrices() — provider=octopus', () => {
  it('returns simulated GBP prices without an API token', async () => {
    const prices = await fetchTariffPrices('octopus', '');
    expect(prices.length).toBeGreaterThan(0);
    expect(prices[0]?.currency).toBe('GBP');
  });

  it('maps Octopus Agile unit rates when API succeeds', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [
          {
            valid_from: '2026-04-20T10:00:00Z',
            valid_to: '2026-04-20T11:00:00Z',
            value_inc_vat: 25.5,
            value_exc_vat: 21.0,
          },
        ],
      }),
    } as Response);

    const prices = await fetchTariffPrices('octopus', 'api-key', 'DE');

    expect(prices).toHaveLength(1);
    expect(prices[0]?.total).toBeCloseTo(0.255, 4);
    expect(prices[0]?.currency).toBe('EUR');
  });
});
