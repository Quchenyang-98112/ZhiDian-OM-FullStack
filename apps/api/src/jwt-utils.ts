// ── JWT Key Management & jose Utilities ──────────────────────────────
// Replaces jsonwebtoken with the modern `jose` library (async, no native deps).
// Supports secret loading from: env var → Docker secret file → auto-generated (dev only).
// HIGH-07: Dual-key verification (JWT_SECRET + JWT_SECRET_NEW) without restart via reloadJwtKeysFromEnv().
// ─────────────────────────────────────────────────────────────────────

import crypto from 'crypto';
import fs from 'fs';
import { decodeProtectedHeader, errors as joseErrors, jwtVerify, SignJWT } from 'jose';
import { isProductionRuntime } from './config/runtime-env.js';
import {
  recordJtiRevocation,
  recordJwtKeyReload,
  recordJwtVerifyFailure,
} from './middleware/security-metrics.js';

// ─── Types ──────────────────────────────────────────────────────────

export interface JWTPayload {
  sub: string;
  scope: string;
  jti?: string;
  iss?: string;
  aud?: string | string[];
  iat?: number;
  exp?: number;
  kid?: string;
  // Index signature required by jose's JWTPayload constraint
  [key: string]: unknown;
}

interface KeySlot {
  secret: Uint8Array;
  kid: string;
  createdAt: number;
}

interface SigningMaterial {
  /** Secret used to sign new tokens (JWT_SECRET_NEW when set, else JWT_SECRET). */
  signing: string;
  /** Legacy secret for verifying tokens not yet rotated (only when JWT_SECRET_NEW is set). */
  verificationFallback: string | null;
}

// ─── Configuration ──────────────────────────────────────────────────

const ALGORITHM = 'HS256' as const;
const DOCKER_SECRET_PATH = process.env.JWT_SECRET_FILE ?? '/run/secrets/jwt_secret';
const JWT_SECRET_NEW_FILE = process.env.JWT_SECRET_NEW_FILE ?? '';
const KEY_ROTATION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days (informational / logging only)
const JWT_MIN_SECRET_LENGTH = 32; // bytes
const JWT_RECOMMENDED_SECRET_LENGTH = 64; // recommended for HS256

// MED-01: JWT issuer and audience for claim validation
export const JWT_ISSUER = 'nexus-hems-server';
export const JWT_AUDIENCE = 'nexus-hems-api';

// MED-02: JTI revocation — optional Redis backend (ADR-003)
// When REDIS_URL is set: revocations are stored in Redis with TTL (persists across restarts).
// When REDIS_URL is absent: graceful fallback to bounded in-memory Map (10 000 entries max).

// In-memory fallback store
const revokedJTIs = new Map<string, number>();
const MAX_REVOKED_JTIS = 10_000;

/** Minimal Redis interface — avoids hard ioredis type dependency */
interface IRedisClient {
  ping(): Promise<string>;
  set(key: string, value: string, mode: string, ttl: number): Promise<string | null>;
  exists(key: string): Promise<number>;
  on(event: string, cb: (err: Error) => void): this;
}

type OptionalRedisModule = {
  Redis: new (url: string, opts: Record<string, unknown>) => IRedisClient;
};

// Load optional runtime dependencies without making TypeScript require them locally.
const importOptionalModule = new Function('specifier', 'return import(specifier);') as (
  specifier: string,
) => Promise<unknown>;

// Redis client instance — initialized lazily on first revocation attempt
let _redisClient: IRedisClient | null = null;
let _redisInitialized = false;

