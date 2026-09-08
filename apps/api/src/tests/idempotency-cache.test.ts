import { afterEach, describe, expect, it } from 'vitest';
import {
  clearIdempotencyCacheForTests,
  clearWsIdempotencyCacheForTests,
  getIdempotencyRecord,
  isWsIdempotencyReplay,
  markWsIdempotencyAccepted,
  setIdempotencyRecord,
} from '../data/idempotency-cache.js';

afterEach(() => {
  clearIdempotencyCacheForTests();
  clearWsIdempotencyCacheForTests();
});

describe('idempotency-cache', () => {
  it('returns cached HTTP responses within TTL', async () => {
    await setIdempotencyRecord('key-1', 200, { ok: true });
    const hit = await getIdempotencyRecord('key-1');
    expect(hit?.statusCode).toBe(200);
    expect(hit?.body).toEqual({ ok: true });
  });

  it('tracks WS idempotency keys to prevent double execution', async () => {
    expect(await isWsIdempotencyReplay('ws-1')).toBe(false);
    await markWsIdempotencyAccepted('ws-1');
    expect(await isWsIdempotencyReplay('ws-1')).toBe(true);
  });
});
