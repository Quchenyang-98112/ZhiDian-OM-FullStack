import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OpenADR31Adapter } from '../core/adapters/contrib/openadr-3-1';

// ─── OpenADR 3.1 Adapter Unit Tests ───────────────────────────────────────────
// Tests event parsing, §14a flag, SIMPLE→SG Ready mapping, and OAuth2 flow.
// The adapter's network calls are intercepted via global fetch mock.

let mockFetch: ReturnType<typeof vi.fn>;
const OPENADR_TEST_TIMEOUT_MS = 15_000;

/** Cast to access the private pollEvents method from tests */
type WithPollEvents = { pollEvents(): Promise<void> };

/**
 * Build a minimal but valid OpenADR 3.1.0 event object.
 * Uses the structure expected by OpenADR31Adapter.processEvent():
 *   - `id` (not `eventId`), `programID` (capital D)
 *   - `payloadDescriptors[0].payloadType` drives event type detection
 *   - `intervalPeriod.start` + `intervalPeriod.duration` drives active window
 */
const buildEvent = (type: string, signalLevel: number, eventId = `evt-${Date.now()}`) => ({
  id: eventId,
  eventName: `${type}-${eventId}`,
  programID: 'test-program',
  priority: 5,
  payloadDescriptors: [{ payloadType: type }],
  intervalPeriod: {
    start: new Date().toISOString(),
    duration: 'PT1H',
  },
  intervals: [
    {
      id: 0,
      intervalPeriod: {
        start: new Date().toISOString(),
        duration: 'PT1H',
      },
      payloads: [{ type, values: [signalLevel] }],
    },
  ],
  targets: [],
});

/** Build a token response */
const tokenResponse = {
  access_token: 'test-token',
  token_type: 'Bearer',
  expires_in: 3600,
};

describe('OpenADR31Adapter — event parsing', () => {
  beforeEach(() => {
    mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);
    vi.stubGlobal('crypto', { randomUUID: () => 'test-uuid' });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it(
    'parses LOAD_CONTROL event to set evDisabledBy14a',
    async () => {
      // Token request
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => tokenResponse,
      });
      // LOAD_CONTROL with EV_MAX_POWER_W=0 → §14a full curtailment
      const event14a = {
        ...buildEvent('LOAD_CONTROL', 2, 'evt-14a'),
        intervals: [
          {
            id: 0,
            intervalPeriod: { start: new Date().toISOString(), duration: 'PT1H' },
            payloads: [
              { type: 'LOAD_CONTROL', values: [2] },
              { type: 'EV_MAX_POWER_W', values: [0] },
            ],
          },
        ],
      };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [event14a],
      });

      const adapter = new OpenADR31Adapter({
        programId: 'test-program',
        pollIntervalMs: 9999999, // disable auto-poll
      });

      adapter.onData(() => {});
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (adapter as unknown as WithPollEvents).pollEvents();

      expect(adapter.isEVDisabledBy14a()).toBe(true);
      expect(adapter.getActiveEvents().size).toBe(1);
    },
    OPENADR_TEST_TIMEOUT_MS,
  );

  it(
    'maps SIMPLE level 1 → SG Ready state 2',
    async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => tokenResponse,
      });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [buildEvent('SIMPLE', 1, 'evt-simple')],
      });

      const adapter = new OpenADR31Adapter({
        programId: 'test-program',
        pollIntervalMs: 9999999,
      });

      adapter.onData(() => {});
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (adapter as unknown as WithPollEvents).pollEvents();

      // Level 1 → SG Ready state = level + 1 = 2, clamped 1–4
      expect(adapter.getTariffOverride()?.sgReadyState).toBe(2);
    },
    OPENADR_TEST_TIMEOUT_MS,
  );

  it(
    'maps SIMPLE level 3 → SG Ready state 4 (clamped)',
    async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => tokenResponse,
      });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [buildEvent('SIMPLE', 3, 'evt-sg4')],
      });

      const adapter = new OpenADR31Adapter({
        programId: 'test-program',
        pollIntervalMs: 9999999,
      });

      adapter.onData(() => {});
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (adapter as unknown as WithPollEvents).pollEvents();

      expect(adapter.getTariffOverride()?.sgReadyState).toBe(4);
    },
    OPENADR_TEST_TIMEOUT_MS,
  );

  it(
    'updates tariffOverride from ELECTRICITY_PRICE event',
    async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => tokenResponse,
      });
      const priceEvent = {
        id: 'evt-price',
        eventName: 'ELECTRICITY_PRICE-evt-price',
        programID: 'test-program',
        priority: 5,
        payloadDescriptors: [{ payloadType: 'ELECTRICITY_PRICE' }],
        intervalPeriod: { start: new Date().toISOString(), duration: 'PT1H' },
        intervals: [
          {
            id: 0,
            intervalPeriod: { start: new Date().toISOString(), duration: 'PT1H' },
            payloads: [{ type: 'PRICE', values: [0.45] }],
          },
        ],
        targets: [],
      };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [priceEvent],
      });

      const adapter = new OpenADR31Adapter({
        programId: 'test-program',
        pollIntervalMs: 9999999,
      });

      adapter.onData(() => {});
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (adapter as unknown as WithPollEvents).pollEvents();

      expect(adapter.getTariffOverride()?.currentPriceEurKWh).toBe(0.45);
    },
    OPENADR_TEST_TIMEOUT_MS,
  );

  it(
    'getActiveEvents returns currently active events',
    async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => tokenResponse,
      });
      const evts = [buildEvent('LOAD_CONTROL', 2, 'active-1')];
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => evts,
      });

      const adapter = new OpenADR31Adapter({
        programId: 'test-program',
        pollIntervalMs: 9999999,
      });

      adapter.onData(() => {});
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (adapter as unknown as WithPollEvents).pollEvents();

      const active = adapter.getActiveEvents();
      expect(active.size).toBe(1);
      expect(active.get('active-1')?.raw.id).toBe('active-1');
    },
    OPENADR_TEST_TIMEOUT_MS,
  );
});