async function getRedisClient(): Promise<IRedisClient | null> {
  if (_redisInitialized) return _redisClient;
  _redisInitialized = true;

  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) return null;

  try {
    // Dynamic import — ioredis is an optional peer dep; fall back gracefully if absent
    const { Redis } = (await importOptionalModule('ioredis')) as OptionalRedisModule;
    const client = new Redis(redisUrl, {
      enableReadyCheck: true,
      maxRetriesPerRequest: 2,
      connectTimeout: 3_000,
      lazyConnect: false,
    });

    client.on('error', (err: Error) => {
      // Log the error class/message but never the connection URL
      console.error('[JWT-Redis] Connection error:', err.message);
    });

    await client.ping();
    _redisClient = client;
    console.log('[JWT] JTI revocation backend: Redis (persistent, survives restarts)');
  } catch (err) {
    console.warn(
      '[JWT] Redis connection failed — falling back to in-memory JTI revocation:',
      (err as Error).message,
    );
    _redisClient = null;
  }

  return _redisClient;
}

const REDIS_JTI_PREFIX = 'nexus:jti:revoked:';

/**
 * Revoke a JWT by its jti claim. Token will be rejected until it expires.
 * Stores in Redis (when available) for persistence across restarts,
 * or in-memory Map as fallback.
 */
export async function revokeToken(jti: string, expiresAtMs: number): Promise<void> {
  const redis = await getRedisClient();

  if (redis !== null) {
    const ttlSeconds = Math.max(1, Math.ceil((expiresAtMs - Date.now()) / 1_000));
    await redis.set(`${REDIS_JTI_PREFIX}${jti}`, '1', 'EX', ttlSeconds);
    recordJtiRevocation();
    return;
  }

  // In-memory fallback
  if (revokedJTIs.size >= MAX_REVOKED_JTIS) {
    const now = Date.now();
    for (const [k, exp] of revokedJTIs) {
      if (exp < now) revokedJTIs.delete(k);
      if (revokedJTIs.size < MAX_REVOKED_JTIS) break;
    }
  }
  revokedJTIs.set(jti, expiresAtMs);
  recordJtiRevocation();
}

/**
 * Check if a JTI is currently revoked.
 */
async function isJTIRevoked(jti: string): Promise<boolean> {
  const redis = await getRedisClient();

  if (redis !== null) {
    const result = await redis.exists(`${REDIS_JTI_PREFIX}${jti}`);
    return result === 1;
  }

  // In-memory fallback
  const exp = revokedJTIs.get(jti);
  if (exp === undefined) return false;
  if (exp < Date.now()) {
    revokedJTIs.delete(jti); // lazy cleanup
    return false;
  }
  return true;
}

// ─── Key Store ──────────────────────────────────────────────────────

let currentKey: KeySlot | null = null;
let previousKey: KeySlot | null = null;

/** Dev-only: stable auto-generated secret for the process lifetime */
let _devAutoSecret: string | null = null;

function secretToUint8Array(secret: string): Uint8Array {
  return new TextEncoder().encode(secret);
}

function makeKeySlot(secret: string, kidOverride?: string): KeySlot {
  const kid =
    kidOverride && kidOverride.length > 0
      ? kidOverride
      : crypto.createHash('sha256').update(secret, 'utf8').digest('hex').slice(0, 16);
  return {
    secret: secretToUint8Array(secret),
    kid,
    createdAt: Date.now(),
  };
}

/**
 * Estimate entropy of a secret string and enforce cryptographic hygiene (CRIT-03).
 *
 * In production (`isProd === true`) a known-weak pattern OR an estimated entropy
 * below 128 bits is **fatal** — this throws to abort boot rather than starting with
 * a guessable signing key. A secret shorter than the recommended length stays a
 * non-fatal warning. In dev/test every condition is warn-only (never throws) so
 * local workflows are not blocked.
 *
 * Log/throw hygiene: messages never include the secret, its length, or the derived
 * entropy value (CodeQL [js/clear-text-logging]).
 */
