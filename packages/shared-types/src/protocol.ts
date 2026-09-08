/**
 * Protocol Zod Schemas — Single source of truth for all API & WS models.
 *
 * Every API response, WebSocket message, and protocol-level data structure
 * is defined here as a Zod schema. TypeScript types are derived via z.infer.
 *
 * Usage:
 *   import { EnergyUpdateSchema, type EnergyUpdate } from '../types/protocol';
 *   const parsed = EnergyUpdateSchema.parse(raw); // throws on invalid data
 */

import { z } from 'zod';

// ─── Primitive Validators ────────────────────────────────────────────

const watts = z.number().finite();
const nonNegativeWatts = z.number().finite().nonnegative();
const percentage = z.number().finite().min(0).max(100);
const volts = z.number().finite().nonnegative();
const kwh = z.number().finite().nonnegative();
const priceEurKwh = z.number().finite();

// ─── Energy Data (server ↔ client) ──────────────────────────────────

export const EnergyDataSchema = z.object({
  gridPower: watts,
  pvPower: nonNegativeWatts,
  batteryPower: watts, // positive = charging, negative = discharging
  houseLoad: nonNegativeWatts,
  batterySoC: percentage,
  heatPumpPower: nonNegativeWatts,
  evPower: nonNegativeWatts,
  gridVoltage: volts,
  batteryVoltage: volts,
  pvYieldToday: kwh,
  priceCurrent: priceEurKwh,
});

export type EnergyData = z.infer<typeof EnergyDataSchema>;

// ─── PV Data (SunSpec Model 103/160) ────────────────────────────────

export const PVStringSchema = z.object({
  id: z.number().int(),
  powerW: nonNegativeWatts,
  voltageV: volts,
  currentA: z.number().finite().nonnegative(),
});

export const PVDataSchema = z.object({
  totalPowerW: nonNegativeWatts,
  yieldTodayKWh: kwh,
  strings: z.array(PVStringSchema).optional(),
});

export type PVData = z.infer<typeof PVDataSchema>;

// ─── Battery Data (SunSpec Model 124 / Victron) ─────────────────────

export const BatteryDataSchema = z.object({
  powerW: watts,
  socPercent: percentage,
  voltageV: volts,
  currentA: z.number().finite(),
  temperatureC: z.number().finite().optional(),
  cycleCount: z.number().int().nonnegative().optional(),
  stateOfHealthPercent: percentage.optional(),
});

export type BatteryData = z.infer<typeof BatteryDataSchema>;

// ─── Grid Data (SunSpec Model 201–204) ──────────────────────────────

export const GridPhaseSchema = z.object({
  voltageV: volts,
  currentA: z.number().finite().nonnegative(),
  powerW: watts,
});

export const GridDataSchema = z.object({
  powerW: watts,
  voltageV: volts,
  frequencyHz: z.number().finite().min(45).max(65).optional(),
  energyImportKWh: kwh.optional(),
  energyExportKWh: kwh.optional(),
  phases: z.array(GridPhaseSchema).optional(),
});

export type GridData = z.infer<typeof GridDataSchema>;

// ─── Load Data ──────────────────────────────────────────────────────

export const LoadDataSchema = z.object({
  totalPowerW: nonNegativeWatts,
  heatPumpPowerW: nonNegativeWatts,
  evPowerW: nonNegativeWatts,
  otherPowerW: nonNegativeWatts,
});

export type LoadData = z.infer<typeof LoadDataSchema>;

// ─── EV Charger (OCPP 2.1 / IEC 61851) ─────────────────────────────

export const EVChargerStatusSchema = z.enum([
  'available',
  'preparing',
  'charging',
  'suspended',
  'finishing',
  'faulted',
]);

export const EVChargerDataSchema = z.object({
  status: EVChargerStatusSchema,
  powerW: nonNegativeWatts,
  energySessionKWh: kwh,
  socPercent: percentage.optional(),
  currentA: z.number().finite().nonnegative().optional(),
  voltageV: volts.optional(),
  maxCurrentA: z.number().finite().nonnegative(),
  vehicleConnected: z.boolean(),
  v2xCapable: z.boolean(),
  v2xActive: z.boolean(),
});

