/**
 * LOW — Prometheus counters for auth / security events (no PII in labels).
 */

import { incrementMetric } from './metrics.js';

type JwtVerifyFailReason = 'signature' | 'expired' | 'invalid' | 'revoked' | 'unknown';

export function recordJwtVerifyFailure(reason: JwtVerifyFailReason): void {
  incrementMetric(
    'hems_jwt_verify_failures_total',
    'Count of rejected JWT verifications by reason',
    'counter',
    1,
    { reason },
  );
}

export function recordJtiRevocation(): void {
  incrementMetric('hems_jti_revocations_total', 'Count of JWTs revoked by JTI', 'counter', 1, {});
}

export function recordJwtKeyReload(success: boolean): void {
  incrementMetric(
    'hems_jwt_key_reload_total',
    'JWT signing key reload attempts from env/files',
    'counter',
    1,
    { result: success ? 'ok' : 'error' },
  );
}

export function recordEebusHandshake(outcome: 'success' | 'failure'): void {
  incrementMetric('hems_eebus_handshake_total', 'EEBUS SHIP handshake completions', 'counter', 1, {
    outcome,
  });
}