describe('OpenADR31Adapter — interface contract', () => {
  beforeEach(() => {
    mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);
    vi.stubGlobal('crypto', { randomUUID: () => 'test-uuid' });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('exposes id, name, and tariff capability', () => {
    const adapter = new OpenADR31Adapter({ programId: 'prog-1' });
    expect(adapter.id).toBe('openadr-3-1');
    expect(adapter.name).toMatch(/openadr/i);
    expect(adapter.capabilities).toContain('tariff');
    expect(adapter.status).toBe('disconnected');
    adapter.destroy();
  });

  it('returns empty snapshot before tariff override is applied', () => {
    const adapter = new OpenADR31Adapter();
    expect(adapter.getSnapshot()).toEqual({});
    adapter.destroy();
  });
});

describe('OpenADR31Adapter — connect and disconnect lifecycle', () => {
  beforeEach(() => {
    mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);
    vi.stubGlobal('crypto', { randomUUID: () => 'test-uuid' });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it(
    'connects, polls events, and disconnects cleanly',
    async () => {
      mockFetch
        .mockResolvedValueOnce({ ok: true, json: async () => tokenResponse })
        .mockResolvedValueOnce({ ok: true, json: async () => [] });

      const adapter = new OpenADR31Adapter({
        programId: 'test-program',
        pollIntervalMs: 999_999_999,
      });

      await adapter.connect();
      expect(adapter.status).toBe('connected');

      await adapter.disconnect();
      expect(adapter.status).toBe('disconnected');
      expect(adapter.getActiveEvents().size).toBe(0);
      expect(adapter.getTariffOverride()).toBeNull();
      expect(adapter.isEVDisabledBy14a()).toBe(false);

      adapter.destroy();
    },
    OPENADR_TEST_TIMEOUT_MS,
  );

  it(
    'fails connect when token refresh fails',
    async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 401, statusText: 'Unauthorized' });

      const adapter = new OpenADR31Adapter({ programId: 'test-program' });
      let connectError: string | undefined;
      adapter.onStatus((status, error) => {
        if (status === 'error') connectError = error;
      });
      await adapter.connect();
      expect(adapter.status).toBe('error');
      expect(connectError).toMatch(/token refresh failed/i);
      adapter.destroy();
    },
    OPENADR_TEST_TIMEOUT_MS,
  );
});

