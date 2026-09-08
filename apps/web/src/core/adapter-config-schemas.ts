/**
 * Adapter Config Validation — Zod schemas for adapter connection configs
 *
 * Validates:
 *   - Connection parameters (host, port, TLS)
 *   - mTLS certificate fields (PEM format)
 *   - EEBUS SHIP-specific settings
 *   - OCPP security profiles (0–3)
 *   - Reconnect parameters
 *
 * All adapter configs are validated before being stored in the encrypted vault.
 */

import { z } from 'zod';

// ─── Shared validators ──────────────────────────────────────────────

const hostname = z
  .string()
  .min(1)
  .max(253)
  .regex(/^[a-zA-Z0-9._-]+$/, 'Invalid hostname');

const port = z.number().int().min(1).max(65535);

/** PEM-encoded certificate or key (base64 content between markers) */
const pemString = z
  .string()
  .min(1)
  .refine(
    (s) =>
      s.startsWith('-----BEGIN ') ||
      // Allow raw base64-encoded PEM (no markers)
      /^[A-Za-z0-9+/=\s]+$/.test(s),
    'Must be a valid PEM-encoded string or base64',
  );

// ─── Reconnect config ───────────────────────────────────────────────

export const reconnectConfigSchema = z.object({
  enabled: z.boolean(),
  initialDelayMs: z.number().int().min(100).max(60_000),
  maxDelayMs: z.number().int().min(1000).max(600_000),
  backoffMultiplier: z.number().min(1).max(10),
});

// ─── Base connection config ─────────────────────────────────────────

export const adapterConnectionSchema = z.object({
  name: z.string().min(1).max(100),
  host: hostname,
  port: port,
  tls: z.boolean().optional(),
  clientCert: pemString.optional(),
  clientKey: pemString.optional(),
  authToken: z.string().max(4096).optional(),
  reconnect: reconnectConfigSchema.optional(),
  pollIntervalMs: z.number().int().min(500).max(300_000).optional(),
});

// ─── mTLS config (EEBUS SHIP / OCPP 2.1 SecurityProfile 3) ─────────

export const mtlsConfigSchema = z
  .object({
    clientCert: pemString,
    clientKey: pemString,
    caCert: pemString.optional(),
    tls: z.literal(true),
  })
  .refine(
    (cfg) => !!(cfg.clientCert && cfg.clientKey),
    'mTLS requires both clientCert and clientKey',
  );

// ─── EEBUS-specific config ──────────────────────────────────────────

export const eebusConfigSchema = adapterConnectionSchema.extend({
  tls: z.literal(true).default(true), // EEBUS SHIP mandates TLS 1.3
  clientCert: pemString,
  clientKey: pemString,
  port: port.default(4712),
  /** SKI fingerprint for device pairing */
  skiFingerprint: z
    .string()
    .regex(/^[0-9a-fA-F]{40}$/, 'SKI must be a 40-char hex fingerprint')
    .optional(),
});

// ─── OCPP 2.1 specific config ───────────────────────────────────────

export const ocppConfigSchema = adapterConnectionSchema
  .extend({
    port: port.default(9000),
    tls: z.boolean().default(true),
    /**
     * OCPP 2.1 Security Profiles (OCPP-J-Annex):
     *   0 — No security (development only)
     *   1 — Basic Authentication (HTTP Basic)
     *   2 — TLS with Basic Auth
     *   3 — TLS with client-side certificates (mTLS)
     */
    securityProfile: z.number().int().min(0).max(3).default(2),
    clientCert: pemString.optional(),
    clientKey: pemString.optional(),
    caCert: pemString.optional(),
    revocationCheck: z.enum(['off', 'crl', 'ocsp']).default('off'),
  })
  .refine(
    (cfg) => cfg.securityProfile !== 3 || !!(cfg.clientCert && cfg.clientKey),
    'Profile 3 requires clientCert and clientKey',
  )
  .refine(
    (cfg) => (cfg.securityProfile !== 1 && cfg.securityProfile !== 2) || !!cfg.authToken?.trim(),
    'Profile 1/2 requires authToken (authorization key)',
  );

// ─── Victron MQTT config ────────────────────────────────────────────

export const victronConfigSchema = adapterConnectionSchema.extend({
  port: port.default(1880),
  gatewayType: z.enum(['cerbo-gx', 'venus-gx', 'rpi-victron']).default('cerbo-gx'),
});

// ─── Modbus SunSpec config ──────────────────────────────────────────

export const modbusConfigSchema = adapterConnectionSchema.extend({
  port: port.default(502),
  pollIntervalMs: z.number().int().min(1000).max(60_000).default(5000),
});

// ─── KNX config ─────────────────────────────────────────────────────

export const knxConfigSchema = adapterConnectionSchema.extend({
  port: port.default(3671),
});

// ─── Per-adapter credential schema ──────────────────────────────────

export const adapterCredentialSchema = z.object({
  authToken: z.string().max(4096).optional(),
  clientCert: pemString.optional(),
  clientKey: pemString.optional(),
  caCert: pemString.optional(),
  skiFingerprint: z
    .string()
    .regex(/^[0-9a-fA-F]{40}$/)
    .optional(),
  ocppSecurityProfile: z.number().int().min(0).max(3).optional(),
  extra: z.record(z.string(), z.string()).optional(),
});

// ─── Validation helpers ─────────────────────────────────────────────

export type AdapterConnectionInput = z.infer<typeof adapterConnectionSchema>;
export type MTLSConfigInput = z.infer<typeof mtlsConfigSchema>;
export type EEBUSConfigInput = z.infer<typeof eebusConfigSchema>;
export type OCPPConfigInput = z.infer<typeof ocppConfigSchema>;
export type AdapterCredentialInput = z.infer<typeof adapterCredentialSchema>;

/**
 * Validate adapter credentials before storing in the vault.
 */
export function validateAdapterCredentials(
  input: unknown,
): { valid: true; data: AdapterCredentialInput } | { valid: false; error: string } {
  const result = adapterCredentialSchema.safeParse(input);
  if (!result.success) {
    return { valid: false, error: result.error.issues.map((i) => i.message).join('; ') };
  }
  return { valid: true, data: result.data };
}

/**
 * Validate mTLS config completeness.
 */
export function validateMTLSConfig(
  input: unknown,
): { valid: true; data: MTLSConfigInput } | { valid: false; error: string } {
  const result = mtlsConfigSchema.safeParse(input);
  if (!result.success) {
    return { valid: false, error: result.error.issues.map((i) => i.message).join('; ') };
  }
  return { valid: true, data: result.data };
}
