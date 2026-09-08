/**
 * OpenADR 3.1.0 OAuth2 Proxy Routes
 *
 * Proxies VEN-to-VTN communication to prevent SSRF and keep VTN credentials
 * server-side. The frontend OpenADR31Adapter calls these endpoints instead of
 * contacting the VTN directly.
 *
 * Endpoints:
 *   POST   /api/openadr/token                     — OAuth2 client-credentials token fetch
 *   GET    /api/openadr/events                    — Fetch events from VTN
 *   POST   /api/openadr/events/:eventId/acknowledge — Acknowledge an event
 *   POST   /api/openadr/reports                   — Submit a telemetry report
 *
 * Security:
 *   - All endpoints require `requireJWT` (NEXUS-hems session token)
 *   - The VTN URL is read from `OPENADR_VTN_URL` env var (not user-supplied)
 *   - SSRF protection: only the environment-configured VTN URL is contacted
 *   - Rate limit: 60 req/min (via global API rate limiter)
 *   - VTN client credentials are in `OPENADR_CLIENT_ID` + `OPENADR_CLIENT_SECRET`
 *
 * References:
 *   - docs/OpenADR-Integration-Guide.md
 *   - docs/adr/ADR-012-openadr-ven-client.md
 */

import { type Request, type Response, Router } from 'express';
import http from 'http';
import https from 'https';
import { URL } from 'url';
import { logger } from '../core/logger.js';
import { requireJWT } from '../middleware/auth.js';
import { requireNotReadOnly } from '../middleware/require-not-read-only.js';

// ─── VTN Configuration ────────────────────────────────────────────────

/**
 * Validate and return the configured VTN base URL.
 * Returns null if `OPENADR_VTN_URL` is not set or is not a valid HTTPS URL.
 * The only allowed schemes are https: (prod) and http: (when OPENADR_VTN_URL
 * points to localhost, for local integration testing).
 */
function getVTNBaseUrl(): URL | null {
  const raw = process.env.OPENADR_VTN_URL ?? '';
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    if (parsed.protocol === 'https:') return parsed;
    // Allow http: only for localhost integration testing, never for production
    if (parsed.protocol === 'http:' && parsed.hostname === 'localhost') return parsed;
    return null;
  } catch {
    return null;
  }
}

const VTN_CLIENT_ID = process.env.OPENADR_CLIENT_ID ?? '';
const VTN_CLIENT_SECRET = process.env.OPENADR_CLIENT_SECRET ?? '';

// ─── In-memory token cache (per-server process) ───────────────────────

interface CachedToken {
  accessToken: string;
  expiresAt: number; // Unix ms
}

let cachedToken: CachedToken | null = null;

/** Demo-mode webhook event buffer (VTN push simulation). */
const webhookEventBuffer: unknown[] = [];

// ─── Minimal fetch helper using Node.js built-in http/https ──────────

interface FetchResult {
  status: number;
  body: string;
}

const VTN_FETCH_TIMEOUT_MS = 15_000;

function nodeFetch(
  url: URL,
  options: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  },
): Promise<FetchResult> {
  return new Promise((resolve, reject) => {
    const lib = url.protocol === 'https:' ? https : http;
    const reqOptions = {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname + url.search,
      method: options.method ?? 'GET',
      headers: options.headers ?? {},
      timeout: VTN_FETCH_TIMEOUT_MS,
    };

    const req = lib.request(reqOptions, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () =>
        resolve({
          status: res.statusCode ?? 0,
          body: Buffer.concat(chunks).toString(),
        }),
      );
    });

    req.on('timeout', () => {
      req.destroy(new Error(`VTN request timed out after ${VTN_FETCH_TIMEOUT_MS}ms`));
    });
    req.on('error', reject);

    if (options.body) req.write(options.body);
    req.end();
  });
}

// ─── Token management ─────────────────────────────────────────────────

async function fetchVTNToken(vtnUrl: URL): Promise<string> {
  // Return cached token if still valid (30s margin)
  if (cachedToken && Date.now() < cachedToken.expiresAt - 30_000) {
    return cachedToken.accessToken;
  }

  const tokenUrl = new URL('/oauth2/token', vtnUrl);
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: VTN_CLIENT_ID,
    client_secret: VTN_CLIENT_SECRET,
    scope: 'read:events write:reports',
  }).toString();

  const result = await nodeFetch(tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': String(Buffer.byteLength(body)),
    },
    body,
  });

  if (result.status !== 200) {
    throw new Error(`VTN token fetch failed: ${result.status}`);
  }

  const data = JSON.parse(result.body) as Record<string, unknown>;
  const accessToken = String(data.access_token ?? '');
  const expiresIn = Number(data.expires_in ?? 3600);

  if (!accessToken) throw new Error('VTN token response missing access_token');

  cachedToken = { accessToken, expiresAt: Date.now() + expiresIn * 1000 };
  return accessToken;
}

