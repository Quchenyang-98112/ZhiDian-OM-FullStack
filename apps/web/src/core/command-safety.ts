/**
 * Command Safety Layer — Fail-safe command confirmation, validation & audit
 *
 * Ensures all hardware commands (Battery, EV, Heat Pump, KNX) go through:
 *   1. Zod schema validation (no negative kW, range checks)
 *   2. Rate limiting (max N commands per minute)
 *   3. Audit logging to IndexedDB
 *   4. Optional UI confirmation (danger commands)
 *
 * This module is the ONLY path to send commands to adapters.
 */

import { HeatPumpModeValueSchema, MAX_EV_CURRENT_A } from '@nexus-hems/shared-types';
import { z } from 'zod';
import { isReadOnlyModeActive } from '../lib/adapter-mode';
import { nexusDb } from '../lib/db';
import { metricsCollector } from '../lib/metrics';
import type { AdapterCommand, AdapterCommandType } from './adapters/EnergyAdapter';

// ─── Zod Validation Schemas per Command ──────────────────────────────

/** Allowed command value type — no `any` or untyped values */
type CommandValue = number | string | boolean;

const positiveNumber = z.number().nonnegative();
const currentAmps = z.number().min(0).max(MAX_EV_CURRENT_A);
const powerWatts = z.number().min(0).max(25_000); // MED-08: 25 kW safety cap (§14a EnWG residential)
const batteryPowerWatts = z.number().min(-25_000).max(25_000); // Bidirectional
const temperatureSetpoint = z.number().min(5).max(35); // °C sane range

export const commandSchemas: Record<AdapterCommandType, z.ZodType<CommandValue>> = {
  SET_EV_POWER: powerWatts,
  SET_EV_CURRENT: currentAmps,
  START_CHARGING: z.union([z.boolean(), z.number()]),
  STOP_CHARGING: z.union([z.boolean(), z.number()]),
  SET_V2X_DISCHARGE: powerWatts,
  SET_HEAT_PUMP_MODE: HeatPumpModeValueSchema,
  SET_HEAT_PUMP_POWER: positiveNumber.max(15_000), // 15 kW heat pump cap
  SET_BATTERY_POWER: batteryPowerWatts,
  SET_BATTERY_MODE: z.union([
    z.literal('self-consumption'),
    z.literal('force-charge'),
    z.literal('time-of-use'),
    z.literal('auto'),
    z.number(),
  ]),
  SET_GRID_LIMIT: positiveNumber.max(25_000), // §14a EnWG
  KNX_TOGGLE_LIGHTS: z.boolean(),
  KNX_SET_TEMPERATURE: temperatureSetpoint,
  KNX_TOGGLE_WINDOW: z.boolean(),
  SET_EV_MODE: z.union([
    z.literal('off'),
    z.literal('now'),
    z.literal('minpv'),
    z.literal('pv'),
    z.string(),
  ]),
  SET_EV_TARGET_SOC: z.number().min(0).max(100),
  SET_EV_PHASES: z.union([z.literal(1), z.literal(3), z.number().min(1).max(3)]),
  SET_EV_MIN_CURRENT: currentAmps,
  SET_SMART_COST_LIMIT: z.number().min(0).max(1), // €/kWh
  // V2G / ISO 15118-20 BPT — payload validated separately via Zod on the adapter
  SET_V2G_BPT_PARAMS: z.number().min(0), // nominal value; full params in command.payload
  // OpenADR 3.1 acknowledgment / reporting signals
  OPENADR_ACKNOWLEDGE_EVENT: z.string().max(128),
  OPENADR_SUBMIT_REPORT: z.string().max(128),
  // VPP flex-offer dispatch signal
  VPP_OFFER_FLEX: z.number().min(0).max(25_000),
};

/** Commands that modify high-power hardware and need user confirmation */
export const DANGER_COMMANDS = new Set<AdapterCommandType>([
  'SET_BATTERY_POWER',
  'SET_BATTERY_MODE',
  'SET_V2X_DISCHARGE',
  'SET_GRID_LIMIT',
  'SET_EV_POWER',
  'SET_EV_CURRENT',
  'START_CHARGING',
  'STOP_CHARGING',
  'SET_HEAT_PUMP_MODE',
  'SET_HEAT_PUMP_POWER',
]);

// ─── Rate Limiter ────────────────────────────────────────────────────

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 30; // max 30 commands per minute

interface RateLimitEntry {
  timestamps: number[];
}

const rateLimits = new Map<string, RateLimitEntry>();

export function checkRateLimit(commandType: string): boolean {
  const now = Date.now();
  const entry = rateLimits.get(commandType) ?? { timestamps: [] };

  // Prune old entries
  entry.timestamps = entry.timestamps.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);

  if (entry.timestamps.length >= RATE_LIMIT_MAX) {
    return false; // Rate limited
  }

  entry.timestamps.push(now);
  rateLimits.set(commandType, entry);
  return true;
}

