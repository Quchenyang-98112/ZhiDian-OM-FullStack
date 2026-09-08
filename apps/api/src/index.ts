import { readFileSync } from 'node:fs';
import path from 'node:path';
import express from 'express';
import http from 'http';
import { WebSocketServer } from 'ws';
import { logAdapterModeStartup } from './config/adapter-mode.js';
import { validateProductionAuthConfig } from './config/auth-config.js';
import { extractCspNonceFromIndexHtml } from './config/csp-nonce.js';
import { logReadOnlyModeStartup } from './config/read-only-mode.js';
import { isDevRuntime, warnIfNodeEnvUnset } from './config/runtime-env.js';
import { logTrustProxyWarning, resolveTrustProxy } from './config/trust-proxy.js';
import { isAllowedWsOrigin, parseWsOrigins, validateWsOrigins } from './config/ws-origins.js';
import { eventBus } from './core/EventBus.js';
import { logger } from './core/logger.js';
import { initKeys } from './jwt-utils.js';
import { warnIfProductionBypass } from './middleware/auth.js';
import {
  configureCors,
  configureHelmet,
  configureRateLimiting,
  configureRequestTracking,
} from './middleware/security.js';
import { startProtocolAdapters, stopProtocolAdapters } from './protocols/index.js';
import { createAuthRoutes } from './routes/auth.routes.js';
import { createCommandsRoutes } from './routes/commands.routes.js';
import { createEebusRoutes } from './routes/eebus.routes.js';
import { createExecRoutes } from './routes/exec.routes.js';
import { createGrafanaRoutes } from './routes/grafana.routes.js';
import { createHealthRoutes } from './routes/health.routes.js';
import { createHistoryRoutes } from './routes/history.routes.js';
import { createMetricsRoutes } from './routes/metrics.routes.js';
import { createModbusRoutes } from './routes/modbus.routes.js';
import { createOcppRoutes } from './routes/ocpp.routes.js';
import { createOpenADRRoutes } from './routes/openadr.routes.js';
import { createSharesRoutes } from './routes/shares.routes.js';
import { createShellyWebhookRoutes } from './routes/shelly-webhook.routes.js';
import { createSyncRoutes } from './routes/sync.routes.js';
import { EnergyRouterService } from './services/EnergyRouterService.js';
import { liveEnergyAggregator } from './services/LiveEnergyAggregator.js';
import { TimeseriesService } from './services/TimeseriesService.js';
import { setupWebSocket } from './ws/energy.ws.js';

