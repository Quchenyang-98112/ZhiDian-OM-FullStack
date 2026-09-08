import cors from 'cors';
import crypto from 'crypto';
import type { Express, NextFunction, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { buildProductionScriptSrc, buildProductionStyleSrc } from '../config/csp-nonce.js';
import { isProductionRuntime } from '../config/runtime-env.js';

// ─── CORS — Origin Whitelist ─────────────────────────────────────────

export function configureCors(app: Express): void {
  const isProduction = isProductionRuntime();
  const ALLOWED_ORIGINS = (process.env.CORS_ORIGINS || '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  // HIGH-08: Localhost origins are ONLY included in non-production environments.
  // Including localhost in production CORS enables CSRF-style attacks from any website
  // against users whose browsers route localhost to the HEMS server.
  const LOCALHOST_ORIGINS = [
    'http://localhost:3000',
    'http://localhost:5173',
    'http://localhost:4173',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:5173',
    'http://127.0.0.1:4173',
  ];
  const STATIC_PRODUCTION_ORIGINS = ['https://qnbs.github.io'];

  const defaultOrigins = isProduction
    ? STATIC_PRODUCTION_ORIGINS
    : [...LOCALHOST_ORIGINS, ...STATIC_PRODUCTION_ORIGINS];

  const allowedOriginSet = new Set([...defaultOrigins, ...ALLOWED_ORIGINS]);

  // HIGH-04: In production, remove any loopback / LAN origins that may have been
  // injected via CORS_ORIGINS env var (defence-in-depth against misconfiguration)
  if (isProduction) {
    const loopbackTokens = ['localhost', '127.', '[::1]', '0.0.0.0'];
    for (const origin of allowedOriginSet) {
      if (loopbackTokens.some((t) => origin.includes(t))) {
        allowedOriginSet.delete(origin);
        console.warn(`[CORS] Removed loopback origin from production allowlist: ${origin}`);
      }
    }
  }

  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin || allowedOriginSet.has(origin)) {
          callback(null, true);
        } else {
          callback(new Error('Not allowed by CORS'));
        }
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
      allowedHeaders: ['Content-Type', 'Authorization'],
      maxAge: 86400,
    }),
  );
}

// ─── Request ID Tracking ─────────────────────────────────────────────
// Adds X-Request-ID to every request/response for audit trail correlation.
// If the client already sends one (reverse-proxy scenario), it is preserved.

export function configureRequestTracking(app: Express): void {
  app.use((req: Request, res: Response, next: NextFunction): void => {
    const incoming = req.headers['x-request-id'];
    const requestId = typeof incoming === 'string' ? incoming : crypto.randomUUID();
    req.requestId = requestId;
    res.setHeader('X-Request-ID', requestId);
    next();
  });
}

// ─── Security Headers (Helmet + Permissions-Policy) ──────────────────

// buildNonce: the nonce baked into the production index.html at build time by
// cspNoncePlugin (vite.config.ts). Passed here so the HTTP CSP header allows
// the inline theme-loader, SPA-redirect, and recovery-UI scripts that Vite
// embeds with nonce="<value>" — without it those scripts are blocked when
// Express serves the static HTML (HTTP header overrides the meta CSP tag).
//
// AUD-02: production drops style-src 'unsafe-inline' when buildNonce is present
// (matches GitHub Pages meta CSP). Dev keeps unsafe-inline for Vite HMR.
export function configureHelmet(app: Express, isDev: boolean, buildNonce?: string): void {
  // Production CSP: configurable WebSocket origins via WS_ORIGINS env var.
  // No more blanket ws://localhost:* in production.
  const wsOrigins = (process.env.WS_ORIGINS || '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  app.use(
    helmet({
      contentSecurityPolicy: isDev
        ? {
            directives: {
              defaultSrc: ["'self'"],
              scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
              styleSrc: ["'self'", "'unsafe-inline'"],
              imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
              connectSrc: ["'self'", 'ws:', 'wss:', 'http:', 'https:'],
              fontSrc: ["'self'"],
              workerSrc: ["'self'"],
              objectSrc: ["'none'"],
              baseUri: ["'self'"],
              formAction: ["'self'"],
              upgradeInsecureRequests: null,
            },
          }
        : {
            directives: {
              defaultSrc: ["'self'"],
              scriptSrc: buildProductionScriptSrc(buildNonce),
              styleSrc: buildProductionStyleSrc(buildNonce),
              imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
              connectSrc: [
                "'self'",
                ...wsOrigins,
                'https://api.tibber.com',
                'https://api.awattar.at',
                'https://api.awattar.de',
                'https://api.octopus.energy',
                'https://api.open-meteo.com',
                'https://generativelanguage.googleapis.com',
                'https://api.openai.com',
                'https://api.anthropic.com',
                'https://api.x.ai',
                'https://api.groq.com',
              ],
              fontSrc: ["'self'"],
              workerSrc: ["'self'"],
              objectSrc: ["'none'"],
              frameAncestors: ["'none'"],
              baseUri: ["'self'"],
              formAction: ["'self'"],
              upgradeInsecureRequests: [],
            },
          },
      crossOriginEmbedderPolicy: { policy: 'credentialless' },
      hsts: isDev ? false : { maxAge: 31536000, includeSubDomains: true, preload: true },
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
      xFrameOptions: { action: 'deny' },
    }),
  );

  // Permissions-Policy: lock down browser feature APIs that a HEMS dashboard
  // has no business using. Serial/USB/Bluetooth access goes through the
  // server-side adapters — never through the browser's raw device APIs.
  app.use((_req: Request, res: Response, next: NextFunction): void => {
    res.setHeader(
      'Permissions-Policy',
      [
        'camera=()',
        'microphone=()',
        'geolocation=()',
        'payment=()',
        'usb=()',
        'bluetooth=()',
        'serial=()',
        'hid=()',
        'midi=()',
      ].join(', '),
    );
    next();
  });
}

