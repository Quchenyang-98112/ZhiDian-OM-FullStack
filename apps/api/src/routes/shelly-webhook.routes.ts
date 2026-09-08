/**
 * Shelly Webhook Route — receives push notifications from Shelly devices
 *
 * Shelly Gen2+ can be configured to POST state changes to a custom URL,
 * eliminating the need for constant polling. Configure on the device:
 *   Settings → Actions → URL Action → URL: http://<nexus-api>/api/shelly/webhook
 *
 * Payload format (Shelly Gen2+ notify_status):
 * ```json
 * {
 *   "src": "shellyem3-AABBCC",
 *   "dst": "nexus-hems",
 *   "method": "NotifyStatus",
 *   "params": { "ts": 1234567890.0, "em:0": { "total_act_power": 2450.3, ... } }
 * }
 * ```
 *
 * The received data is forwarded to the ShellyWebhookBus (EventEmitter) so that
 * polling-based ShellyRESTAdapter instances can reduce their poll interval once
 * webhook push is active for a device.
 *
 * Security:
 *   - Requires a valid JWT (requireJWT middleware)
 *   - Payload size capped at 64 KB via Express json() limit
 *   - Source IP validated against the configured device hosts (SSRF guard)
 */

import EventEmitter from 'node:events';
import type { Request } from 'express';
import { Router } from 'express';
import { z } from 'zod';
import { isPrivateHost } from '../config/private-host.js';
import { requireJWT, requireScope } from '../middleware/auth.js';

/** Normalize Express client IP (handles IPv4-mapped IPv6). */
function normalizeClientIp(ip: string): string {
  return ip.startsWith('::ffff:') ? ip.slice(7) : ip;
}

function isTrustedShellySource(req: Request): boolean {
  const raw = req.ip ?? req.socket.remoteAddress ?? '';
  const ip = normalizeClientIp(raw);
  if (!ip) return false;
  return isPrivateHost(ip);
}

// ─── Webhook Event Bus ────────────────────────────────────────────────

/**
 * Singleton EventEmitter for Shelly webhook events.
 * ShellyRESTAdapter instances can listen to 'update' events to skip the
 * next poll cycle when a fresh push payload is available.
 *
 * Usage: shellyWebhookBus.on('update', ({ src, params }) => { ... })
 */
export const shellyWebhookBus = new EventEmitter();
shellyWebhookBus.setMaxListeners(32);

// ─── Validation ───────────────────────────────────────────────────────

const shellyNotifySchema = z.object({
  src: z.string().min(1).max(128),
  dst: z.string().optional(),
  method: z.string().min(1),
  params: z.record(z.string(), z.unknown()),
});

// ─── Route ───────────────────────────────────────────────────────────

export function createShellyWebhookRoutes(): Router {
  const router = Router();

  /**
   * POST /api/shelly/webhook
   *
   * Receives Shelly Gen2+ notify_status push notifications.
   * Always returns 200 to prevent Shelly retry storms on auth errors.
   */
  router.post('/api/shelly/webhook', requireJWT, requireScope('readwrite'), (req, res) => {
    res.status(200).json({ ok: true });

    // SSRF guard: Shelly devices live on the local LAN — reject public-IP sources.
    if (!isTrustedShellySource(req)) {
      return;
    }

    const parsed = shellyNotifySchema.safeParse(req.body);
    if (!parsed.success) {
      // Don't log — Shelly sends many probe requests; silently ignore invalid
      return;
    }

    const { src, method, params } = parsed.data;

    if (method === 'NotifyStatus' || method === 'NotifyEvent') {
      shellyWebhookBus.emit('update', { src, method, params, receivedAt: Date.now() });
    }
  });

  return router;
}