export async function startServer(): Promise<void> {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;
  const isDev = isDevRuntime();
  warnIfNodeEnvUnset();

  // ─── JWT Key Initialization ───────────────────────────────────────
  validateProductionAuthConfig();
  validateWsOrigins();
  initKeys();
  logAdapterModeStartup();
  logReadOnlyModeStartup();
  warnIfProductionBypass();

  // ─── Security Middleware ──────────────────────────────────────────
  configureCors(app);
  app.set('trust proxy', resolveTrustProxy());
  logTrustProxyWarning();
  app.disable('x-powered-by');
  configureRequestTracking(app);

  // Extract build-time nonce baked into the production index.html so the
  // HTTP CSP header can include it and allow Vite's inline theme-loader /
  // SPA-redirect / recovery-UI scripts (HTTP header overrides meta CSP).
  let buildNonce: string | undefined;
  if (!isDev) {
    try {
      const webDist = path.resolve(process.env.WEB_DIST_PATH ?? '../web/dist');
      const html = readFileSync(path.join(webDist, 'index.html'), 'utf8');
      buildNonce = extractCspNonceFromIndexHtml(html);
    } catch {
      // Built HTML not available yet — inline scripts will be blocked until
      // the web package is built and WEB_DIST_PATH is set correctly.
    }
  }

  configureHelmet(app, isDev, buildNonce);
  configureRateLimiting(app, isDev);

  // Parse JSON for POST routes (64kb allows OCPP mTLS PEM bundles via proxy-session)
  app.use(express.json({ limit: '64kb' }));

  // ─── HTTP Server + WebSocket ──────────────────────────────────────
  const server = http.createServer(app);

  // CSWSH guard (CWE-346): reject cross-origin browser WebSocket upgrades. The
  // browser sends the page Origin on the handshake; a foreign Origin that is not
  // in the WS_ORIGINS allowlist is rejected before the socket opens. A *missing*
  // Origin (non-browser clients: CLI relays, charge points) is allowed — those
  // still authenticate downstream via single-use ticket / JWT. In dev with no
  // allowlist configured we do not block local tooling.
  const wsOriginAllowlist = parseWsOrigins(process.env.WS_ORIGINS);
  const wss = new WebSocketServer({
    server,
    maxPayload: 64 * 1024,
    verifyClient: ({ origin }, cb) => {
      if (!origin) {
        cb(true);
        return;
      }
      if (isAllowedWsOrigin(origin, wsOriginAllowlist)) {
        cb(true);
        return;
      }
      if (isDev && wsOriginAllowlist.length === 0) {
        cb(true);
        return;
      }
      logger.warn('Rejected WebSocket upgrade from disallowed origin', { origin });
      cb(false, 403, 'Forbidden origin');
    },
  });

  // ─── Routes ───────────────────────────────────────────────────────
  app.use(createAuthRoutes());
  app.use(createSharesRoutes());
  app.use(createEebusRoutes());
  app.use(createOcppRoutes());
  app.use(createExecRoutes());
  app.use(createShellyWebhookRoutes());
  app.use(createOpenADRRoutes());
  app.use(createMetricsRoutes(wss));
  app.use(createGrafanaRoutes());
  app.use(createHealthRoutes());
  app.use(createSyncRoutes());
  app.use(createCommandsRoutes());
  app.use(createModbusRoutes());
  app.use('/api/v1', createHistoryRoutes());

  // ─── WebSocket Handler ────────────────────────────────────────────
  // HIGH-17: the live-energy aggregator folds EventBus datapoints into the
  // EnergyData snapshot the gateway broadcasts in live mode (ADR-018).
  setupWebSocket(wss, liveEnergyAggregator);

  // ─── Time-Series Service (InfluxDB + WAL) ─────────────────────────
  const timeseriesService = new TimeseriesService();
  eventBus.subscribe('timeseries', timeseriesService);

  // ─── Live energy snapshot (HIGH-17 EventBus → WebSocket bridge) ────
  eventBus.subscribe('live-energy', liveEnergyAggregator);
  await timeseriesService.recoverWAL().catch((err: unknown) => {
    logger.warn('WAL recovery failed', { error: err instanceof Error ? err.message : String(err) });
  });

  // ─── Energy Router (Day-Ahead LP optimizer) ───────────────────────
  const energyRouter = new EnergyRouterService(eventBus);
  await energyRouter.start().catch((err: unknown) => {
    logger.warn('EnergyRouterService start failed', {
      error: err instanceof Error ? err.message : String(err),
    });
  });

  // ─── Protocol Adapters ────────────────────────────────────────────
  await startProtocolAdapters(eventBus).catch((err: unknown) => {
    logger.warn('Protocol adapter startup error', {
      error: err instanceof Error ? err.message : String(err),
    });
  });

  // ─── Static serving for production ───────────────────────────────
  if (!isDev) {
    app.use(express.static(process.env.WEB_DIST_PATH ?? '../web/dist'));
  }

  server.listen(PORT, '0.0.0.0', () => {
    logger.info('Server running', { port: PORT });
  });

  // ─── Graceful Shutdown ────────────────────────────────────────────
  const shutdown = async (): Promise<void> => {
    logger.info('Server shutting down');
    energyRouter.stop();
    await stopProtocolAdapters();
    await timeseriesService.destroy();
    eventBus.destroy();
    server.close();
  };

  process.once('SIGTERM', () => void shutdown());
  process.once('SIGINT', () => void shutdown());
}