describe('OpenADR31Adapter — commands and registry', () => {
  beforeEach(() => {
    mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);
    vi.stubGlobal('crypto', { randomUUID: () => 'test-uuid' });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it(
    'acknowledges an active event and submits a VEN report',
    async () => {
      mockFetch
        .mockResolvedValueOnce({ ok: true, json: async () => tokenResponse })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [buildEvent('SIMPLE', 2, 'evt-ack')],
        })
        .mockResolvedValueOnce({ ok: true, json: async () => tokenResponse })
        .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) })
        .mockResolvedValueOnce({ ok: true, json: async () => tokenResponse })
        .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) });

      const adapter = new OpenADR31Adapter({
        programId: 'test-program',
        pollIntervalMs: 999_999_999,
      });

      adapter.onData(() => {});
      await (adapter as unknown as WithPollEvents).pollEvents();

      await expect(
        adapter.sendCommand({ type: 'OPENADR_ACKNOWLEDGE_EVENT', value: 'evt-ack' }),
      ).resolves.toBe(true);
      await expect(
        adapter.sendCommand({ type: 'OPENADR_SUBMIT_REPORT', value: 'usage-report' }),
      ).resolves.toBe(true);

      const acknowledgeCall = mockFetch.mock.calls.find((call) =>
        String(call[0]).includes('/acknowledge'),
      );
      const reportCall = mockFetch.mock.calls.find((call) => String(call[0]).includes('/reports'));
      expect(acknowledgeCall?.[1]).toMatchObject({ method: 'POST' });
      expect(reportCall?.[1]).toMatchObject({ method: 'POST' });

      adapter.destroy();
    },
    OPENADR_TEST_TIMEOUT_MS,
  );

  it(
    'returns false when acknowledging an unknown event id',
    async () => {
      const adapter = new OpenADR31Adapter({ programId: 'test-program' });
      await expect(
        adapter.sendCommand({ type: 'OPENADR_ACKNOWLEDGE_EVENT', value: 'missing-event' }),
      ).resolves.toBe(false);
      adapter.destroy();
    },
    OPENADR_TEST_TIMEOUT_MS,
  );

  it('registers the openadr-3-1 factory in the adapter registry', async () => {
    const { getRegisteredAdapter, unregisterAdapter } = await import(
      '../core/adapters/adapter-registry'
    );
    await import('../core/adapters/contrib/openadr-3-1');

    const entry = getRegisteredAdapter('openadr-3-1');
    expect(entry?.displayName).toBe('openadr-3-1');
    expect(entry?.source).toBe('contrib');
    expect(typeof entry?.factory).toBe('function');

    unregisterAdapter('openadr-3-1');
  });
});

describe('OpenADR31Adapter — aggregate state rebuild', () => {
  beforeEach(() => {
    mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);
    vi.stubGlobal('crypto', { randomUUID: () => 'test-uuid' });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it(
    'clears expired events and rebuilds tariff override from active price events',
    async () => {
      const expiredEvent = {
        ...buildEvent('ELECTRICITY_PRICE', 0.12, 'evt-expired'),
        intervalPeriod: {
          start: new Date(Date.now() - 3_600_000).toISOString(),
          duration: 'PT30M',
        },
        intervals: [
          {
            id: 0,
            intervalPeriod: {
              start: new Date(Date.now() - 3_600_000).toISOString(),
              duration: 'PT30M',
            },
            payloads: [{ type: 'PRICE', values: [0.12] }],
          },
        ],
      };
      const activePriceEvent = {
        id: 'evt-active-price',
        eventName: 'ELECTRICITY_PRICE-evt-active-price',
        programID: 'test-program',
        priority: 10,
        payloadDescriptors: [{ payloadType: 'ELECTRICITY_PRICE' }],
        intervalPeriod: {
          start: new Date(Date.now() - 60_000).toISOString(),
          duration: 'PT2H',
        },
        intervals: [
          {
            id: 0,
            intervalPeriod: {
              start: new Date(Date.now() - 60_000).toISOString(),
              duration: 'PT2H',
            },
            payloads: [{ type: 'PRICE', values: [0.31] }],
          },
        ],
        targets: [],
      };

      mockFetch
        .mockResolvedValueOnce({ ok: true, json: async () => tokenResponse })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [expiredEvent, activePriceEvent],
        });

      const adapter = new OpenADR31Adapter({
        programId: 'test-program',
        pollIntervalMs: 999_999_999,
      });

      adapter.onData(() => {});
      await (adapter as unknown as WithPollEvents).pollEvents();

      expect(adapter.getActiveEvents().has('evt-expired')).toBe(false);
      expect(adapter.getActiveEvents().has('evt-active-price')).toBe(true);
      expect(adapter.getTariffOverride()?.currentPriceEurKWh).toBe(0.31);
      expect(adapter.getSnapshot().tariff?.currentPriceEurKWh).toBe(0.31);

      adapter.destroy();
    },
    OPENADR_TEST_TIMEOUT_MS,
  );
});
