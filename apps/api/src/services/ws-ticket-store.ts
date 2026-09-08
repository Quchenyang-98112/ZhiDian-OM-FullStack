/**
 * Single-use WebSocket ticket store — in-memory or Redis (MED-15 HA).
 */

import type { JWTScope } from '../middleware/auth.js';
import { getOptionalRedisClient } from './redis-client.js';

const WS_TICKET_PREFIX = 'nexus:ws:ticket:';
const WS_TICKET_TTL_SEC = 60;

export interface WsTicketData {
  clientId: string;
  scope: JWTScope;
  expiresAt: number;
}

export interface IWsTicketStore {
  issue(ticket: string, data: WsTicketData): Promise<void>;
  /** Atomically read and delete a ticket (single-use). */
  consume(ticket: string): Promise<WsTicketData | null>;
  clearForTests(): void;
}

class MemoryWsTicketStore implements IWsTicketStore {
  private readonly tickets = new Map<string, WsTicketData>();

  constructor() {
    setInterval(() => {
      const now = Date.now();
      for (const [ticket, data] of this.tickets) {
        if (data.expiresAt < now) this.tickets.delete(ticket);
      }
    }, 120_000);
  }

  async issue(ticket: string, data: WsTicketData): Promise<void> {
    this.tickets.set(ticket, data);
  }

  async consume(ticket: string): Promise<WsTicketData | null> {
    const data = this.tickets.get(ticket);
    if (!data) return null;
    this.tickets.delete(ticket);
    if (data.expiresAt < Date.now()) return null;
    return data;
  }

  clearForTests(): void {
    this.tickets.clear();
  }
}

class RedisWsTicketStore implements IWsTicketStore {
  async issue(ticket: string, data: WsTicketData): Promise<void> {
    const redis = await getOptionalRedisClient();
    if (!redis) {
      await memoryFallback.issue(ticket, data);
      return;
    }
    await redis.set(`${WS_TICKET_PREFIX}${ticket}`, JSON.stringify(data), 'EX', WS_TICKET_TTL_SEC);
  }

  async consume(ticket: string): Promise<WsTicketData | null> {
    const redis = await getOptionalRedisClient();
    if (!redis) return memoryFallback.consume(ticket);

    const raw = await redis.getdel(`${WS_TICKET_PREFIX}${ticket}`);
    if (!raw) return null;
    try {
      const data = JSON.parse(raw) as WsTicketData;
      if (data.expiresAt < Date.now()) return null;
      return data;
    } catch {
      return null;
    }
  }

  clearForTests(): void {
    memoryFallback.clearForTests();
  }
}

const memoryFallback = new MemoryWsTicketStore();

function createWsTicketStore(): IWsTicketStore {
  if (process.env.REDIS_URL) return new RedisWsTicketStore();
  return memoryFallback;
}

export const wsTicketStore = createWsTicketStore();
