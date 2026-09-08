/**
 * OpenEMS component write allowlist — mirrors frontend OpenEMSAdapter rules.
 */

const COMPONENT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const PROPERTY_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

export interface OpenEMSWritableComponentRule {
  idPattern: RegExp;
  factoryPrefix?: string;
  factoryId?: string;
  allowedProperties: readonly string[];
}

export const OPENEMS_WRITABLE_COMPONENT_RULES: readonly OpenEMSWritableComponentRule[] = [
  {
    idPattern: /^ctrlEssFixActivePower\d+$/,
    factoryPrefix: 'Controller.Ess.FixActivePower',
    allowedProperties: ['power', 'mode'],
  },
  {
    idPattern: /^ctrlPeakShaving\d+$/,
    factoryPrefix: 'Controller.Symmetric.PeakShaving',
    allowedProperties: ['peakShavingPower'],
  },
  {
    idPattern: /^evcs\d+$/,
    factoryPrefix: 'Evcs.',
    allowedProperties: ['setChargePowerLimit'],
  },
  {
    idPattern: /^ctrlEvcs\d+$/,
    factoryPrefix: 'Controller.Evcs',
    allowedProperties: ['enabledCharging'],
  },
  {
    idPattern: /^ctrlIoHeatPumpSgReady\d+$/,
    factoryId: 'Controller.Io.HeatPump.SgReady',
    allowedProperties: ['mode'],
  },
] as const;

export function isSafeComponentId(id: string): boolean {
  return COMPONENT_ID_PATTERN.test(id);
}

export function isSafePropertyName(name: string): boolean {
  return PROPERTY_NAME_PATTERN.test(name);
}

export function sanitizePropertyValue(value: unknown): number | string | boolean | null {
  if (value === null) return null;
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    return value.length > 256 ? value.slice(0, 256) : value;
  }
  return null;
}

export function getWritablePropertyAllowlist(componentId: string): Set<string> | null {
  for (const rule of OPENEMS_WRITABLE_COMPONENT_RULES) {
    if (!rule.idPattern.test(componentId)) continue;
    return new Set(rule.allowedProperties);
  }
  return null;
}

export function sanitizeWritableProperties(
  componentId: string,
  properties: Array<{ name: string; value: unknown }>,
): Array<{ name: string; value: number | string | boolean | null }> {
  const allowlist = getWritablePropertyAllowlist(componentId);
  if (!allowlist) return [];

  return properties
    .filter((property) => allowlist.has(property.name) && isSafePropertyName(property.name))
    .map((property) => ({
      name: property.name,
      value: sanitizePropertyValue(property.value),
    }));
}
