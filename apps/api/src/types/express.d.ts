// Augment Express Request with fields attached by our middleware.
declare global {
  namespace Express {
    interface Request {
      /** UUID set by configureRequestTracking(), echoed in X-Request-ID response header. */
      requestId: string;
    }
  }
}

export {};
