import type { NextFunction, Request, Response } from 'express';
import { isReadOnlyMode } from '../config/read-only-mode.js';
import { logger } from '../core/logger.js';

/**
 * Express middleware that rejects hardware-affecting mutations when
 * READ_ONLY_MODE=true is set. Place this BEFORE the route handler and
 * AFTER requireJWT / requireScope.
 *
 * Returns 403 with a clear safety message and logs the rejection.
 */
export function requireNotReadOnly(req: Request, res: Response, next: NextFunction): void {
  if (isReadOnlyMode()) {
    logger.warn('READ_ONLY_MODE blocked mutating request', {
      requestId: req.requestId,
      method: req.method,
      path: req.path,
    });
    res.status(403).json({
      error: 'READ_ONLY_MODE=true blocks all hardware control commands',
      readOnly: true,
    });
    return;
  }
  next();
}
