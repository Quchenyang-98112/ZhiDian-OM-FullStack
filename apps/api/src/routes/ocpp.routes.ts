/**
 * OCPP routes — Security Profile 3 mTLS proxy session management.
 *
 * Endpoints:
 *   POST /api/ocpp/proxy-session — issue short-lived session for /ws/ocpp relay
 *
 * Mutating endpoints require readwrite JWT scope.
 */

import { OcppProxySessionRequestSchema } from '@nexus-hems/shared-types';
import crypto from 'crypto';
import { Router } from 'express';
import { isPrivateHost } from '../config/private-host.js';
import { requireJWT, requireScope } from '../middleware/auth.js';
import { idempotencyMiddleware } from '../middleware/idempotency.js';
import { requireNotReadOnly } from '../middleware/require-not-read-only.js';
import { ocppSessionStore } from '../services/ocpp-session-store.js';

const PEM_BEGIN = '-----BEGIN ';

function hasPemMaterial(value?: string): boolean {
  if (!value?.trim()) return false;
  const trimmed = value.trim();
  return trimmed.startsWith(PEM_BEGIN) || /^[A-Za-z0-9+/=\s]+$/.test(trimmed);
}

export function createOcppRoutes(): Router {
  const router = Router();

  router.post(
    '/api/ocpp/proxy-session',
    requireJWT,
    requireScope('readwrite'),
    requireNotReadOnly,
    idempotencyMiddleware,
    async (req, res) => {
      const parsed = OcppProxySessionRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ errors: parsed.error.issues });
        return;
      }

      const { host, port, stationId, clientCert, clientKey, caCert, revocationCheck } = parsed.data;

      if (!isPrivateHost(host)) {
        res.status(400).json({ error: 'Host must be a private/local network address' });
        return;
      }

      if (!hasPemMaterial(clientCert) || !hasPemMaterial(clientKey)) {
        res.status(400).json({ error: 'clientCert and clientKey must contain valid PEM material' });
        return;
      }

      const mode = revocationCheck ?? 'off';
      if (mode === 'crl' && !hasPemMaterial(caCert)) {
        res
          .status(400)
          .json({ error: 'CRL revocation check requires caCert (CA or CRL PEM bundle)' });
        return;
      }

      const payload = res.locals.jwtPayload as { sub?: string } | undefined;
      const clientId = payload?.sub ?? 'unknown';
      const sessionId = crypto.randomUUID();

      await ocppSessionStore.issue(sessionId, {
        host,
        port,
        stationId,
        clientCert,
        clientKey,
        ...(caCert ? { caCert } : {}),
        ...(revocationCheck ? { revocationCheck } : {}),
        clientId,
        expiresAt: Date.now() + 60_000,
      });

      res.json({ sessionId, expiresIn: 60 });
    },
  );

  return router;
}