export type EVChargerData = z.infer<typeof EVChargerDataSchema>;

// ─── KNX Data ───────────────────────────────────────────────────────

export const KNXRoomSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  temperature: z.number().finite(),
  setpoint: z.number().finite().optional(),
  lightsOn: z.boolean(),
  brightness: z.number().int().min(0).max(100).optional(),
  windowOpen: z.boolean(),
  humidity: percentage.optional(),
  co2ppm: z.number().finite().nonnegative().optional(),
});

export const KNXDataSchema = z.object({
  rooms: z.array(KNXRoomSchema),
});

export type KNXData = z.infer<typeof KNXDataSchema>;

// ─── Tariff Data ────────────────────────────────────────────────────

export const TariffProviderSchema = z.enum(['tibber', 'awattar', 'entsoe', 'none']);
export const SGReadyStateSchema = z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]);

export const TariffDataSchema = z.object({
  currentPriceEurKWh: priceEurKwh,
  provider: TariffProviderSchema,
  sgReadyState: SGReadyStateSchema.optional(),
});

export type TariffData = z.infer<typeof TariffDataSchema>;

// ─── Unified Energy Model ──────────────────────────────────────────

export const UnifiedEnergyModelSchema = z.object({
  timestamp: z.number().int().positive(),
  pv: PVDataSchema,
  battery: BatteryDataSchema,
  grid: GridDataSchema,
  load: LoadDataSchema,
  evCharger: EVChargerDataSchema.optional(),
  knx: KNXDataSchema.optional(),
  tariff: TariffDataSchema.optional(),
});

export type UnifiedEnergyModel = z.infer<typeof UnifiedEnergyModelSchema>;

// ─── WebSocket Command (client → server) ────────────────────────────

export const WSCommandTypeSchema = z.enum([
  'SET_EV_POWER',
  'SET_HEAT_PUMP_POWER',
  'SET_BATTERY_POWER',
  'SET_EV_CURRENT',
  'START_CHARGING',
  'STOP_CHARGING',
  'SET_V2X_DISCHARGE',
  'SET_HEAT_PUMP_MODE',
  'SET_BATTERY_MODE',
  'SET_GRID_LIMIT',
  'KNX_TOGGLE_LIGHTS',
  'KNX_SET_TEMPERATURE',
  'KNX_TOGGLE_WINDOW',
]);

export type WSCommandType = z.infer<typeof WSCommandTypeSchema>;

/** MED-08 residential power cap — aligns with frontend command-safety.ts */
export const MAX_BATTERY_POWER_W = 25_000;
const MAX_POWER_W = MAX_BATTERY_POWER_W;
const MAX_HP_POWER_W = 15_000;
/** IEC 61851 residential ceiling — single source for WS + API protocol validation. */
export const MAX_EV_CURRENT_A = 80;

/** Shared validation copy — keep WS, API protocol, and adapter errors in sync. */
export const SET_EV_CURRENT_ERROR = `SET_EV_CURRENT requires a finite amp value between 0 and ${MAX_EV_CURRENT_A}`;

/** Residential EVCS power ceiling at protocol-adapter boundary (22 kW). */
export const MAX_EV_POWER_W = 22_000;

/** Shared validation copy for EV charging power at the protocol boundary. */
export const SET_EV_POWER_ERROR = `SET_EV_POWER requires a finite wattage between 0 and ${MAX_EV_POWER_W}`;

/** Shared validation copy for SG Ready integer modes 1–4. */
export const HEAT_PUMP_MODE_ERROR =
  'SET_HEAT_PUMP_MODE requires an integer SG Ready mode between 1 and 4';

/** EV charging power (watts) — protocol + adapter boundary. */
export const EvPowerValueSchema = z
  .number({ error: SET_EV_POWER_ERROR })
  .finite({ error: SET_EV_POWER_ERROR })
  .min(0, { error: SET_EV_POWER_ERROR })
  .max(MAX_EV_POWER_W, { error: SET_EV_POWER_ERROR });