// ─── Rate Limiting ───────────────────────────────────────────────────
// Note: windowMs is randomized ±15s to mitigate timing attacks and
// prevent synchronized retry storms.

export function configureRateLimiting(app: Express, isDev: boolean): void {
  // Skip rate limiting for trusted proxy IPs (e.g., internal load balancers)
  const trustedIPs = new Set(
    (process.env.RATE_LIMIT_TRUSTED_IPS || '')
      .split(',')
      .map((ip) => ip.trim())
      .filter(Boolean),
  );

  const skipIfTrusted = (req: Request): boolean => {
    const clientIP = getClientIP(req);
    return trustedIPs.has(clientIP);
  };

  // MED-04: Use req.ip (resolved by Express trust-proxy setting) instead of reading
  // x-forwarded-for directly, which can be spoofed to bypass rate limiting.
  const getClientIP = (req: Request): string => req.ip ?? req.socket.remoteAddress ?? 'unknown';

  // Global rate limiter: 100 req/min
  const globalLimiter = rateLimit({
    windowMs: 60_000 + Math.floor((Math.random() - 0.5) * 30_000),
    max: isDev ? 0 : 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests, please try again later.' },
    keyGenerator: getClientIP,
    skip: skipIfTrusted,
  });

  if (!isDev) app.use(globalLimiter);

  // API rate limiter: 60 req/min
  const apiLimiter = rateLimit({
    windowMs: 60_000 + Math.floor((Math.random() - 0.5) * 30_000),
    max: isDev ? 0 : 60,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many API requests, please try again later.' },
    keyGenerator: getClientIP,
    skip: skipIfTrusted,
  });

  if (!isDev) app.use('/api/', apiLimiter);

  // Auth endpoint rate limiter: 5 req/min — covers token issuance, refresh,
  // and revocation to prevent brute-force and credential-stuffing attacks.
  const authLimiter = rateLimit({
    windowMs: 60_000 + Math.floor((Math.random() - 0.5) * 30_000),
    max: isDev ? 0 : 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many authentication attempts, please try again later.' },
    keyGenerator: getClientIP,
    skip: skipIfTrusted,
  });

  // Hardware-control endpoint rate limiter: 5 req/min — applied to any route
  // that triggers physical hardware actions (EEBUS pairing, future relay/battery
  // control REST endpoints). Even a valid admin token cannot bypass this cap.
  const controlLimiter = rateLimit({
    windowMs: 60_000 + Math.floor((Math.random() - 0.5) * 30_000),
    max: isDev ? 0 : 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many control requests, please try again later.' },
    keyGenerator: getClientIP,
    skip: skipIfTrusted,
  });

  if (!isDev) {
    // Auth routes — all three mutate session state
    app.use('/api/auth/token', authLimiter);
    app.use('/api/auth/refresh', authLimiter);
    app.use('/api/auth/revoke', authLimiter);
    app.use('/api/auth/rotate-key', authLimiter);

    // Hardware-control routes
    app.use('/api/eebus/pair', controlLimiter);
  }
}
