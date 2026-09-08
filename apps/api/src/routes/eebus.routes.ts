/**
 * EEBUS routes — SHIP device pairing + trust store management.
 *
 * Endpoints:
 *   GET    /api/eebus/discover               — list mDNS-discovered devices
 *   POST   /api/eebus/pair                   — initiate SHIP handshake
 *   POST   /api/eebus/pair/pin               — submit PIN for pin_required state
 *   GET    /api/eebus/pair/status/:ski       — poll SHIP connection state
 *   GET    /api/eebus/trust                  — list trusted devices
 *   DELETE /api/eebus/trust/:ski             — remove device from trust store
 *   POST   /api/eebus/discover/register      — register mDNS-discovered device (internal)
 *
 * All endpoints require JWT auth. Mutating endpoints require admin scope.
 */

import {
  type EEBUSDeviceInfo,
  EEBUSDiscoverRegisterSchema,
  EEBUSPairRequestSchema,
  EEBUSPinSubmitSchema,
  EEBUSRevocationConfigSchema,
} from '@nexus-hems/shared-types';
import { Router } from 'express';
import { getEebusRevocationConfig, setEebusRevocationConfig } from '../config/eebus-revocation.js';
import { isPrivateHost } from '../config/private-host.js';
import { logger } from '../core/logger.js';
import { requireJWT, requireScope } from '../middleware/auth.js';
import { requireNotReadOnly } from '../middleware/require-not-read-only.js';
import { getDevice, listDevices, removeDevice, upsertDevice } from '../services/EEBusTrustStore.js';
import {
  getHandshakeState,
  initiateHandshake,
  submitPin,
  terminateSession,
} from '../services/ShipHandshakeService.js';

