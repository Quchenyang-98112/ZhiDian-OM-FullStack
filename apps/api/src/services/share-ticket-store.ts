/**
 * Server-backed dashboard share store — in-memory or Redis (MED-15 HA).
 */

import { getOptionalRedisClient } from './redis-client.js';

const SHARE_PREFIX = 'nexus:share:';
const SHARE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface ShareEntry {
  ownerSub: string;
  name: string;
  permissions: 'view' | 'control' | 'admin';
  secretHash: Buffer;
  expiresAt: number;
  consumed: boolean;
}

interface SerializedShareEntry {
  ownerSub: string;
  name: string;
  permissions: 'view' | 'control' | 'admin';
  secretHash: string;
  expiresAt: number;
  consumed: boolean;
}

function serialize(entry: ShareEntry): string {
  const payload: SerializedShareEntry = {
    ownerSub: entry.ownerSub,
    name: entry.name,
    permissions: entry.permissions,
    secretHash: entry.secretHash.toString('base64'),
    expiresAt: entry.expiresAt,
    consumed: entry.consumed,
  };
  return JSON.stringify(payload);
}

function deserialize(raw: string): ShareEntry | null {
  try {
    const data = JSON.parse(raw) as SerializedShareEntry;
    return {
      ownerSub: data.ownerSub,
      name: data.name,
      permissions: data.permissions,
      secretHash: Buffer.from(data.secretHash, 'base64'),
      expiresAt: data.expiresAt,
      consumed: data.consumed,
    };
  } catch {
    return null;
  }
}

export interface IShareTicketStore {
  set(shareId: string, entry: ShareEntry): Promise<void>;
  get(shareId: string): Promise<ShareEntry | null>;
  delete(shareId: string): Promise<void>;
  clearForTests(): void;
}

class MemoryShareTicketStore implements IShareTicketStore {
  private readonly shares = new Map<string, ShareEntry>();

  constructor() {
    setInterval(() => {
      const now = Date.now();
      for (const [id, entry] of this.shares) {
        if (entry.expiresAt < now) this.shares.delete(id);
      }
    }, 120_000);
  }

  async set(shareId: string, entry: ShareEntry): Promise<void> {
    this.shares.set(shareId, entry);
  }

  async get(shareId: string): Promise<ShareEntry | null> {
    return this.shares.get(shareId) ?? null;
  }

  async delete(shareId: string): Promise<void> {
    this.shares.delete(shareId);
  }

  clearForTests(): void {
    this.shares.clear();
  }
}

class RedisShareTicketStore implements IShareTicketStore {
  async set(shareId: string, entry: ShareEntry): Promise<void> {
    const redis = await getOptionalRedisClient();
    if (!redis) {
      await memoryFallback.set(shareId, entry);
      return;
    }
    const ttl = Math.max(1, Math.ceil((entry.expiresAt - Date.now()) / 1000));
    await redis.set(`${SHARE_PREFIX}${shareId}`, serialize(entry), 'EX', ttl);
  }

  async get(shareId: string): Promise<ShareEntry | null> {
    const redis = await getOptionalRedisClient();
    if (!redis) return memoryFallback.get(shareId);

    const raw = await redis.get(`${SHARE_PREFIX}${shareId}`);
    if (!raw) return null;
    const entry = deserialize(raw);
    if (!entry || entry.expiresAt < Date.now()) {
      await redis.del(`${SHARE_PREFIX}${shareId}`);
      return null;
    }
    return entry;
  }

  async delete(shareId: string): Promise<void> {
    const redis = await getOptionalRedisClient();
    if (!redis) {
      await memoryFallback.delete(shareId);
      return;
    }
    await redis.del(`${SHARE_PREFIX}${shareId}`);
  }

  clearForTests(): void {
    memoryFallback.clearForTests();
  }
}

const memoryFallback = new MemoryShareTicketStore();

function createShareTicketStore(): IShareTicketStore {
  if (process.env.REDIS_URL) return new RedisShareTicketStore();
  return memoryFallback;
}

export const shareTicketStore = createShareTicketStore();

export { SHARE_TTL_MS };
