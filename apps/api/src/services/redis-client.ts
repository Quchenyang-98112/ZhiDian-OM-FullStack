/**
 * Optional shared Redis client for HA session state (WS tickets, shares, JTI).
 * Falls back gracefully when REDIS_URL is unset or ioredis is unavailable.
 */

export interface IRedisClient {
  ping(): Promise<string>;
  set(key: string, value: string, mode: string, ttl: number): Promise<string | null>;
  get(key: string): Promise<string | null>;
  getdel(key: string): Promise<string | null>;
  del(...keys: string[]): Promise<number>;
  incr(key: string): Promise<number>;
  on(event: string, cb: (err: Error) => void): this;
}

type OptionalRedisModule = {
  Redis: new (url: string, opts: Record<string, unknown>) => IRedisClient;
};

const importOptionalModule = new Function('specifier', 'return import(specifier);') as (
  specifier: string,
) => Promise<unknown>;

let _client: IRedisClient | null = null;
let _initialized = false;
let _initFailed = false;

/**
 * Returns a connected Redis client when REDIS_URL is set and ioredis is available.
 * Subsequent calls reuse the same connection. Returns null on missing URL or failure.
 */
export async function getOptionalRedisClient(): Promise<IRedisClient | null> {
  if (_initialized) return _client;
  _initialized = true;

  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) return null;

  try {
    const { Redis } = (await importOptionalModule('ioredis')) as OptionalRedisModule;
    const client = new Redis(redisUrl, {
      enableReadyCheck: true,
      maxRetriesPerRequest: 2,
      connectTimeout: 3_000,
      lazyConnect: false,
    });

    client.on('error', (err: Error) => {
      console.error('[Redis] Connection error:', err.message);
    });

    await client.ping();
    _client = client;
    console.log('[Redis] Session store backend: Redis (WS tickets, shares, offline sync)');
  } catch (err) {
    _initFailed = true;
    console.warn(
      '[Redis] Connection failed — WS tickets and shares use in-memory fallback:',
      (err as Error).message,
    );
    _client = null;
  }

  return _client;
}

/** Reset client state between tests (in-memory fallback only). */
export function resetRedisClientForTests(): void {
  _client = null;
  _initialized = false;
  _initFailed = false;
}

export function redisInitFailed(): boolean {
  return _initFailed;
}
