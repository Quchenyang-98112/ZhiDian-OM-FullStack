/**
 * Modbus SunSpec REST proxy — gateway for the in-browser ModbusSunSpecAdapter.
 *
 * The frontend adapter (`apps/web/src/core/adapters/ModbusSunSpecAdapter.ts`) polls
 *   GET  /api/modbus/sunspec?model=common|inverter|battery|meter
 *   POST /api/modbus/write   { register, value, model? }
 * against its configured `baseUrl`. When that baseUrl is the Nexus backend, these
 * routes answer with SunSpec-model-shaped data derived from the mock energy layer,
 * so the adapter is fully functional in the default (mock) deployment without any
 * external hardware — closing the gap where the frontend called routes that 404'd.
 *
 * Real hardware: point the adapter's baseUrl at a dedicated SunSpec-REST bridge,
 * or extend this gateway with a live read/write path. The backend `ModbusAdapter`
 * (`apps/api/src/protocols/modbus`) is read-only by design and exposes no
 * on-demand read or register-write API, so the live write path returns 501 rather
 * than faking success.
 *
 * Writes are validated against a register allowlist + per-register value bounds
 * (mirroring `apps/web` command-safety caps) and recorded in the server-side
 * command audit trail (`data/command-audit.ts`).
 */

import { type NextFunction, type Request, type Response, Router } from 'express';
import { z } from 'zod';
import { getEffectiveAdapterMode } from '../config/adapter-mode.js';
import { isReadOnlyMode } from '../config/read-only-mode.js';
import { writeCommandAuditEntry } from '../data/command-audit.js';
import { mockData } from '../data/mock-data.js';
import { type JWTScope, requireJWT, requireScope } from '../middleware/auth.js';
import { idempotencyMiddleware } from '../middleware/idempotency.js';
import { requireNotReadOnly } from '../middleware/require-not-read-only.js';

type ModelName = 'common' | 'inverter' | 'battery' | 'meter';

const ModelQuerySchema = z.object({
  model: z.enum(['common', 'inverter', 'battery', 'meter']),
});

/** Writable SunSpec registers — allowlist with per-register bounds. */
const WRITE_BOUNDS = {
  WChaMax: { min: 0, max: 25_000 }, // max charge rate (W) — §14a residential ceiling
  StorCtl_Mod: { min: 0, max: 3 }, // storage control mode (bitfield)
  WMaxLimPct: { min: 0, max: 100 }, // active-power limit (% of WMax)
} as const;

const WriteBodySchema = z.object({
  register: z.enum(['WChaMax', 'StorCtl_Mod', 'WMaxLimPct']),
  value: z.number().finite(),
  model: z.number().int().optional(),
});

/** Build a SunSpec-model-shaped payload from the mock energy layer. */
function buildSunSpecModel(model: ModelName): Record<string, unknown> {
  switch (model) {
    case 'common':
      return { Mn: 'Nexus-HEMS', Md: 'Mock SunSpec Gateway', SN: 'NEXUS-MOCK-0001', Vr: '1.2.0' };
    case 'inverter': {
      const dcV = 400;
      return {
        W: mockData.pvPower,
        WH: Math.round(mockData.pvYieldToday * 1000),
        W_SF: 0,
        WH_SF: 0,
        PhVphA: mockData.gridVoltage,
        Hz: 50,
        St: mockData.pvPower > 0 ? 4 : 2, // 4=MPPT, 2=Sleeping
        strings: [{ DCA: dcV > 0 ? mockData.pvPower / dcV : 0, DCV: dcV, DCW: mockData.pvPower }],
      };
    }
    case 'battery':
      return {
        W: mockData.batteryPower,
        SoC: mockData.batterySoC,
        V: mockData.batteryVoltage,
        A: mockData.batteryVoltage > 0 ? mockData.batteryPower / mockData.batteryVoltage : 0,
        W_SF: 0,
        SoC_SF: 0,
        // 4=Charging, 3=Discharging, 6=Holding
        ChaSt: mockData.batteryPower > 0 ? 4 : mockData.batteryPower < 0 ? 3 : 6,
      };
    case 'meter':
      return {
        W: mockData.gridPower,
        PhV: mockData.gridVoltage,
        Hz: 50,
        TotWhImp: Math.max(0, Math.round(mockData.gridPower)) * 10,
        TotWhExp: Math.max(0, Math.round(-mockData.gridPower)) * 10,
        W_SF: 0,
      };
  }
}

