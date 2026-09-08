/**
 * Exec Routes — Safe script execution API for ExecAdapter
 *
 * GET  /api/exec/run     — Poll a whitelisted script (requires readwrite or read scope)
 * POST /api/exec/command — Send a command to a script (requires readwrite scope; blocked in READ_ONLY_MODE)
 * GET  /api/exec/scripts — List available script IDs (requires read scope)
 *
 * All endpoints require a valid JWT (requireJWT middleware).
 * Script IDs and arguments are validated server-side against EXEC_SCRIPTS_CONFIG.
 *
 * Rate limiting: inherits the per-IP limit from the main Express rate limiter.
 * Additional per-endpoint limit: 60 run requests/minute to prevent script hammering.
 */

import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { requireJWT, requireScope } from '../middleware/auth.js';
import { idempotencyMiddleware } from '../middleware/idempotency.js';
import { requireNotReadOnly } from '../middleware/require-not-read-only.js';
import { listAvailableScripts, runCommandScript, runScript } from '../services/ExecService.js';

// ─── Validation Schemas ───────────────────────────────────────────────

const SAFE_ARG_KEY = /^[a-zA-Z0-9_\-.]{1,64}$/;
const SAFE_ARG_VALUE = /^[a-zA-Z0-9_\-./: ]{0,256}$/;

const safeArgsSchema = z.record(
  z.string().regex(SAFE_ARG_KEY, 'Unsafe arg key'),
  z.string().regex(SAFE_ARG_VALUE, 'Unsafe arg value'),
);

const runQuerySchema = z.object({
  scriptId: z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/, 'Invalid scriptId'),
  args: z
    .string()
    .optional()
    .transform((s) => {
      if (!s) return {};
      try {
        return safeArgsSchema.parse(JSON.parse(s));
      } catch {
        return {};
      }
    }),
});

const commandBodySchema = z.object({
  scriptId: z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/, 'Invalid scriptId'),
  commandType: z.string().min(1).max(64),
  value: z.unknown().optional(),
  targetDeviceId: z.string().optional(),
  args: safeArgsSchema.optional().default({}),
});

// ─── Rate Limiter ─────────────────────────────────────────────────────

const execRunRateLimit = rateLimit({
  windowMs: 60_000,
  max: 60,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many exec run requests — max 60/minute' },
});

// ─── Router Factory ──────────────────────────────────────────────────

export function createExecRoutes(): Router {
  const router = Router();

  /**
   * GET /api/exec/scripts
   * List available whitelisted script IDs. No sensitive info exposed.
   */
  router.get('/api/exec/scripts', requireJWT, requireScope('read'), (_req, res) => {
    try {
      const scripts = listAvailableScripts();
      res.json({ scripts });
    } catch (err) {
      res.status(500).json({ error: 'Failed to load exec config' });
      console.error('[ExecRoutes] listScripts error:', err);
    }
  });

  /**
   * GET /api/exec/run?scriptId=...&args={...}
   * Execute a poll script and return its JSON output.
   * Rate limited to 60 requests/minute.
   */
  router.get(
    '/api/exec/run',
    requireJWT,
    requireScope('read'),
    execRunRateLimit,
    async (req, res) => {
      const parsed = runQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        res.status(400).json({ error: 'Invalid request', details: parsed.error.flatten() });
        return;
      }

      const { scriptId, args } = parsed.data;
      try {
        const output = await runScript({ scriptId, args });
        res.json(output);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Script execution failed';
        // Distinguish whitelist errors (400) from execution errors (500)
        const status =
          message.includes('not in the whitelist') || message.includes('not allowed') ? 403 : 500;
        res.status(status).json({ error: message });
      }
    },
  );

  /**
   * POST /api/exec/command
   * Send a command to a script. Blocked in READ_ONLY_MODE.
   */
  router.post(
    '/api/exec/command',
    requireJWT,
    requireScope('readwrite'),
    requireNotReadOnly,
    idempotencyMiddleware,
    async (req, res) => {
      const parsed = commandBodySchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Invalid request', details: parsed.error.flatten() });
        return;
      }

      try {
        const { scriptId, commandType, value, targetDeviceId, args } = parsed.data;
        const result = await runCommandScript({
          scriptId,
          commandType,
          ...(value !== undefined ? { value } : {}),
          ...(targetDeviceId !== undefined ? { targetDeviceId } : {}),
          args: args ?? {},
        });
        res.json(result);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Command execution failed';
        const status = message.includes('whitelist') || message.includes('not allowed') ? 403 : 500;
        res.status(status).json({ error: message });
      }
    },
  );

  return router;
}
