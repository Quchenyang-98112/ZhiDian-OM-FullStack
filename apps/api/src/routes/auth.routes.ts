import { AuthTokenRequestSchema } from '@nexus-hems/shared-types';
import crypto from 'crypto';
import { Router } from 'express';
import { reloadJwtKeysFromEnv, revokeToken, signToken, verifyToken } from '../jwt-utils.js';
import type { JWTScope } from '../middleware/auth.js';
import { clampScope, requireJWT, requireScope, validateApiKey } from '../middleware/auth.js';
import { serverStartTime } from '../middleware/metrics.js';
import { wsTicketStore } from '../services/ws-ticket-store.js';

const JWT_EXPIRY = '24h';

export function createAuthRoutes(): Router {
  const router = Router();

  // LOW-02 fix: initKeys() is called once in server/index.ts — do NOT call it here again

  // ─── Health check (no auth required — load balancer needs it) ────
  // MED-05 fix: Removed JWT key metadata (kid, rotationDueIn) from health response
  router.get('/api/health', (_req, res) => {
    const adapters = ['victron-mqtt', 'modbus-sunspec', 'knx', 'ocpp', 'eebus'];
    res.json({
      status: 'ok',
      uptime: Math.floor((Date.now() - serverStartTime) / 1000),
      adapters: adapters.map((a) => ({ id: a, status: 'connected' })),
    });
  });

  // ─── JWT Token Endpoint ──────────────────────────────────────────
  // CRIT-01 fix: Scope is clamped to the maximum allowed for the given API key.
  // API_KEY_SCOPES env var: "key:scope,key2:scope2" — defaults to 'readwrite' if unset.
  router.post('/api/auth/token', async (req, res) => {
    const parsed = AuthTokenRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ errors: parsed.error.issues });
      return;
    }

    const { clientId, apiKey, scope } = parsed.data;

    // Validate API key (enforced in production, optional in dev)
    if (!validateApiKey(apiKey)) {
      res.status(401).json({ error: 'Invalid or missing API key' });
      return;
    }

    // CRIT-01: Clamp scope to maximum allowed for this API key
    const grantedScope = clampScope(scope as JWTScope | undefined, apiKey ?? '');
    const token = await signToken({ sub: clientId, scope: grantedScope }, JWT_EXPIRY);
    res.json({ token, expiresIn: JWT_EXPIRY, scope: grantedScope });
  });

  // ─── JWT Token Refresh ───────────────────────────────────────────
  // MED-02: New tokens include jti; old token's jti is not revoked (not logout)
  router.post('/api/auth/refresh', async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Missing Authorization header' });
      return;
    }
    try {
      const decoded = await verifyToken(authHeader.slice(7));
      const token = await signToken({ sub: decoded.sub, scope: decoded.scope }, JWT_EXPIRY);
      res.json({ token, expiresIn: JWT_EXPIRY });
    } catch {
      res.status(401).json({ error: 'Invalid or expired token' });
    }
  });

  // ─── JWT Token Revocation ────────────────────────────────────────
  // MED-02 fix: Revoke a specific token by its jti claim.
  // Requires readwrite scope minimum (own token revocation) or admin for others.
  router.post('/api/auth/revoke', requireJWT, requireScope('readwrite'), async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      res.status(400).json({ error: 'Missing token to revoke' });
      return;
    }
    try {
      const decoded = await verifyToken(authHeader.slice(7));
      if (decoded.jti && decoded.exp) {
        await revokeToken(decoded.jti, decoded.exp * 1000);
        res.json({ revoked: true });
      } else {
        res.status(400).json({ error: 'Token has no jti claim — cannot revoke' });
      }
    } catch {
      res.status(401).json({ error: 'Invalid token' });
    }
  });

  // ─── JWT key reload (HIGH-07 zero-downtime rotation) ─────────────
  router.post('/api/auth/rotate-key', requireJWT, requireScope('admin'), (_req, res) => {
    try {
      const result = reloadJwtKeysFromEnv();
      res.json({ ok: true, ...result });
    } catch (err) {
      console.error('[Auth] rotate-key failed:', (err as Error).message);
      res.status(500).json({ error: 'JWT key reload failed' });
    }
  });

  // ─── WebSocket Ticket Endpoint ───────────────────────────────────
  // HIGH-04 fix: Issues a short-lived (60s) single-use WS ticket.
  // Browser connects via wss://...?ticket=<uuid> — the JWT never appears in URL logs.
  router.post('/api/auth/ws-ticket', requireJWT, async (_req, res) => {
    const payload = res.locals.jwtPayload as { sub?: string; scope?: string } | undefined;
    const clientId = payload?.sub ?? 'unknown';
    const scope = (
      ['read', 'readwrite', 'admin'].includes(payload?.scope ?? '') ? payload!.scope : 'readwrite'
    ) as JWTScope;

    const ticket = crypto.randomUUID();
    await wsTicketStore.issue(ticket, {
      clientId,
      scope,
      expiresAt: Date.now() + 60_000,
    });

    res.json({ ticket, expiresIn: 60 });
  });

  return router;
}

export { JWT_EXPIRY };