/** Reflect an accepted write into the mock model so the demo responds to it. */
function applyWriteToMock(register: keyof typeof WRITE_BOUNDS, value: number): void {
  if (register === 'WChaMax') mockData.batteryPower = value;
  // StorCtl_Mod / WMaxLimPct have no direct scalar in the mock model — audited only.
}

function audit(
  res: Response,
  commandType: string,
  value: number | null,
  outcome: 'accepted' | 'rejected_validation' | 'rejected_scope' | 'rejected_readonly',
  reason?: string,
): void {
  const payload = res.locals.jwtPayload as { sub?: string; scope?: string } | undefined;
  writeCommandAuditEntry({
    ts: Date.now(),
    clientId: payload?.sub ?? 'unknown',
    scope: (payload?.scope as JWTScope) ?? 'read',
    commandType,
    value,
    outcome,
    reason,
    mode: getEffectiveAdapterMode(),
  });
}

export function createModbusRoutes(): Router {
  const router = Router();

  // Read a SunSpec model block (read scope is sufficient).
  router.get('/api/modbus/sunspec', requireJWT, (req: Request, res: Response) => {
    const parsed = ModelQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid model parameter', details: parsed.error.issues });
      return;
    }
    res.status(200).json(buildSunSpecModel(parsed.data.model));
  });

  // Preserve the per-register audit context while still using the shared middleware response.
  function requireNotReadOnlyWithModbusAudit(
    req: Request,
    res: Response,
    next: NextFunction,
  ): void {
    if (isReadOnlyMode()) {
      const parsed = WriteBodySchema.safeParse(req.body);
      if (parsed.success) {
        const { register, value } = parsed.data;
        audit(
          res,
          `MODBUS_WRITE:${register}`,
          value,
          'rejected_readonly',
          'READ_ONLY_MODE=true blocks all control commands',
        );
      } else {
        audit(res, 'MODBUS_WRITE', null, 'rejected_readonly', 'invalid body in read-only mode');
      }
    }
    requireNotReadOnly(req, res, next);
  }

  // Write a SunSpec register — hardware-affecting, so readwrite scope + validation + audit.
  router.post(
    '/api/modbus/write',
    requireJWT,
    requireScope('readwrite'),
    idempotencyMiddleware,
    requireNotReadOnlyWithModbusAudit,
    (req: Request, res: Response) => {
      const parsed = WriteBodySchema.safeParse(req.body);
      if (!parsed.success) {
        audit(res, 'MODBUS_WRITE', null, 'rejected_validation', 'invalid body');
        res.status(400).json({ error: 'Invalid write request', details: parsed.error.issues });
        return;
      }

      const { register, value } = parsed.data;

      const bounds = WRITE_BOUNDS[register];
      if (value < bounds.min || value > bounds.max) {
        audit(res, `MODBUS_WRITE:${register}`, value, 'rejected_validation', 'value out of range');
        res
          .status(400)
          .json({ error: `Value out of range for ${register} (${bounds.min}..${bounds.max})` });
        return;
      }

      // Live write path is intentionally not implemented (read-only backend adapter).
      if (getEffectiveAdapterMode() === 'live') {
        audit(
          res,
          `MODBUS_WRITE:${register}`,
          value,
          'rejected_validation',
          'live write unsupported',
        );
        res.status(501).json({
          error: 'Live Modbus write not implemented; configure an external SunSpec-REST bridge.',
        });
        return;
      }

      applyWriteToMock(register, value);
      audit(res, `MODBUS_WRITE:${register}`, value, 'accepted');
      res.status(200).json({ ok: true, register, value });
    },
  );

  return router;
}
