/**
 * MED-06 — Server-backed dashboard shares (opaque refs + single-use redeem).
 */

import {
  CreateDashboardShareRequestSchema,
  RedeemDashboardShareRequestSchema,
} from '@nexus-hems/shared-types';
import crypto, { timingSafeEqual } from 'crypto';
import { Router } from 'express';
import { requireJWT } from '../middleware/auth.js';
import { SHARE_TTL_MS, shareTicketStore } from '../services/share-ticket-store.js';

/** Re-exported for integration tests */
export { shareTicketStore };

export function createSharesRoutes(): Router {
  const router = Router();

  router.post('/api/shares', requireJWT, async (req, res) => {
    const parsed = CreateDashboardShareRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ errors: parsed.error.issues });
      return;
    }

    const jwtPayload = res.locals.jwtPayload as { sub?: string } | undefined;
    const ownerSub = jwtPayload?.sub ?? 'unknown';

    const redeemToken = crypto.randomBytes(32).toString('hex');
    const secretHash = crypto.createHash('sha256').update(redeemToken, 'utf8').digest();
    const shareId = crypto.randomUUID();
    const expiresAt = Date.now() + SHARE_TTL_MS;

    await shareTicketStore.set(shareId, {
      ownerSub,
      name: parsed.data.name,
      permissions: parsed.data.permissions,
      secretHash,
      expiresAt,
      consumed: false,
    });

    res.json({
      shareId,
      redeemToken,
      expiresInMs: SHARE_TTL_MS,
    });
  });

  router.post('/api/shares/:shareId/redeem', async (req, res) => {
    const parsed = RedeemDashboardShareRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ errors: parsed.error.issues });
      return;
    }

    const shareId = req.params.shareId;
    const entry = await shareTicketStore.get(shareId);
    if (!entry) {
      res.status(404).json({ error: 'Share not found' });
      return;
    }
    if (entry.expiresAt < Date.now()) {
      await shareTicketStore.delete(shareId);
      res.status(410).json({ error: 'Share expired' });
      return;
    }
    if (entry.consumed) {
      res.status(410).json({ error: 'Share already redeemed' });
      return;
    }

    const candidateHash = crypto.createHash('sha256').update(parsed.data.token, 'utf8').digest();
    if (
      candidateHash.length !== entry.secretHash.length ||
      !timingSafeEqual(candidateHash, entry.secretHash)
    ) {
      res.status(401).json({ error: 'Invalid share token' });
      return;
    }

    await shareTicketStore.delete(shareId);

    res.json({
      id: shareId,
      name: entry.name,
      permissions: entry.permissions,
      households: [],
      expiresAt: entry.expiresAt,
    });
  });

  return router;
}