// Exported for unit testing (CRIT-03 enforcement). Not part of the public signing API.
export function checkSecretEntropy(secret: string, source: string, isProd: boolean): void {
  // Basic entropy checks
  const hasLower = /[a-z]/.test(secret);
  const hasUpper = /[A-Z]/.test(secret);
  const hasDigit = /\d/.test(secret);
  const hasSpecial = /[^a-zA-Z0-9]/.test(secret);
  const charsetSize =
    (hasLower ? 26 : 0) + (hasUpper ? 26 : 0) + (hasDigit ? 10 : 0) + (hasSpecial ? 32 : 0);
  const estimatedEntropy = secret.length * Math.log2(charsetSize || 1);

  // Known-weak patterns — most severe, checked first. Only the source label is
  // referenced, never the matched pattern or the secret.
  const weakPatterns = ['password', 'secret', '123456', 'admin', 'test', 'changeme', 'default'];
  const lowerSecret = secret.toLowerCase();
  const hasWeakPattern = weakPatterns.some((pattern) => lowerSecret.includes(pattern));
  if (hasWeakPattern) {
    if (isProd) {
      throw new Error(
        `[JWT] FATAL: ${source} contains a known-weak pattern. Refusing to start in production. ` +
          'Use a cryptographically random secret (e.g., openssl rand -base64 64).',
      );
    }
    console.error(
      `[JWT] SECURITY RISK: ${source} contains a known-weak pattern. ` +
        'Use a cryptographically random secret in production!',
    );
  }

  // Low entropy (< 128 bits is weak for cryptographic use).
  if (estimatedEntropy < 128) {
    if (isProd) {
      // Do NOT include estimatedEntropy (derived from secret) — CodeQL [js/clear-text-logging]
      throw new Error(
        `[JWT] FATAL: ${source} has insufficient entropy for production. Refusing to start. ` +
          'Use a cryptographically random secret (e.g., openssl rand -base64 64).',
      );
    }
    console.warn(
      `[JWT] WARNING: ${source} appears to have low entropy. ` +
        'Use a cryptographically random secret (e.g., openssl rand -base64 64).',
    );
  }

  // Shorter than recommended — non-fatal in every environment.
  // Compare against a pre-defined constant so the secret length itself is never logged.
  if (secret.length < JWT_RECOMMENDED_SECRET_LENGTH) {
    console.warn(
      `[JWT] WARNING: ${source} is shorter than the recommended ${JWT_RECOMMENDED_SECRET_LENGTH} characters. ` +
        'Consider using a longer secret for HS256.',
    );
  }
}

function readSecretFromFile(path: string): string | null {
  try {
    if (!path || !fs.existsSync(path)) return null;
    const fileSecret = fs.readFileSync(path, 'utf-8').trim();
    return fileSecret.length >= JWT_MIN_SECRET_LENGTH ? fileSecret : null;
  } catch (err) {
    if (isProductionRuntime()) {
      console.warn('[JWT] Secret file not accessible:', path, (err as Error).message);
    }
    return null;
  }
}

/**
 * Primary (legacy) signing secret: JWT_SECRET env, then JWT_SECRET_FILE mount.
 */
function readMainJwtSecretString(): string | null {
  const envSecret = process.env.JWT_SECRET?.trim();
  if (envSecret && envSecret.length >= JWT_MIN_SECRET_LENGTH) {
    return envSecret;
  }
  const fromFile = readSecretFromFile(DOCKER_SECRET_PATH);
  if (fromFile) return fromFile;
  return null;
}

/**
 * In-rotation secret: JWT_SECRET_NEW env, then JWT_SECRET_NEW_FILE (when set).
 */
function readNewJwtSecretString(): string | null {
  const envNew = process.env.JWT_SECRET_NEW?.trim();
  if (envNew && envNew.length >= JWT_MIN_SECRET_LENGTH) {
    return envNew;
  }
  if (JWT_SECRET_NEW_FILE) {
    return readSecretFromFile(JWT_SECRET_NEW_FILE);
  }
  return null;
}