/** EV charging current (amps) — protocol + adapter boundary. */
export const EvCurrentValueSchema = z
  .number({ error: SET_EV_CURRENT_ERROR })
  .finite({ error: SET_EV_CURRENT_ERROR })
  .min(0, { error: SET_EV_CURRENT_ERROR })
  .max(MAX_EV_CURRENT_A, { error: SET_EV_CURRENT_ERROR });

/** SG Ready discrete mode 1–4 — rejects fractional values at schema boundary. */
export const HeatPumpModeValueSchema = z
  .number({ error: HEAT_PUMP_MODE_ERROR })
  .int({ error: HEAT_PUMP_MODE_ERROR })
  .min(1, { error: HEAT_PUMP_MODE_ERROR })
  .max(4, { error: HEAT_PUMP_MODE_ERROR });

/** Shared validation copy for bidirectional ESS power at the WS boundary. */
export const SET_BATTERY_POWER_ERROR = `SET_BATTERY_POWER requires a finite wattage between -${MAX_BATTERY_POWER_W} and ${MAX_BATTERY_POWER_W}`;

/** Bidirectional ESS power (watts) — WS + protocol boundary. */
export const BatteryPowerValueSchema = z
  .number({ error: SET_BATTERY_POWER_ERROR })
  .finite({ error: SET_BATTERY_POWER_ERROR })
  .min(-MAX_BATTERY_POWER_W, { error: SET_BATTERY_POWER_ERROR })
  .max(MAX_BATTERY_POWER_W, { error: SET_BATTERY_POWER_ERROR });

/** Shared validation copy for battery mode strings/numbers at the WS boundary. */
export const SET_BATTERY_MODE_ERROR = 'SET_BATTERY_MODE requires a supported mode string or number';

/** Shared validation copy for KNX room temperature setpoints. */
export const KNX_TEMPERATURE_ERROR = 'KNX_SET_TEMPERATURE requires a temperature between 5 and 35';

/** KNX room temperature setpoint (°C) — WS boundary. */
export const KnxTemperatureValueSchema = z
  .number({ error: KNX_TEMPERATURE_ERROR })
  .finite({ error: KNX_TEMPERATURE_ERROR })
  .min(5, { error: KNX_TEMPERATURE_ERROR })
  .max(35, { error: KNX_TEMPERATURE_ERROR });

const BatteryModeWsValueSchema = z.union([
  z.literal('charge'),
  z.literal('discharge'),
  z.literal('self-consumption'),
  z.literal('force-charge'),
  z.literal('time-of-use'),
  z.literal('auto'),
  z.number().finite(),
]);

type WsCommandValue = number | string | boolean;
type WsRejectFn = (message: string) => void;

function validateNonNegativePower(
  label: string,
  value: WsCommandValue,
  maxW: number,
  reject: WsRejectFn,
): void {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    reject(`${label} requires a numeric value`);
    return;
  }
  if (value < 0 || value > maxW) {
    reject(`${label} requires a value between 0 and ${maxW}`);
  }
}

function refineWsCommandValue(
  type: WSCommandType,
  value: WsCommandValue,
  reject: WsRejectFn,
): void {
  switch (type) {
    case 'SET_EV_POWER':
      if (!EvPowerValueSchema.safeParse(value).success) {
        reject(SET_EV_POWER_ERROR);
      }
      return;
    case 'SET_V2X_DISCHARGE':
    case 'SET_GRID_LIMIT':
      validateNonNegativePower(type, value, MAX_POWER_W, reject);
      return;
    case 'SET_EV_CURRENT':
      if (!EvCurrentValueSchema.safeParse(value).success) {
        reject(SET_EV_CURRENT_ERROR);
      }
      return;
    case 'SET_HEAT_PUMP_POWER':
      validateNonNegativePower('SET_HEAT_PUMP_POWER', value, MAX_HP_POWER_W, reject);
      return;
    case 'SET_BATTERY_POWER':
      if (!BatteryPowerValueSchema.safeParse(value).success) {
        reject(SET_BATTERY_POWER_ERROR);
      }
      return;
    case 'SET_HEAT_PUMP_MODE':
      if (!HeatPumpModeValueSchema.safeParse(value).success) {
        reject(HEAT_PUMP_MODE_ERROR);
      }
      return;
    case 'SET_BATTERY_MODE':
      if (!BatteryModeWsValueSchema.safeParse(value).success) {
        reject(SET_BATTERY_MODE_ERROR);
      }
      return;
    case 'KNX_SET_TEMPERATURE':
      if (!KnxTemperatureValueSchema.safeParse(value).success) {
        reject(KNX_TEMPERATURE_ERROR);
      }
      return;
    case 'KNX_TOGGLE_LIGHTS':
    case 'KNX_TOGGLE_WINDOW':
      if (typeof value !== 'boolean') {
        reject(`${type} requires a boolean value`);
      }
      return;
    case 'START_CHARGING':
    case 'STOP_CHARGING':
      if (typeof value !== 'boolean' && typeof value !== 'number') {
        reject(`${type} requires a boolean or numeric value`);
      }
      return;
    default: {
      const _exhaustive: never = type;
      void _exhaustive;
    }
  }
}

