/**
 * Offline sync metadata — version, diff, and settings replay endpoints.
 */

import { type NextFunction, type Request, type Response, Router } from 'express';
import { z } from 'zod';
import { applySettingsPatch } from '../data/settings-store.js';
import { getSyncDiffSince } from '../data/sync-diff-store.js';
import { getSyncVersion } from '../data/sync-version-store.js';
import { requireJWT, requireScope } from '../middleware/auth.js';
import { idempotencyMiddleware } from '../middleware/idempotency.js';

const SinceQuerySchema = z.object({
  since: z.coerce.number().finite().nonnegative().optional().default(0),
});

const SettingsPatchSchema = z
  .object({
    updatedAt: z.number().finite().nonnegative().optional(),
  })
  .catchall(z.unknown());

function parseSettingsBody(body: unknown): {
  patch: Record<string, unknown>;
  clientUpdatedAt?: number;
} {
  const parsed = SettingsPatchSchema.safeParse(body);
  if (!parsed.success) {
    throw new Error('invalid_body');
  }
  const { updatedAt, ...rest } = parsed.data;
  const patch: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(rest)) {
    if (value !== undefined) patch[key] = value;
  }
  return {
    patch,
    ...(updatedAt !== undefined ? { clientUpdatedAt: updatedAt } : {}),
  };
}

/** Factory for `/api/sync/*` and `/api/settings` routes. */
export function createSyncRoutes(): Router {
  const router = Router();

  router.get('/api/sync/version', requireJWT, async (_req, res) => {
    res.json({ version: await getSyncVersion() });
  });

  router.get('/api/sync/diff', requireJWT, async (req, res) => {
    const parsed = SinceQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid since query parameter' });
      return;
    }
    res.json(await getSyncDiffSince(parsed.data.since));
  });

  router.put(
    '/api/settings',
    requireJWT,
    requireScope('readwrite'),
    idempotencyMiddleware,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { patch, clientUpdatedAt } = parseSettingsBody(req.body);
        if (Object.keys(patch).length === 0) {
          res.status(400).json({ error: 'Settings patch must include at least one key' });
          return;
        }
        const result = await applySettingsPatch(patch, clientUpdatedAt);
        res.json({ ok: true, ...result });
      } catch (error) {
        if (error instanceof Error && error.message === 'invalid_body') {
          res.status(400).json({ error: 'Invalid settings body' });
          return;
        }
        next(error);
      }
    },
  );

  return router;
}