function resolveSigningMaterial(): SigningMaterial {
  const isProd = isProductionRuntime();
  const main = readMainJwtSecretString();
  const fresh = readNewJwtSecretString();

  if (fresh && fresh.length >= JWT_MIN_SECRET_LENGTH) {
    if (!main || main.length < JWT_MIN_SECRET_LENGTH) {
      throw new Error(
        '[JWT] JWT_SECRET (or JWT_SECRET_FILE) is required when JWT_SECRET_NEW is configured.',
      );
    }
    checkSecretEntropy(main, 'JWT_SECRET (verification)', isProd);
    checkSecretEntropy(fresh, 'JWT_SECRET_NEW (signing)', isProd);
    return { signing: fresh, verificationFallback: main };
  }

  if (main && main.length >= JWT_MIN_SECRET_LENGTH) {
    checkSecretEntropy(main, 'JWT_SECRET env var', isProd);
    return { signing: main, verificationFallback: null };
  }

  if (!isProd) {
    if (!_devAutoSecret) {
      _devAutoSecret = crypto.randomBytes(64).toString('hex');
      console.warn(
        '[JWT] Using auto-generated secret (NOT suitable for production or multi-instance)',
      );
    }
    return { signing: _devAutoSecret, verificationFallback: null };
  }

  throw new Error(
    '[JWT] FATAL: No JWT_SECRET configured in production! ' +
      'Set JWT_SECRET env var (min 32 chars) or mount Docker secret at ' +
      DOCKER_SECRET_PATH,
  );
}

function applyKeyMaterial(material: SigningMaterial): void {
  const kidNew = process.env.JWT_KID_NEW?.trim();
  const kidPrimary = process.env.JWT_KID_PRIMARY?.trim();
  const signingKid =
    material.verificationFallback !== null
      ? kidNew || undefined
      : kidPrimary || kidNew || undefined;
  const fallbackKid = kidPrimary || undefined;

  currentKey = makeKeySlot(material.signing, signingKid);
  previousKey = material.verificationFallback
    ? makeKeySlot(material.verificationFallback, fallbackKid)
    : null;
}

// ─── Initialization ─────────────────────────────────────────────────

/**
 * Initialize the key store. Call once at server startup.
 */
export function initKeys(): void {
  const material = resolveSigningMaterial();
  applyKeyMaterial(material);
  console.log('[JWT] Signing keys initialized', {
    dualKey: material.verificationFallback !== null,
  });
}

export interface JwtKeyReloadResult {
  primaryKid: string;
  secondaryKid: string | null;
  dualKey: boolean;
  reloadedAt: number;
}

/**
 * HIGH-07: Reload JWT signing keys from environment and secret files without process restart.
 * Use after Kubernetes/Docker secret rotation or when JWT_SECRET_NEW is added.
 */
export function reloadJwtKeysFromEnv(): JwtKeyReloadResult {
  try {
    const material = resolveSigningMaterial();
    applyKeyMaterial(material);
    recordJwtKeyReload(true);
    console.log('[JWT] Signing keys reloaded', { dualKey: material.verificationFallback !== null });
    return {
      primaryKid: currentKey!.kid,
      secondaryKid: previousKey?.kid ?? null,
      dualKey: previousKey !== null,
      reloadedAt: Date.now(),
    };
  } catch (err) {
    recordJwtKeyReload(false);
    throw err;
  }
}

/**
 * Check if key rotation is needed and rotate if so.
 * HIGH-07: Operational rotation uses JWT_SECRET_NEW + reloadJwtKeysFromEnv (or restart).
 * This hook only ensures keys exist.
 */
export function rotateIfNeeded(): void {
  if (!currentKey) {
    initKeys();
  }
  const age = Date.now() - currentKey!.createdAt;
  if (age >= KEY_ROTATION_MS) {
    console.log(
      `[JWT] Signing key age ${Math.floor(age / 86400000)} d — prefer JWT_SECRET_NEW + POST /api/auth/rotate-key for zero-downtime rotation.`,
    );
  }
}

// ─── Sign ───────────────────────────────────────────────────────────

export async function signToken(
  payload: { sub: string; scope: string },
  expiresIn: string,
): Promise<string> {
  if (!currentKey) initKeys();
  rotateIfNeeded();

  const now = Math.floor(Date.now() / 1000);
  const expSeconds = parseExpiry(expiresIn);

  // MED-01: Add iss + aud claims for issuer/audience validation
  // MED-02: Add jti (JWT ID) for revocation support
  return new SignJWT({
    sub: payload.sub,
    scope: payload.scope,
    jti: crypto.randomUUID(),
  })
    .setProtectedHeader({ alg: ALGORITHM, kid: currentKey!.kid })
    .setIssuer(JWT_ISSUER)
    .setAudience(JWT_AUDIENCE)
    .setIssuedAt(now)
    .setExpirationTime(now + expSeconds)
    .sign(currentKey!.secret);
}

