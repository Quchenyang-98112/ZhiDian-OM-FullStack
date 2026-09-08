import { z } from 'zod';
import type { StoredSettings } from '../types';

const gatewayTypeSchema = z.enum(['cerbo-gx', 'cerbo-gx-mk2', 'raspberry-pi']);
const tariffProviderSchema = z.enum(['tibber', 'awattar', 'entsoe', 'none']);

/** Permissive nested config — preset shapes vary; reject only non-objects. */
const systemConfigSchema = z
  .object({
    presetId: z.string().max(120).optional(),
    presetName: z.string().max(200).optional(),
  })
  .passthrough();

/**
 * Validates settings JSON on import. All fields optional; unknown top-level keys stripped.
 */
export const storedSettingsImportSchema = z
  .object({
    gatewayType: gatewayTypeSchema.optional(),
    systemConfig: systemConfigSchema.optional(),
    victronIp: z.string().max(253).optional(),
    knxIp: z.string().max(253).optional(),
    wsPort: z.number().int().min(1).max(65535).optional(),
    refreshRateMs: z.number().int().min(500).max(30000).optional(),
    tariffProvider: tariffProviderSchema.optional(),
    tariffRegion: z.string().max(32).optional(),
    dynamicGridFees: z.boolean().optional(),
    gridOperatorName: z.string().max(120).optional(),
    chargeThreshold: z.number().min(0).max(1).optional(),
    maxGridImportKw: z.number().min(0).max(100).optional(),
    mtls: z.boolean().optional(),
    telemetryDisabled: z.boolean().optional(),
    twoFactor: z.boolean().optional(),
    influxUrl: z.string().max(512).optional(),
    influxToken: z.string().max(512).optional(),
    historyDays: z.number().int().min(1).max(365).optional(),
    location: z
      .object({
        lat: z.number().min(-90).max(90),
        lon: z.number().min(-180).max(180),
      })
      .optional(),
    gridPriceAvg: z.number().min(0).max(10).optional(),
    animations: z.boolean().optional(),
    compactMode: z.boolean().optional(),
    glowEffects: z.boolean().optional(),
    units: z.enum(['metric', 'imperial']).optional(),
    dateFormat: z.enum(['dd.mm.yyyy', 'mm/dd/yyyy', 'yyyy-mm-dd']).optional(),
    currency: z.enum(['eur', 'chf', 'gbp']).optional(),
    mqttAutoDiscovery: z.boolean().optional(),
    fontScale: z.number().min(0.75).max(1.5).optional(),
    reducedMotion: z.boolean().optional(),
    highContrast: z.boolean().optional(),
    pushNotifications: z.boolean().optional(),
    priceAlerts: z.boolean().optional(),
    batteryAlerts: z.boolean().optional(),
    gridAlerts: z.boolean().optional(),
    updateNotifications: z.boolean().optional(),
    batteryAlertThreshold: z.number().min(0).max(100).optional(),
    priceAlertThreshold: z.number().min(0).max(5).optional(),
    quietHoursEnabled: z.boolean().optional(),
    quietHoursStart: z.string().max(8).optional(),
    quietHoursEnd: z.string().max(8).optional(),
    feedInTariff: z.number().min(0).max(1).optional(),
    gridOperator: z.string().max(120).optional(),
    monthlyBudget: z.number().min(0).max(100000).optional(),
    pvPeakKw: z.number().min(0).max(500).optional(),
    batteryCapacityKWh: z.number().min(0).max(500).optional(),
    batteryMaxChargeKW: z.number().min(0).max(500).optional(),
    batteryMinSoC: z.number().min(0).max(100).optional(),
    evMaxPowerKW: z.number().min(0).max(350).optional(),
    heatPumpPowerKW: z.number().min(0).max(50).optional(),
    feedInTariffEurKWh: z.number().min(0).max(1).optional(),
    dashboardRefreshSec: z.number().int().min(5).max(300).optional(),
    sidebarPosition: z.enum(['left', 'right']).optional(),
    debugMode: z.boolean().optional(),
    experimentalFeatures: z.boolean().optional(),
    performanceMode: z.boolean().optional(),
    autoBackup: z.boolean().optional(),
    keyboardShortcuts: z.boolean().optional(),
  })
  .strip();

export function parseStoredSettingsImport(data: unknown): Partial<StoredSettings> | null {
  const result = storedSettingsImportSchema.safeParse(data);
  if (!result.success) return null;
  // skipcq: JS-0339 — Zod strict schema output is a safe Partial<StoredSettings> subset
  return result.data as unknown as Partial<StoredSettings>;
}

/** Strip unknown/invalid keys from persisted localStorage settings on hydration. */
export function sanitizePersistedSettings(raw: unknown): Partial<StoredSettings> {
  return parseStoredSettingsImport(raw) ?? {};
}
