/**
 * Express middleware: deduplicate mutating requests via `X-Idempotency-Key`.
 * Returns the cached JSON body for duplicate keys within the 5-minute TTL window.
 * Supports POST, PUT, and PATCH (ADR-030).
 */

import type { NextFunction, Request, Response } from 'express';
import { getIdempotencyRecord, setIdempotencyRecord } from '../data/idempotency-cache.js';

const HEADER = 'x-idempotency-key';
const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH']);

/**
 * When `X-Idempotency-Key` is present, replay cached success responses or wrap
 * `res.json` to store the first 2xx body for later retries.
 */
export async function idempotencyMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const rawKey = req.header(HEADER);
  if (!rawKey || !MUTATING_METHODS.has(req.method)) {
    next();
    return;
  }

  const key = rawKey.trim();
  if (key.length === 0 || key.length > 128) {
    res.status(400).json({ error: 'Invalid X-Idempotency-Key header' });
    return;
  }

  const cached = await getIdempotencyRecord(key);
  if (cached) {
    res.status(cached.statusCode).json(cached.body);
    return;
  }

  const originalJson = res.json.bind(res);
  res.json = (body: unknown) => {
    if (res.statusCode >= 200 && res.statusCode < 300) {
      void setIdempotencyRecord(key, res.statusCode, body);
    }
    return originalJson(body);
  };

  next();
}
