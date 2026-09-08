/**
 * OCPP 2.1 connection security helpers — profiles 0–3.
 *
 * Browser WebSocket cannot attach custom Authorization headers or present
 * client certificates. Profile 1/2 use HTTP Basic credentials embedded in the
 * WebSocket URL (station ID + authorization key). Profile 3 validates mTLS
 * material from the encrypted vault; browser clients use the API `/ws/ocpp` proxy
 * (POST `/api/ocpp/proxy-session` + single-use WS ticket) for full mTLS.
 */

import type { OCPPSecurityProfile } from './OCPP21Adapter';

export type OcppRevocationCheck = 'off' | 'crl' | 'ocsp';

export interface OcppSecurityInput {
  host: string;
  port: number;
  tls?: boolean;
  securityProfile: OCPPSecurityProfile;
  stationId: string;
  authToken?: string;
  clientCert?: string;
  clientKey?: string;
  caCert?: string;
  revocationCheck?: OcppRevocationCheck;
}

export type OcppConnectionPrep =
  | {
      ok: true;
      url: string;
      protocols: string[];
      securityProfile: OCPPSecurityProfile;
      warnings?: string[];
    }
  | { ok: false; error: string };

const PEM_BEGIN = '-----BEGIN ';

/** Returns true when value looks like PEM or base64-encoded PEM. */
export function hasPemMaterial(value?: string): boolean {
  if (!value?.trim()) return false;
  const trimmed = value.trim();
  return trimmed.startsWith(PEM_BEGIN) || /^[A-Za-z0-9+/=\s]+$/.test(trimmed);
}

/**
 * Configurable revocation hook — CRL requires a CA/CRL bundle in caCert.
 * OCSP is reserved for future API-proxy integration.
 */
export function validateOcppRevocationConfig(
  input: Pick<OcppSecurityInput, 'revocationCheck' | 'caCert'>,
): string | null {
  const mode = input.revocationCheck ?? 'off';
  if (mode === 'off') return null;
  if (mode === 'crl' && !hasPemMaterial(input.caCert)) {
    return 'CRL revocation check requires caCert (CA or CRL PEM bundle)';
  }
  return null;
}

/** Resolve whether TLS (wss) is required for the given profile. */
export function resolveOcppTls(profile: OCPPSecurityProfile, tlsFlag?: boolean): boolean {
  if (profile >= 2) return true;
  if (profile === 0) return !!tlsFlag;
  return !!tlsFlag;
}

/**
 * Build OCPP-J WebSocket URL and validate profile-specific credentials.
 * Username for Basic Auth is the charging-station identity (stationId).
 */
export function prepareOcppConnection(input: OcppSecurityInput): OcppConnectionPrep {
  const profile = input.securityProfile;
  const warnings: string[] = [];

  const revocationError = validateOcppRevocationConfig(input);
  if (revocationError) return { ok: false, error: revocationError };

  if (profile === 1 || profile === 2) {
    if (!input.authToken?.trim()) {
      return {
        ok: false,
        error: 'OCPP security profile requires authorization key (authToken)',
      };
    }
  }

  if (profile === 3) {
    if (!hasPemMaterial(input.clientCert) || !hasPemMaterial(input.clientKey)) {
      return {
        ok: false,
        error: 'OCPP security profile 3 requires client certificate and private key',
      };
    }
    warnings.push(
      'Browser WebSocket cannot present client certificates; use API proxy (/ws/ocpp) or Tauri/desktop for full mTLS.',
    );
  }

  const useTls = resolveOcppTls(profile, input.tls);
  const wsScheme = useTls ? 'wss' : 'ws';
  const path = `/ocpp/${encodeURIComponent(input.stationId)}`;

  let authority = `${input.host}:${input.port}`;
  if ((profile === 1 || profile === 2) && input.authToken?.trim()) {
    const user = encodeURIComponent(input.stationId);
    const pass = encodeURIComponent(input.authToken.trim());
    authority = `${user}:${pass}@${authority}`;
  }

  return {
    ok: true,
    url: `${wsScheme}://${authority}${path}`,
    protocols: ['ocpp2.1'],
    securityProfile: profile,
    ...(warnings.length > 0 ? { warnings } : {}),
  };
}
