/**
 * Optional Redis-backed EEBUS trust store for multi-replica API deployments.
 * Requires REDIS_URL and EEBUS_TRUST_BACKEND=redis.
 */

import type { EEBUSDeviceEntry } from './EEBusTrustStore.js';

const PREFIX = 'nexus:eebus:trust:';

interface MinimalRedis {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<string>;
  del(...keys: string[]): Promise<number>;
  keys(pattern: string): Promise<string[]>;
  ping(): Promise<string>;
}

const importOptionalModule = new Function('specifier', 'return import(specifier);') as (
  specifier: string,
) => Promise<unknown>;

let _client: MinimalRedis | null = null;
let _redisReady = false;

async function getRedis(): Promise<MinimalRedis> {
  if (_redisReady && _client) return _client;

  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    throw new Error('[EEBusTrustStore] EEBUS_TRUST_BACKEND=redis requires REDIS_URL');
  }

  const { Redis } = (await importOptionalModule('ioredis')) as {
    Redis: new (url: string, opts: Record<string, unknown>) => MinimalRedis;
  };

  const client = new Redis(redisUrl, {
    enableReadyCheck: true,
    maxRetriesPerRequest: 2,
    connectTimeout: 3_000,
    lazyConnect: false,
  });

  await client.ping();
  _client = client;
  _redisReady = true;
  console.log('[EEBusTrustStore] Trust data: Redis');
  return client;
}

export async function redisUpsertDevice(entry: EEBUSDeviceEntry): Promise<void> {
  const r = await getRedis();
  await r.set(`${PREFIX}${entry.ski}`, JSON.stringify(entry));
}

export async function redisRemoveDevice(ski: string): Promise<boolean> {
  const r = await getRedis();
  const n = await r.del(`${PREFIX}${ski}`);
  return n > 0;
}

export async function redisGetDevice(ski: string): Promise<EEBUSDeviceEntry | null> {
  const r = await getRedis();
  const raw = await r.get(`${PREFIX}${ski}`);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as EEBUSDeviceEntry;
  } catch {
    return null;
  }
}

export async function redisListDevices(): Promise<EEBUSDeviceEntry[]> {
  const r = await getRedis();
  const keys = await r.keys(`${PREFIX}*`);
  const out: EEBUSDeviceEntry[] = [];
  for (const key of keys) {
    const raw = await r.get(key);
    if (!raw) continue;
    try {
      out.push(JSON.parse(raw) as EEBUSDeviceEntry);
    } catch {
      /* skip corrupt */
    }
  }
  return out;
}

export async function redisUpdateDeviceStatus(
  ski: string,
  status: EEBUSDeviceEntry['status'],
  lastConnectedAt?: number,
): Promise<void> {
  const existing = await redisGetDevice(ski);
  if (!existing) return;
  const updated: EEBUSDeviceEntry = { ...existing, status };
  const resolvedLast = lastConnectedAt ?? existing.lastConnectedAt;
  if (resolvedLast !== undefined) {
    updated.lastConnectedAt = resolvedLast;
  }
  await redisUpsertDevice(updated);
}
