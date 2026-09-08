/**
 * EEBUS connection security helpers — SHIP mTLS material validation.
 */

import type { EEBUSAdapterConfig } from './EEBUSAdapter';
import { hasPemMaterial } from './ocpp-security';

export type EebusConnectPrep = { ok: true; warnings?: string[] } | { ok: false; error: string };

/**
 * Validate browser/proxy and direct SHIP connection prerequisites.
 * Rejects tls=true with whitespace-only or invalid PEM placeholders.
 */
export function validateEebusConnectConfig(
  config: Pick<
    EEBUSAdapterConfig,
    'host' | 'tls' | 'mock' | 'clientCert' | 'clientKey' | 'skiFingerprint'
  >,
  options?: { isBrowser?: boolean },
): EebusConnectPrep {
  if (config.mock === true) return { ok: true };

  const isBrowser = options?.isBrowser ?? typeof window !== 'undefined';
  const warnings: string[] = [];

  if (isBrowser) {
    if (!config.skiFingerprint?.trim()) {
      return { ok: false, error: 'EEBUS skiFingerprint is required for browser connections' };
    }
    if (config.tls === false) {
      warnings.push('EEBUS SHIP expects TLS 1.3 — proxy terminates mTLS at the API');
    }
  } else if (!config.host?.trim()) {
    return { ok: false, error: 'EEBUS host is required' };
  }

  const certProvided = config.clientCert !== undefined;
  const keyProvided = config.clientKey !== undefined;

  if (certProvided && !hasPemMaterial(config.clientCert)) {
    return {
      ok: false,
      error: 'EEBUS mTLS client certificate is missing or invalid PEM material',
    };
  }

  if (keyProvided && !hasPemMaterial(config.clientKey)) {
    return {
      ok: false,
      error: 'EEBUS mTLS private key is missing or invalid PEM material',
    };
  }

  if (hasPemMaterial(config.clientCert) !== hasPemMaterial(config.clientKey)) {
    return {
      ok: false,
      error: 'EEBUS mTLS requires both client certificate and private key',
    };
  }

  if (config.tls && certProvided && !hasPemMaterial(config.clientCert)) {
    return {
      ok: false,
      error: 'EEBUS TLS is enabled but client certificate PEM is empty',
    };
  }

  return warnings.length > 0 ? { ok: true, warnings } : { ok: true };
}
