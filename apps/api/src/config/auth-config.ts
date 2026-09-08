/**
 * Production auth configuration validation (SEC-08).
 *
 * In production every API key must have an explicit scope binding via
 * API_KEY_SCOPES — no silent readwrite fallback.
 */

import type { JWTScope } from '../middleware/auth.js';
import { isDevRuntime } from './runtime-env.js';

function parseApiKeys(env: NodeJS.ProcessEnv): string[] {
  return (env.API_KEYS || '')
    .split(',')
    .map((k) => k.trim())
    .filter(Boolean);
}

function parseApiKeyScopeMap(env: NodeJS.ProcessEnv): Map<string, JWTScope> {
  return new Map(
    (env.API_KEY_SCOPES || '')
      .split(',')
      .map((entry) => {
        const colonIdx = entry.trim().lastIndexOf(':');
        if (colonIdx <= 0) return null;
        const key = entry.slice(0, colonIdx).trim();
        const scope = entry.slice(colonIdx + 1).trim() as JWTScope;
        if (!key || !['read', 'readwrite', 'admin'].includes(scope)) return null;
        return [key, scope] as [string, JWTScope];
      })
      .filter((entry): entry is [string, JWTScope] => entry !== null),
  );
}

/**
 * Fail fast in production when API keys lack explicit scope bindings.
 * Dev mode skips validation (anonymous / auto-accept paths remain available).
 */
export function validateProductionAuthConfig(env: NodeJS.ProcessEnv = process.env): void {
  if (isDevRuntime(env)) return;

  const apiKeys = parseApiKeys(env);
  if (apiKeys.length === 0) {
    throw new Error(
      '[Auth] Production requires API_KEYS (comma-separated). Generate with: openssl rand -hex 32',
    );
  }

  const scopeMap = parseApiKeyScopeMap(env);
  if (scopeMap.size === 0) {
    throw new Error(
      '[Auth] Production requires API_KEY_SCOPES with a key:scope entry for every API_KEYS value ' +
        '(e.g. API_KEY_SCOPES=monitor:read,operator:readwrite).',
    );
  }

  const unmapped = apiKeys.filter((key) => !scopeMap.has(key));
  if (unmapped.length > 0) {
    throw new Error(
      `[Auth] API_KEY_SCOPES missing scope binding for: ${unmapped.join(', ')}. ` +
        'Every production API key must have an explicit scope — no readwrite default.',
    );
  }
}