// ─── Router factory ───────────────────────────────────────────────────

export function createOpenADRRoutes(): Router {
  const router = Router();

  /**
   * GET /api/openadr/programs
   * Lists DR programs from the VTN (demo list when VTN is not configured).
   */
  router.get('/api/openadr/programs', requireJWT, async (req: Request, res: Response) => {
    const vtnUrl = getVTNBaseUrl();

    if (!vtnUrl) {
      res.json([
        {
          id: 'nexus-hems-program',
          programName: 'Nexus HEMS Demo Program',
          payloadDescriptors: [{ payloadType: 'LOAD_CONTROL' }, { payloadType: 'SIMPLE' }],
        },
      ]);
      return;
    }

    try {
      const token = await fetchVTNToken(vtnUrl);
      const programsUrl = new URL('/openadr3/programs', vtnUrl);
      const result = await nodeFetch(programsUrl, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
      });

      if (result.status !== 200) {
        res.status(result.status).json({ error: `VTN programs fetch failed: ${result.status}` });
        return;
      }

      res.json(JSON.parse(result.body) as unknown);
    } catch (err) {
      logger.error('OpenADR programs fetch error', {
        requestId: req.requestId,
        error: err instanceof Error ? err.message : String(err),
      });
      res.status(502).json({ error: 'VTN programs fetch failed' });
    }
  });

  /**
   * POST /api/openadr/webhook
   * VTN push webhook for new/updated DR events (demo buffer when VTN is not configured).
   */
  router.post(
    '/api/openadr/webhook',
    requireJWT,
    requireNotReadOnly,
    async (req: Request, res: Response) => {
      const vtnUrl = getVTNBaseUrl();

      if (!vtnUrl) {
        webhookEventBuffer.push(req.body);
        if (webhookEventBuffer.length > 100) webhookEventBuffer.shift();
        res
          .status(202)
          .json({ accepted: true, note: 'demo-mode', buffered: webhookEventBuffer.length });
        return;
      }

      try {
        const token = await fetchVTNToken(vtnUrl);
        const webhookUrl = new URL('/openadr3/subscriptions/webhook', vtnUrl);
        const body = JSON.stringify(req.body);
        const result = await nodeFetch(webhookUrl, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            'Content-Length': String(Buffer.byteLength(body)),
          },
          body,
        });

        res
          .status(result.status < 300 ? 202 : result.status)
          .json(
            result.status < 300
              ? { accepted: true }
              : { error: `VTN webhook failed: ${result.status}` },
          );
      } catch (err) {
        logger.error('OpenADR webhook error', {
          requestId: req.requestId,
          error: err instanceof Error ? err.message : String(err),
        });
        res.status(502).json({ error: 'VTN webhook relay failed' });
      }
    },
  );

  /**
   * GET /api/openadr/webhook/events
   * Returns demo webhook buffer (only when VTN is not configured).
   */
  router.get('/api/openadr/webhook/events', requireJWT, (_req: Request, res: Response) => {
    const vtnUrl = getVTNBaseUrl();
    if (vtnUrl) {
      res.status(404).json({ error: 'Webhook buffer only available in demo mode' });
      return;
    }
    res.json(webhookEventBuffer);
  });

  /**
   * POST /api/openadr/token
   * Returns an OAuth2 token scoped to the NEXUS HEMS VEN.
   * The frontend receives this token for subsequent /events and /reports calls.
   * The real client credentials are never exposed to the browser.
   */
  router.post('/api/openadr/token', requireJWT, async (req: Request, res: Response) => {
    const vtnUrl = getVTNBaseUrl();

    if (!vtnUrl || !VTN_CLIENT_ID || !VTN_CLIENT_SECRET) {
      // Return a synthetic token for demo/test environments
      res.json({
        access_token: 'nexus-openadr-demo-token',
        token_type: 'Bearer',
        expires_in: 3600,
        scope: 'read:events write:reports',
      });
      return;
    }

    try {
      const token = await fetchVTNToken(vtnUrl);
      res.json({
        access_token: token,
        token_type: 'Bearer',
        expires_in: Math.max(0, Math.floor((cachedToken!.expiresAt - Date.now()) / 1000)),
        scope: 'read:events write:reports',
      });
    } catch (err) {
      logger.error('OpenADR token fetch error', {
        requestId: req.requestId,
        error: err instanceof Error ? err.message : String(err),
      });
      res.status(502).json({ error: 'VTN token fetch failed' });
    }
  });

  /**
   * GET /api/openadr/events?programId=...
   * Proxies event fetch from the VTN, filtered by programId.
   * Returns demo events when OPENADR_VTN_URL is not configured.
   */
  router.get('/api/openadr/events', requireJWT, async (req: Request, res: Response) => {
    const vtnUrl = getVTNBaseUrl();
    const programId = String(req.query.programId ?? 'nexus-hems-program');

    if (!vtnUrl) {
      // Demo mode: return a synthetic LOAD_CONTROL event
      const now = new Date();
      const inOneHour = new Date(now.getTime() + 3600_000);
      res.json([
        {
          id: 'demo-event-001',
          eventName: 'DemoLoadControl',
          priority: 1,
          programID: programId,
          payloadDescriptors: [{ payloadType: 'LOAD_CONTROL', units: 'W' }],
          intervalPeriod: {
            start: now.toISOString(),
            duration: 'PT1H',
          },
          intervals: [
            {
              id: 0,
              payloads: [
                { type: 'EV_MAX_POWER_W', values: [4140] }, // §14a: ~70% curtailment
                { type: 'HVAC_MAX_POWER_W', values: [2000] },
              ],
            },
          ],
          createdDateTime: now.toISOString(),
          modificationDateTime: inOneHour.toISOString(),
        },
      ]);
      return;
    }

    try {
      const token = await fetchVTNToken(vtnUrl);
      const eventsUrl = new URL(
        `/openadr3/programs/${encodeURIComponent(programId)}/events`,
        vtnUrl,
      );
      const result = await nodeFetch(eventsUrl, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
      });

      if (result.status !== 200) {
        res.status(result.status).json({ error: `VTN events fetch failed: ${result.status}` });
        return;
      }

      // Forward the parsed JSON — never forward raw headers from VTN (security)
      const events: unknown = JSON.parse(result.body);
      res.json(events);
    } catch (err) {
      logger.error('OpenADR events fetch error', {
        requestId: req.requestId,
        error: err instanceof Error ? err.message : String(err),
      });
      res.status(502).json({ error: 'VTN events fetch failed' });
    }
  });

  /**
   * POST /api/openadr/events/:eventId/acknowledge
   * Proxies an event acknowledgment (opt-in / opt-out) to the VTN.
   */
  router.post(
    '/api/openadr/events/:eventId/acknowledge',
    requireJWT,
    requireNotReadOnly,
    async (req: Request, res: Response) => {
      const vtnUrl = getVTNBaseUrl();
      // req.params values are always strings for named route parameters
      const eventId = String(req.params.eventId ?? '');

      // Validate: eventId must be alphanumeric/dash (prevent path traversal)
      if (!/^[\w-]{1,128}$/.test(eventId)) {
        res.status(400).json({ error: 'Invalid eventId format' });
        return;
      }

      if (!vtnUrl) {
        res.json({ acknowledged: true, note: 'demo-mode' });
        return;
      }

      try {
        const token = await fetchVTNToken(vtnUrl);
        const ackUrl = new URL(
          `/openadr3/events/${encodeURIComponent(eventId)}/subscriptions`,
          vtnUrl,
        );
        const body = JSON.stringify(req.body);

        const result = await nodeFetch(ackUrl, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            'Content-Length': String(Buffer.byteLength(body)),
          },
          body,
        });

        res
          .status(result.status)
          .json(
            result.status < 300
              ? { acknowledged: true }
              : { error: `VTN ack failed: ${result.status}` },
          );
      } catch (err) {
        logger.error('OpenADR ack error', {
          requestId: req.requestId,
          eventId,
          error: err instanceof Error ? err.message : String(err),
        });
        res.status(502).json({ error: 'VTN acknowledge failed' });
      }
    },
  );

  /**
   * POST /api/openadr/reports
   * Proxies a telemetry report from the VEN to the VTN.
   */
  router.post(
    '/api/openadr/reports',
    requireJWT,
    requireNotReadOnly,
    async (req: Request, res: Response) => {
      const vtnUrl = getVTNBaseUrl();

      if (!vtnUrl) {
        res.json({ id: 'demo-report-001', note: 'demo-mode' });
        return;
      }

      try {
        const token = await fetchVTNToken(vtnUrl);
        const reportsUrl = new URL('/openadr3/reports', vtnUrl);
        const body = JSON.stringify(req.body);

        const result = await nodeFetch(reportsUrl, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            'Content-Length': String(Buffer.byteLength(body)),
          },
          body,
        });

        if (result.status < 300) {
          res.status(201).json(JSON.parse(result.body) as unknown);
        } else {
          res
            .status(result.status)
            .json({ error: `VTN report submission failed: ${result.status}` });
        }
      } catch (err) {
        logger.error('OpenADR report error', {
          requestId: req.requestId,
          error: err instanceof Error ? err.message : String(err),
        });
        res.status(502).json({ error: 'VTN report submission failed' });
      }
    },
  );

  return router;
}