// ─── Command Validation ──────────────────────────────────────────────

export interface CommandValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Validate a command's shape only — Read-Only-Mode gate + Zod schema — WITHOUT
 * consuming a rate-limit token.
 *
 * UI layers (useSafeCommand) call this for pre-dispatch rejection so that a
 * single user action is not charged twice against the sliding-window rate
 * limiter. The rate-limit token is spent exactly once at the true dispatch
 * boundary (BaseAdapter.sendCommand → validateCommand).
 */
export function validateCommandShape(command: AdapterCommand): CommandValidationResult {
  // SAF-01: Read-Only Mode blocks all control commands
  if (isReadOnlyModeActive()) {
    return {
      valid: false,
      error: 'System is in read-only mode — control commands are disabled',
    };
  }

  const schema = commandSchemas[command.type];
  if (!schema) {
    return { valid: false, error: `Unknown command type: ${command.type}` };
  }

  const result = schema.safeParse(command.value);
  if (!result.success) {
    const issues = result.error.issues.map((i) => i.message).join('; ');
    return {
      valid: false,
      error: `Invalid value for ${command.type}: ${issues}`,
    };
  }

  return { valid: true };
}

/**
 * Full command gate: shape validation followed by rate-limit token consumption.
 * This is the single authoritative gate and MUST run exactly once per command,
 * at the dispatch boundary (BaseAdapter.sendCommand). Callers that only need a
 * UI pre-check should use validateCommandShape to avoid double-charging the
 * rate limiter for one user action.
 */
export function validateCommand(command: AdapterCommand): CommandValidationResult {
  const shape = validateCommandShape(command);
  if (!shape.valid) return shape;

  if (!checkRateLimit(command.type)) {
    return {
      valid: false,
      error: `Rate limit exceeded for ${command.type} (max ${RATE_LIMIT_MAX}/min)`,
    };
  }

  return { valid: true };
}

/** Whether this command needs a user confirmation dialog */
export function requiresConfirmation(command: AdapterCommand): boolean {
  return DANGER_COMMANDS.has(command.type);
}

// ─── Audit Trail ─────────────────────────────────────────────────────

export interface CommandAuditEntry {
  id?: number | undefined;
  timestamp: number;
  commandType: AdapterCommandType;
  value: number | string | boolean;
  targetDeviceId?: string | undefined;
  status: 'confirmed' | 'rejected' | 'executed' | 'failed' | 'emergency_stop';
  error?: string | undefined;
  adapterId?: string | undefined;
}

/**
 * Log a command event to IndexedDB for audit.
 * Non-blocking — errors are swallowed silently.
 */
export async function logCommandAudit(entry: Omit<CommandAuditEntry, 'id'>): Promise<void> {
  // Increment Prometheus counter for every command event
  if (entry.status === 'rejected') {
    metricsCollector.recordCommandRejected(entry.commandType, entry.error ?? 'unknown');
  } else if (entry.status !== 'confirmed') {
    metricsCollector.recordCommand(entry.commandType, entry.status);
  }

  try {
    await nexusDb.table('commandAudit').add(entry);

    // Auto-cleanup: keep max 5000 entries
    const count = await nexusDb.table('commandAudit').count();
    if (count > 5000) {
      const oldest = await nexusDb
        .table('commandAudit')
        .orderBy('timestamp')
        .limit(count - 5000)
        .primaryKeys();
      await nexusDb.table('commandAudit').bulkDelete(oldest);
    }
  } catch {
    // Audit logging should never break the command flow
    if (import.meta.env.DEV) {
      console.warn('[CommandSafety] Failed to log audit entry');
    }
  }
}

/**
 * Get human-readable description of a command for the confirmation dialog.
 */
export function describeCommand(command: AdapterCommand): {
  labelKey: string;
  severity: 'danger' | 'warning';
} {
  switch (command.type) {
    case 'SET_BATTERY_POWER':
    case 'SET_BATTERY_MODE':
      return { labelKey: 'safety.confirmBattery', severity: 'warning' };
    case 'SET_V2X_DISCHARGE':
      return { labelKey: 'safety.confirmV2X', severity: 'danger' };
    case 'SET_GRID_LIMIT':
      return { labelKey: 'safety.confirmGridLimit', severity: 'danger' };
    case 'SET_EV_POWER':
    case 'SET_EV_CURRENT':
    case 'START_CHARGING':
    case 'STOP_CHARGING':
      return { labelKey: 'safety.confirmEV', severity: 'warning' };
    case 'SET_HEAT_PUMP_MODE':
    case 'SET_HEAT_PUMP_POWER':
      return { labelKey: 'safety.confirmHeatPump', severity: 'warning' };
    default:
      return { labelKey: 'safety.confirmGeneric', severity: 'warning' };
  }
}