function classifyJwtVerifyError(err: unknown): 'signature' | 'expired' | 'invalid' {
  if (err instanceof joseErrors.JWSSignatureVerificationFailed) return 'signature';
  if (err instanceof joseErrors.JWTExpired) return 'expired';
  return 'invalid';
}

function orderedVerifySlots(headerKid: unknown): KeySlot[] {
  const slots: KeySlot[] = [];
  if (!currentKey) return slots;
  const kid = typeof headerKid === 'string' ? headerKid : undefined;
  if (kid && currentKey.kid === kid) {
    slots.push(currentKey);
    if (previousKey && previousKey.kid !== kid) slots.push(previousKey);
    return slots;
  }
  if (kid && previousKey && previousKey.kid === kid) {
    slots.push(previousKey);
    if (currentKey.kid !== kid) slots.push(currentKey);
    return slots;
  }
  slots.push(currentKey);
  if (previousKey) slots.push(previousKey);
  return slots;
}

// ─── Verify ─────────────────────────────────────────────────────────

/**
 * Verify a JWT token. Tries the signing key first, then the verification fallback
 * (JWT_SECRET when JWT_SECRET_NEW is active — HIGH-07 zero-downtime rotation).
 * MED-01: Validates iss and aud claims.
 * MED-02: Rejects tokens with revoked JTI.
 */
export async function verifyToken(token: string): Promise<JWTPayload> {
  if (!currentKey) initKeys();

  const verifyOptions = {
    algorithms: [ALGORITHM] as 'HS256'[],
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
  };

  let headerKid: unknown;
  try {
    headerKid = decodeProtectedHeader(token).kid;
  } catch {
    headerKid = undefined;
  }

  let payload: JWTPayload | undefined;
  let lastErr: unknown;

  for (const slot of orderedVerifySlots(headerKid)) {
    try {
      const result = await jwtVerify(token, slot.secret, verifyOptions);
      payload = result.payload as unknown as JWTPayload;
      break;
    } catch (err) {
      lastErr = err;
    }
  }

  if (!payload) {
    if (lastErr) recordJwtVerifyFailure(classifyJwtVerifyError(lastErr));
    throw lastErr ?? new Error('JWT verification failed');
  }

  // MED-02: Reject revoked tokens (async: Redis or in-memory fallback)
  if (payload.jti && (await isJTIRevoked(payload.jti))) {
    recordJwtVerifyFailure('revoked');
    throw new joseErrors.JWTExpired('Token has been revoked', payload);
  }

  return payload;
}

// ─── Health Info ─────────────────────────────────────────────────────

export function getKeyHealth(): {
  currentKid: string;
  currentAgeMs: number;
  rotationDueMs: number;
  hasPreviousKey: boolean;
} {
  if (!currentKey) initKeys();
  const age = Date.now() - currentKey!.createdAt;
  return {
    currentKid: currentKey!.kid,
    currentAgeMs: age,
    rotationDueMs: Math.max(0, KEY_ROTATION_MS - age),
    hasPreviousKey: previousKey !== null,
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────

/** Parse duration strings like '24h', '7d', '30m' to seconds */
function parseExpiry(expiry: string): number {
  const match = expiry.match(/^(\d+)([smhd])$/);
  if (!match) {
    // Default to 24 hours if format is unrecognized
    return 86400;
  }
  const value = parseInt(match[1], 10);
  switch (match[2]) {
    case 's':
      return value;
    case 'm':
      return value * 60;
    case 'h':
      return value * 3600;
    case 'd':
      return value * 86400;
    default:
      return 86400;
  }
}

export { joseErrors };