/**
 * Base WS command schema. All commands must have a `type` and `value`.
 * Per-type caps align with frontend `commandSchemas` (C5 post-audit).
 */
export const WSCommandSchema = z
  .object({
    type: WSCommandTypeSchema,
    value: z.union([z.number().finite(), z.string(), z.boolean()]),
    /** Optional replay key — duplicate WS commands within TTL skip mock mutation. */
    idempotencyKey: z.string().min(1).max(128).optional(),
  })
  .superRefine((cmd, ctx) => {
    refineWsCommandValue(cmd.type, cmd.value, (message) => {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message });
    });
  });

export type WSCommand = z.infer<typeof WSCommandSchema>;

// ─── WebSocket Messages (server → client) ───────────────────────────

export const WSEnergyUpdateSchema = z.object({
  type: z.literal('ENERGY_UPDATE'),
  data: EnergyDataSchema,
});

export const WSErrorSchema = z.object({
  type: z.literal('ERROR'),
  error: z.string(),
});

export const WSMessageSchema = z.discriminatedUnion('type', [WSEnergyUpdateSchema, WSErrorSchema]);

export type WSMessage = z.infer<typeof WSMessageSchema>;

// ─── REST API Schemas ───────────────────────────────────────────────

/** POST /api/auth/token */
export const AuthTokenRequestSchema = z.object({
  clientId: z.string().trim().min(1).max(64),
  apiKey: z.string().trim().min(1).max(256).optional(),
  scope: z.enum(['read', 'readwrite', 'admin']).optional(),
});

export type AuthTokenRequest = z.infer<typeof AuthTokenRequestSchema>;

export const AuthTokenResponseSchema = z.object({
  token: z.string(),
  expiresIn: z.string(),
});

export type AuthTokenResponse = z.infer<typeof AuthTokenResponseSchema>;

/** JWT Payload */
export const JWTPayloadSchema = z.object({
  sub: z.string().min(1),
  scope: z.enum(['read', 'readwrite', 'admin']),
  iat: z.number().optional(),
  exp: z.number().optional(),
  kid: z.string().optional(),
});

export type JWTPayload = z.infer<typeof JWTPayloadSchema>;

/** POST /api/eebus/pair */
export const EEBUSPairRequestSchema = z.object({
  ski: z.string().trim().min(4).max(128),
});

export type EEBUSPairRequest = z.infer<typeof EEBUSPairRequestSchema>;

/** POST /api/eebus/discover/register */
export const EEBUSDiscoverRegisterSchema = z.object({
  ski: z.string().trim().min(4).max(128),
  host: z.string().trim().min(1).max(253),
  port: z.number().int().min(1).max(65535).optional(),
  brand: z.string().trim().max(64).optional(),
  model: z.string().trim().max(64).optional(),
  deviceType: z.string().trim().max(64).optional(),
});

export type EEBUSDiscoverRegisterRequest = z.infer<typeof EEBUSDiscoverRegisterSchema>;

// ─── EEBUS SHIP v1.0.1 / VDE-AR-E 2829-6 schemas ──────────────────

