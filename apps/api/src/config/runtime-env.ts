/**
 * SEC-11: Runtime environment classification.
 *
 * Only explicit `development` or `test` enables auth / rate-limit bypass paths.
 * Unset `NODE_ENV` defaults to production-hardened (fail-closed).
 */

/** True when auth bypass, relaxed rate limits, and dev CORS are allowed. */
export function isDevRuntime(env: NodeJS.ProcessEnv = process.env): boolean {
  const nodeEnv = env.NODE_ENV?.trim();
  return nodeEnv === 'development' || nodeEnv === 'test';
}

/** True when production auth, CSP, and WS origin validation apply. */
export function isProductionRuntime(env: NodeJS.ProcessEnv = process.env): boolean {
  return !isDevRuntime(env);
}

/**
 * Loud startup warning when NODE_ENV is unset. The process still fails closed;
 * this helps operators who expect dev bypass after forgetting to set NODE_ENV.
 */
export function warnIfNodeEnvUnset(env: NodeJS.ProcessEnv = process.env): void {
  if (env.NODE_ENV?.trim()) return;
  console.warn(
    '[Runtime] SEC-11: NODE_ENV is unset — treating this process as production-hardened ' +
      '(auth, scope checks, and rate limits enforced). Set NODE_ENV=development for local dev.',
  );
}
