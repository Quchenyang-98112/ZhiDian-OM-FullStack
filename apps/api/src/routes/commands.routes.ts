/**
 * Hardware command replay for offline sync queue (ADR-030).
 * Replaces phantom /api/ev|battery|heatpump/control routes.
 */

import type { WSCommandType } from '@nexus-hems/shared-types';
import { Router } from 'express';
import { z } from 'zod';
import { getEffectiveAdapterMode } from '../config/adapter-mode.js';
import { isReadOnlyMode } from '../config/read-only-mode.js';
import {
  applyMockCommandMutation,
  extractOfflineCommandWatts,
  OFFLINE_ACTION_WS_TYPE,
} from '../data/mock-command-mutation.js';
import { mockData } from '../data/mock-data.js';
import { requireJWT, requireScope } from '../middleware/auth.js';
import { idempotencyMiddleware } from '../middleware/idempotency.js';
import { requireNotReadOnly } from '../middleware/require-not-read-only.js';
import { dispatchProtocolCommand } from '../protocols/ProtocolCommandRouter.js';

const ReplayBodySchema = z.object({
  type: z.enum(['ev-control', 'hp-control', 'battery-control']),
  payload: z.record(z.string(), z.unknown()).default({}),
});

/** Factory for `/api/commands/replay`. */
export function createCommandsRoutes(): Router {
  const router = Router();

  router.post(
    '/api/commands/replay',
    requireJWT,
    requireScope('readwrite'),
    requireNotReadOnly,
    idempotencyMiddleware,
    async (req, res) => {
      const parsed = ReplayBodySchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Invalid replay body', details: parsed.error.flatten() });
        return;
      }

      if (isReadOnlyMode()) {
        res
          .status(403)
          .json({ error: 'System is in read-only mode — control commands are disabled' });
        return;
      }

      const { type, payload } = parsed.data;
      const wsType = OFFLINE_ACTION_WS_TYPE[type];
      const watts = extractOfflineCommandWatts(payload);

      if (watts === undefined) {
        res.status(400).json({ error: `Cannot derive power value from payload for ${type}` });
        return;
      }

      const mode = getEffectiveAdapterMode();
      if (mode === 'live') {
        const result = await dispatchProtocolCommand({
          type: wsType as WSCommandType,
          value: watts,
        });
        if (!result.handled || !result.success) {
          res.status(result.handled ? 502 : 501).json({
            error: result.error ?? 'Live command dispatch failed',
          });
          return;
        }
        res.json({ ok: true, mode: 'live', type, value: watts });
        return;
      }

      applyMockCommandMutation({ type: wsType, value: watts });
      mockData.gridPower =
        mockData.houseLoad +
        mockData.batteryPower +
        mockData.evPower +
        mockData.heatPumpPower -
        mockData.pvPower;

      res.json({ ok: true, mode: 'mock', type, value: watts });
    },
  );

  return router;
}
