/**
 * Health check endpoint — reports server status and protocol adapter health.
 *
 * Returns 200 when the server is healthy (mock mode or all configured adapters
 * are healthy). Returns 503 when effective adapter mode is live and no adapters
 * are configured, or when any configured adapter failed to start.
 */

import { Router } from 'express';
import { isReadOnlyMode } from '../config/read-only-mode.js';
import { getAdapterHealthSummary } from '../protocols/index.js';

/** Factory for unauthenticated `/api/health` routes. */
export function createHealthRoutes(): Router {
  const router = Router();

  router.get('/api/health', (_req, res) => {
    const health = getAdapterHealthSummary();
    const statusCode = health.overall === 'healthy' ? 200 : 503;

    res.status(statusCode).json({
      status: health.overall,
      mode: health.mode,
      readOnly: isReadOnlyMode(),
      timestamp: new Date().toISOString(),
      adapters: health.adapters,
    });
  });

  return router;
}