export function createEebusRoutes(): Router {
  const router = Router();

  /** In-memory cache of mDNS-discovered EEBUS devices (populated by mDNS scan) */
  const eebusDeviceCache: Map<
    string,
    {
      ski: string;
      brand: string;
      model: string;
      deviceType: string;
      host: string;
      port: number;
      path: string;
      register: boolean;
    }
  > = new Map();

  // ── GET /api/eebus/discover ─────────────────────────────────────

  router.get('/api/eebus/discover', requireJWT, async (req, res) => {
    try {
      const trustedSkis = new Set((await listDevices()).map((d) => d.ski));
      const devices = Array.from(eebusDeviceCache.values()).map((d) => ({
        ...d,
        trusted: trustedSkis.has(d.ski),
      }));
      res.json(devices);
    } catch (err) {
      logger.error('EEBUS discovery error', {
        requestId: req.requestId,
        error: err instanceof Error ? err.message : String(err),
      });
      res.status(500).json({ error: 'Discovery failed' });
    }
  });

  // ── POST /api/eebus/pair ────────────────────────────────────────
  // Initiates SHIP handshake. Requires admin scope.

  router.post(
    '/api/eebus/pair',
    requireJWT,
    requireScope('admin'),
    requireNotReadOnly,
    async (req, res) => {
      const parsed = EEBUSPairRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ errors: parsed.error.issues });
        return;
      }

      const { ski } = parsed.data;

      // Check if already connected
      const existing = getHandshakeState(ski);
      if (existing?.state === 'connected') {
        res.status(200).json({ status: 'connected', ski, message: 'Already paired' });
        return;
      }
      if (existing?.state === 'pin_required') {
        res.status(202).json({
          status: 'pin_required',
          ski,
          message: 'Awaiting PIN submission',
          pinHint: existing.pinHint,
        });
        return;
      }

      // Resolve hostname from mDNS cache or trust store
      const cachedDevice = eebusDeviceCache.get(ski);
      const storedDevice = await getDevice(ski);
      const hostname = cachedDevice?.host ?? storedDevice?.hostname;
      const port = cachedDevice?.port ?? storedDevice?.port ?? 4712;

      if (!hostname) {
        res.status(404).json({
          error: 'Unknown SKI — device must be discovered via /api/eebus/discover first',
        });
        return;
      }

      // SSRF guard: reject non-private hosts
      if (!isPrivateHost(hostname)) {
        res.status(403).json({
          error: `Host "${hostname}" is not a private/local address. SHIP connections are restricted to local networks.`,
        });
        return;
      }

      // Initiate handshake asynchronously
      await initiateHandshake(ski, hostname, port);

      const state = getHandshakeState(ski);
      res.status(202).json({
        status: state?.state ?? 'tls_connecting',
        ski,
        message: 'SHIP handshake initiated',
        pinHint: state?.pinHint,
      });
    },
  );

  // ── POST /api/eebus/pair/pin ────────────────────────────────────

  router.post(
    '/api/eebus/pair/pin',
    requireJWT,
    requireScope('admin'),
    requireNotReadOnly,
    (req, res) => {
      const parsed = EEBUSPinSubmitSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ errors: parsed.error.issues });
        return;
      }

      const { ski, pin } = parsed.data;
      const ok = submitPin(ski, pin);
      if (!ok) {
        const entry = getHandshakeState(ski);
        if (!entry) {
          res.status(404).json({ error: 'No active pairing session for this SKI' });
          return;
        }
        res.status(409).json({
          error: `Cannot submit PIN in state: ${entry.state}`,
          state: entry.state,
        });
        return;
      }

      res.status(202).json({ status: 'pin_submitted', ski });
    },
  );

  // ── GET /api/eebus/pair/status/:ski ────────────────────────────

  router.get('/api/eebus/pair/status/:ski', requireJWT, (req, res) => {
    const ski = String(req.params.ski ?? '');
    if (!ski || !/^[0-9a-f]{4,128}$/i.test(ski)) {
      res.status(400).json({ error: 'Invalid SKI format' });
      return;
    }

    const entry = getHandshakeState(ski);
    if (!entry) {
      // No active session — check trust store for last known state
      getDevice(ski)
        .then((device) => {
          if (!device) {
            res.status(404).json({ error: 'No pairing session or trust store entry for this SKI' });
            return;
          }
          const status = device.status === 'trusted' ? 'connected' : 'failed';
          res.json({ status, ski, message: device.status });
        })
        .catch(() => res.status(500).json({ error: 'Trust store read failed' }));
      return;
    }

    res.json({
      status: entry.state,
      ski,
      message: entry.message,
      pinHint: entry.pinHint,
    });
  });

  // ── GET /api/eebus/trust ───────────────────────────────────────

  router.get('/api/eebus/trust', requireJWT, async (req, res) => {
    try {
      const devices = await listDevices();
      const response: EEBUSDeviceInfo[] = devices.map((d) => ({
        ski: d.ski,
        hostname: d.hostname,
        port: d.port,
        brand: d.brand,
        model: d.model,
        deviceType: d.deviceType,
        status: d.status,
        trustedAt: d.trustedAt,
        lastConnectedAt: d.lastConnectedAt,
      }));
      res.json(response);
    } catch (err) {
      logger.error('EEBUS trust store read error', {
        requestId: req.requestId,
        error: err instanceof Error ? err.message : String(err),
      });
      res.status(500).json({ error: 'Failed to read trust store' });
    }
  });

  // ── DELETE /api/eebus/trust/:ski ───────────────────────────────

  router.delete(
    '/api/eebus/trust/:ski',
    requireJWT,
    requireScope('admin'),
    requireNotReadOnly,
    async (req, res) => {
      const ski = String(req.params.ski ?? '');
      if (!ski || !/^[0-9a-f]{4,128}$/i.test(ski)) {
        res.status(400).json({ error: 'Invalid SKI format' });
        return;
      }

      const removed = await removeDevice(ski);
      if (!removed) {
        res.status(404).json({ error: 'Device not found in trust store' });
        return;
      }

      // Terminate any active session
      terminateSession(ski);

      res.status(204).end();
    },
  );

  // ── POST /api/eebus/discover/register ──────────────────────────
  // Register an mDNS-discovered device. Called by mDNS scanner (future feature).

  router.post(
    '/api/eebus/discover/register',
    requireJWT,
    requireScope('admin'),
    requireNotReadOnly,
    (req, res) => {
      const parsed = EEBUSDiscoverRegisterSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ errors: parsed.error.issues });
        return;
      }

      const { ski, host, port, brand, model, deviceType } = parsed.data;
      eebusDeviceCache.set(ski, {
        ski,
        host,
        port: port ?? 4712,
        brand: brand ?? '',
        model: model ?? '',
        deviceType: deviceType ?? '',
        path: '/ship/',
        register: true,
      });
      // Upsert trust store entry (pending, not yet paired)
      upsertDevice({
        ski,
        hostname: host,
        port: port ?? 4712,
        ...(brand !== undefined ? { brand } : {}),
        ...(model !== undefined ? { model } : {}),
        ...(deviceType !== undefined ? { deviceType } : {}),
        status: 'pending',
        trustedAt: 0,
      }).catch(() => {});
      res.status(201).json({ registered: true });
    },
  );

  // ── GET/PUT /api/eebus/tls/revocation ─────────────────────────────
  // Admin surface for OCSP/CRL policy (Milestone 2.2).

  router.get('/api/eebus/tls/revocation', requireJWT, requireScope('admin'), (_req, res) => {
    res.json(getEebusRevocationConfig());
  });

  router.put(
    '/api/eebus/tls/revocation',
    requireJWT,
    requireScope('admin'),
    requireNotReadOnly,
    (req, res) => {
      const parsed = EEBUSRevocationConfigSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ errors: parsed.error.issues });
        return;
      }
      if (parsed.data.mode === 'crl' && !parsed.data.crlUrl) {
        res.status(400).json({ error: 'crlUrl required when mode is crl' });
        return;
      }
      if (parsed.data.mode === 'ocsp' && !parsed.data.ocspUrl) {
        res.status(400).json({ error: 'ocspUrl required when mode is ocsp' });
        return;
      }
      setEebusRevocationConfig(parsed.data);
      res.json(getEebusRevocationConfig());
    },
  );

  return router;
}
