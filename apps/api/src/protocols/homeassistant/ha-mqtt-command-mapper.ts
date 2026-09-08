/**
 * Maps ProtocolCommandRequest values to Home Assistant MQTT service publishes.
 *
 * Topic format (HA MQTT integration): `{topicPrefix}/{domain}/{service}`
 * Payload: JSON service_data fields (entity_id, value, hvac_mode, …).
 */

import {
  HEAT_PUMP_MODE_ERROR,
  HeatPumpModeValueSchema,
  MAX_EV_CURRENT_A,
  SET_EV_CURRENT_ERROR,
  SET_EV_POWER_ERROR,
  type WSCommandType,
} from '@nexus-hems/shared-types';
import type { ProtocolCommandRequest } from '../protocol-command.js';
import {
  EvCurrentValueSchema,
  EvPowerValueSchema,
  HeatPumpModeEntityIdSchema,
} from '../protocol-command.js';

export interface HAMqttServiceCall {
  domain: string;
  service: string;
  payload: Record<string, unknown>;
}

export interface HAMqttCommandEntities {
  wallboxCurrentEntityId?: string;
  wallboxSwitchEntityId?: string;
  heatPumpModeEntityId?: string;
  mainsVoltage: number;
}

const HA_MQTT_EV_COMMANDS = new Set<WSCommandType>([
  'SET_EV_POWER',
  'SET_EV_CURRENT',
  'START_CHARGING',
  'STOP_CHARGING',
  'SET_HEAT_PUMP_MODE',
]);

export function haMqttSupportsCommand(type: WSCommandType): boolean {
  return HA_MQTT_EV_COMMANDS.has(type);
}

/** Route SG Ready 1–4 to the HA MQTT service matching the configured entity domain. */
export function resolveHeatPumpModeServiceCall(
  entityId: string,
  mode: number,
): HAMqttServiceCall | { error: string } {
  const entity = HeatPumpModeEntityIdSchema.safeParse(entityId);
  if (!entity.success) {
    return {
      error:
        entity.error.issues[0]?.message ??
        'HA_HEAT_PUMP_MODE_ENTITY must be a full domain.entity_id for SG Ready modes 1–4',
    };
  }
  const domain = entity.data.split('.')[0];
  switch (domain) {
    case 'number':
    case 'input_number':
      return {
        domain,
        service: 'set_value',
        payload: { entity_id: entity.data, value: mode },
      };
    case 'select':
      return {
        domain: 'select',
        service: 'select_option',
        payload: { entity_id: entity.data, option: String(mode) },
      };
    default:
      return {
        error: `HA_HEAT_PUMP_MODE_ENTITY domain "${domain}" is unsupported for SG Ready modes 1–4; use number, input_number, or select`,
      };
  }
}

export function mapProtocolCommandToMqttService(
  command: ProtocolCommandRequest,
  entities: HAMqttCommandEntities,
): HAMqttServiceCall | { error: string } {
  switch (command.type) {
    case 'SET_EV_CURRENT': {
      const current = EvCurrentValueSchema.safeParse(command.value);
      if (!current.success) {
        return {
          error: SET_EV_CURRENT_ERROR,
        };
      }
      if (!entities.wallboxCurrentEntityId) {
        return { error: 'HA_WALLBOX_CURRENT_ENTITY not configured' };
      }
      return {
        domain: 'number',
        service: 'set_value',
        payload: { entity_id: entities.wallboxCurrentEntityId, value: current.data },
      };
    }
    case 'SET_EV_POWER': {
      const power = EvPowerValueSchema.safeParse(command.value);
      if (!power.success) {
        return { error: SET_EV_POWER_ERROR };
      }
      if (!entities.wallboxCurrentEntityId) {
        return { error: 'HA_WALLBOX_CURRENT_ENTITY not configured' };
      }
      const derivedA = Math.round((power.data / entities.mainsVoltage) * 10) / 10;
      const currentA = Math.min(derivedA, MAX_EV_CURRENT_A);
      return {
        domain: 'number',
        service: 'set_value',
        payload: { entity_id: entities.wallboxCurrentEntityId, value: currentA },
      };
    }
    case 'START_CHARGING':
      if (!entities.wallboxSwitchEntityId) {
        return { error: 'HA_WALLBOX_SWITCH_ENTITY not configured' };
      }
      return {
        domain: 'switch',
        service: 'turn_on',
        payload: { entity_id: entities.wallboxSwitchEntityId },
      };
    case 'STOP_CHARGING':
      if (!entities.wallboxSwitchEntityId) {
        return { error: 'HA_WALLBOX_SWITCH_ENTITY not configured' };
      }
      return {
        domain: 'switch',
        service: 'turn_off',
        payload: { entity_id: entities.wallboxSwitchEntityId },
      };
    case 'SET_HEAT_PUMP_MODE': {
      const mode = HeatPumpModeValueSchema.safeParse(command.value);
      if (!mode.success) {
        return { error: HEAT_PUMP_MODE_ERROR };
      }
      if (!entities.heatPumpModeEntityId) {
        return { error: 'HA_HEAT_PUMP_MODE_ENTITY not configured' };
      }
      return resolveHeatPumpModeServiceCall(entities.heatPumpModeEntityId, mode.data);
    }
    default:
      return { error: `Unsupported command type: ${command.type}` };
  }
}

export function mqttServiceTopic(topicPrefix: string, call: HAMqttServiceCall): string {
  return `${topicPrefix}/${call.domain}/${call.service}`;
}
