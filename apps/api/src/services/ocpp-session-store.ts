/**
 * Short-lived OCPP mTLS proxy sessions — credentials stay server-side until WS connect.
 */

import { getOptionalRedisClient } from './redis-client.js';

const OCPP_SESSION_PREFIX = 'nexus:ocpp:session:';
const OCPP_SESSION_TTL_SEC = 60;

export interface OcppProxySessionData {
  host: string;
  port: number;
  stationId: string;
  clientCert: string;
  clientKey: string;
  caCert?: string;
  revocationCheck?: 'off' | 'crl' | 'ocsp';
  clientId: string;
  expiresAt: number;
}

export interface IOcppSessionStore {
  issue(sessionId: string, data: OcppProxySessionData): Promise<void>;
  /** Atomically read and delete a session (single-use). */
  consume(sessionId: string): Promise<OcppProxySessionData | null>;
  clearForTests(): void;
}

class MemoryOcppSessionStore implements IOcppSessionStore {
  private readonly sessions = new Map<string, OcppProxySessionData>();

  constructor() {
    setInterval(() => {
      const now = Date.now();
      for (const [id, data] of this.sessions) {
        if (data.expiresAt < now) this.sessions.delete(id);
      }
    }, 120_000);
  }

  async issue(sessionId: string, data: OcppProxySessionData): Promise<void> {
    this.sessions.set(sessionId, data);
  }

  async consume(sessionId: string): Promise<OcppProxySessionData | null> {
    const data = this.sessions.get(sessionId);
    if (!data) return null;
    this.sessions.delete(sessionId);
    if (data.expiresAt < Date.now()) return null;
    return data;
  }

  clearForTests(): void {
    this.sessions.clear();
  }
}

class RedisOcppSessionStore implements IOcppSessionStore {
  async issue(sessionId: string, data: OcppProxySessionData): Promise<void> {
    const redis = await getOptionalRedisClient();
    if (!redis) {
      await memoryFallback.issue(sessionId, data);
      return;
    }
    await redis.set(
      `${OCPP_SESSION_PREFIX}${sessionId}`,
      JSON.stringify(data),
      'EX',
      OCPP_SESSION_TTL_SEC,
    );
  }

  async consume(sessionId: string): Promise<OcppProxySessionData | null> {
    const redis = await getOptionalRedisClient();
    if (!redis) return memoryFallback.consume(sessionId);

    const raw = await redis.getdel(`${OCPP_SESSION_PREFIX}${sessionId}`);
    if (!raw) return null;
    try {
      const data = JSON.parse(raw) as OcppProxySessionData;
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

const memoryFallback = new MemoryOcppSessionStore();

function createOcppSessionStore(): IOcppSessionStore {
  if (process.env.REDIS_URL) return new RedisOcppSessionStore();
  return memoryFallback;
}

export const ocppSessionStore = createOcppSessionStore();