/** Full device info record stored in the SHIP trust store */
export const EEBUSDeviceInfoSchema = z.object({
  /** Subject Key Identifier (hex, no colons) — primary identity */
  ski: z.string().trim().min(4).max(128),
  hostname: z.string().min(1).max(253),
  port: z.number().int().min(1).max(65535),
  brand: z.string().max(64).optional(),
  model: z.string().max(64).optional(),
  deviceType: z.string().max(64).optional(),
  /** Trust store status */
  status: z.enum(['trusted', 'pending', 'failed']),
  /** Unix ms — when trust was first established */
  trustedAt: z.number().nonnegative(),
  /** Unix ms — last successful SPINE message exchange */
  lastConnectedAt: z.number().nonnegative().optional(),
});

export type EEBUSDeviceInfo = z.infer<typeof EEBUSDeviceInfoSchema>;

/** Response body for POST /api/eebus/pair */
export const EEBUSPairResponseSchema = z.object({
  status: z.enum(['connecting', 'pin_required', 'paired', 'failed']),
  ski: z.string().trim().min(4).max(128),
  message: z.string().optional(),
  /** Present when status === 'pin_required' */
  pinHint: z.string().optional(),
});

export type EEBUSPairResponse = z.infer<typeof EEBUSPairResponseSchema>;

/** POST /api/ocpp/proxy-session — mTLS credentials for browser SP3 proxy */
export const OcppProxySessionRequestSchema = z.object({
  host: z.string().trim().min(1).max(253),
  port: z.number().int().min(1).max(65535),
  stationId: z.string().trim().min(1).max(128),
  clientCert: z.string().trim().min(1).max(32_000),
  clientKey: z.string().trim().min(1).max(32_000),
  caCert: z.string().trim().max(32_000).optional(),
  revocationCheck: z.enum(['off', 'crl', 'ocsp']).optional(),
});

export type OcppProxySessionRequest = z.infer<typeof OcppProxySessionRequestSchema>;

/** Response body for POST /api/ocpp/proxy-session */
export const OcppProxySessionResponseSchema = z.object({
  sessionId: z.string().uuid(),
  expiresIn: z.number().int().positive(),
});

export type OcppProxySessionResponse = z.infer<typeof OcppProxySessionResponseSchema>;

/** Response body for GET /api/eebus/pair/status/:ski */
export const EEBUSPairStatusSchema = z.object({
  status: z.enum([
    'init',
    'tls_connecting',
    'tls_connected',
    'cmi_hello',
    'protocol',
    'pin_required',
    'pin_submitted',
    'connected',
    'failed',
    'timeout',
  ]),
  ski: z.string().trim().min(4).max(128),
  message: z.string().optional(),
  pinHint: z.string().optional(),
});

export type EEBUSPairStatus = z.infer<typeof EEBUSPairStatusSchema>;

/** Request body for POST /api/eebus/pair/pin */
export const EEBUSPinSubmitSchema = z.object({
  ski: z.string().trim().min(4).max(128),
  /** 5 or 6 decimal digits as displayed on the EEBUS device */
  pin: z.string().regex(/^\d{5,6}$/, 'PIN must be 5 or 6 decimal digits'),
});

export type EEBUSPinSubmit = z.infer<typeof EEBUSPinSubmitSchema>;

/** Admin TLS revocation policy for EEBUS SHIP mTLS */
export const EEBUSRevocationConfigSchema = z.object({
  mode: z.enum(['off', 'crl', 'ocsp']).default('off'),
  crlUrl: z.string().url().optional(),
  ocspUrl: z.string().url().optional(),
});

export type EEBUSRevocationConfig = z.infer<typeof EEBUSRevocationConfigSchema>;

/** Response body for GET /api/eebus/trust — array of trusted devices */
export const EEBUSTrustListSchema = z.array(EEBUSDeviceInfoSchema);

/** GET /api/health */
export const HealthResponseSchema = z.object({
  status: z.literal('ok'),
  uptime: z.number().nonnegative(),
  adapters: z.array(
    z.object({
      id: z.string(),
      status: z.string(),
    }),
  ),
  metrics: z.object({
    totalSamples: z.number().int().nonnegative(),
  }),
  jwt: z.object({
    kid: z.string(),
    rotationDueIn: z.string(),
  }),
});

export type HealthResponse = z.infer<typeof HealthResponseSchema>;
