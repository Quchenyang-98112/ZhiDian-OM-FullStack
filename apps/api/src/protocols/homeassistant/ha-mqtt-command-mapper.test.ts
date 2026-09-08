import { SET_EV_CURRENT_ERROR, SET_EV_POWER_ERROR } from '@nexus-hems/shared-types';
import { describe, expect, it } from 'vitest';
import {
  haMqttSupportsCommand,
  mapProtocolCommandToMqttService,
  mqttServiceTopic,
  resolveHeatPumpModeServiceCall,
} from './ha-mqtt-command-mapper.js';

const entities = {
  wallboxCurrentEntityId: 'number.wallbox_max_current',
  wallboxSwitchEntityId: 'switch.wallbox_charging',
  heatPumpModeEntityId: 'number.heat_pump_sg_ready',
  mainsVoltage: 230,
};

describe('ha-mqtt-command-mapper', () => {
  it('supports EV and heat-pump MQTT commands', () => {
    expect(haMqttSupportsCommand('SET_EV_POWER')).toBe(true);
    expect(haMqttSupportsCommand('SET_EV_CURRENT')).toBe(true);
    expect(haMqttSupportsCommand('START_CHARGING')).toBe(true);
    expect(haMqttSupportsCommand('STOP_CHARGING')).toBe(true);
    expect(haMqttSupportsCommand('SET_HEAT_PUMP_MODE')).toBe(true);
    expect(haMqttSupportsCommand('SET_BATTERY_POWER')).toBe(false);
  });

  it('maps SET_EV_CURRENT to number/set_value', () => {
    const result = mapProtocolCommandToMqttService({ type: 'SET_EV_CURRENT', value: 16 }, entities);
    expect(result).toEqual({
      domain: 'number',
      service: 'set_value',
      payload: { entity_id: 'number.wallbox_max_current', value: 16 },
    });
  });

  it('rejects invalid SET_EV_CURRENT values', () => {
    const result = mapProtocolCommandToMqttService({ type: 'SET_EV_CURRENT', value: 81 }, entities);
    expect(result).toEqual({
      error: SET_EV_CURRENT_ERROR,
    });
  });

  it('rejects SET_EV_CURRENT when current entity is missing', () => {
    const result = mapProtocolCommandToMqttService(
      { type: 'SET_EV_CURRENT', value: 16 },
      { ...entities, wallboxCurrentEntityId: undefined },
    );
    expect(result).toEqual({ error: 'HA_WALLBOX_CURRENT_ENTITY not configured' });
  });

  it('clamps SET_EV_POWER derived amps to 80 A ceiling', () => {
    const result = mapProtocolCommandToMqttService(
      { type: 'SET_EV_POWER', value: 22_000 },
      entities,
    );
    expect(result).toMatchObject({
      domain: 'number',
      service: 'set_value',
      payload: { entity_id: 'number.wallbox_max_current', value: 80 },
    });
  });

  it('converts SET_EV_POWER watts to amps using mains voltage', () => {
    const result = mapProtocolCommandToMqttService({ type: 'SET_EV_POWER', value: 6900 }, entities);
    expect(result).toMatchObject({
      domain: 'number',
      service: 'set_value',
      payload: { entity_id: 'number.wallbox_max_current', value: 30 },
    });
  });

  it('rejects invalid SET_EV_POWER values', () => {
    const result = mapProtocolCommandToMqttService(
      { type: 'SET_EV_POWER', value: 25_000 },
      entities,
    );
    expect(result).toEqual({
      error: SET_EV_POWER_ERROR,
    });
  });

  it('rejects SET_EV_POWER when current entity is missing', () => {
    const result = mapProtocolCommandToMqttService(
      { type: 'SET_EV_POWER', value: 5000 },
      { ...entities, wallboxCurrentEntityId: undefined },
    );
    expect(result).toEqual({ error: 'HA_WALLBOX_CURRENT_ENTITY not configured' });
  });

  it('maps START_CHARGING to switch/turn_on', () => {
    const result = mapProtocolCommandToMqttService(
      { type: 'START_CHARGING', value: true },
      entities,
    );
    expect(result).toEqual({
      domain: 'switch',
      service: 'turn_on',
      payload: { entity_id: 'switch.wallbox_charging' },
    });
  });

  it('maps STOP_CHARGING to switch/turn_off', () => {
    const result = mapProtocolCommandToMqttService(
      { type: 'STOP_CHARGING', value: false },
      entities,
    );
    expect(result).toEqual({
      domain: 'switch',
      service: 'turn_off',
      payload: { entity_id: 'switch.wallbox_charging' },
    });
  });

  it('returns error when wallbox switch entity is missing for START_CHARGING', () => {
    const result = mapProtocolCommandToMqttService(
      { type: 'START_CHARGING', value: true },
      { ...entities, wallboxSwitchEntityId: undefined },
    );
    expect(result).toEqual({ error: 'HA_WALLBOX_SWITCH_ENTITY not configured' });
  });

  it('returns error when wallbox switch entity is missing for STOP_CHARGING', () => {
    const result = mapProtocolCommandToMqttService(
      { type: 'STOP_CHARGING', value: false },
      { ...entities, wallboxSwitchEntityId: undefined },
    );
    expect(result).toEqual({ error: 'HA_WALLBOX_SWITCH_ENTITY not configured' });
  });

  it('maps SET_HEAT_PUMP_MODE to number/set_value for SG Ready modes', () => {
    const result = mapProtocolCommandToMqttService(
      { type: 'SET_HEAT_PUMP_MODE', value: 2 },
      entities,
    );
    expect(result).toEqual({
      domain: 'number',
      service: 'set_value',
      payload: { entity_id: 'number.heat_pump_sg_ready', value: 2 },
    });
  });

  it('maps SET_HEAT_PUMP_MODE to select/select_option when entity is a select', () => {
    const result = mapProtocolCommandToMqttService(
      { type: 'SET_HEAT_PUMP_MODE', value: 3 },
      { ...entities, heatPumpModeEntityId: 'select.hp_sg_ready' },
    );
    expect(result).toEqual({
      domain: 'select',
      service: 'select_option',
      payload: { entity_id: 'select.hp_sg_ready', option: '3' },
    });
  });

  it('rejects bare domain names without object_id', () => {
    const result = mapProtocolCommandToMqttService(
      { type: 'SET_HEAT_PUMP_MODE', value: 2 },
      { ...entities, heatPumpModeEntityId: 'number' },
    );
    expect(result).toMatchObject({
      error: expect.stringContaining('full domain.entity_id'),
    });
  });

  it('rejects climate entities for SET_HEAT_PUMP_MODE', () => {
    const result = mapProtocolCommandToMqttService(
      { type: 'SET_HEAT_PUMP_MODE', value: 2 },
      { ...entities, heatPumpModeEntityId: 'climate.heat_pump' },
    );
    expect(result).toMatchObject({
      error: expect.stringContaining('full domain.entity_id'),
    });
  });

  it('resolveHeatPumpModeServiceCall supports input_number entities', () => {
    expect(resolveHeatPumpModeServiceCall('input_number.hp_mode', 4)).toEqual({
      domain: 'input_number',
      service: 'set_value',
      payload: { entity_id: 'input_number.hp_mode', value: 4 },
    });
  });

  it('rejects out-of-range SET_HEAT_PUMP_MODE values', () => {
    const result = mapProtocolCommandToMqttService(
      { type: 'SET_HEAT_PUMP_MODE', value: 5 },
      entities,
    );
    expect(result).toEqual({
      error: 'SET_HEAT_PUMP_MODE requires an integer SG Ready mode between 1 and 4',
    });
  });

  it('rejects non-numeric SET_HEAT_PUMP_MODE values', () => {
    const result = mapProtocolCommandToMqttService(
      { type: 'SET_HEAT_PUMP_MODE', value: 'heat' as unknown as number },
      entities,
    );
    expect(result).toEqual({
      error: 'SET_HEAT_PUMP_MODE requires an integer SG Ready mode between 1 and 4',
    });
  });

  it('rejects SET_HEAT_PUMP_MODE when climate entity is missing', () => {
    const result = mapProtocolCommandToMqttService(
      { type: 'SET_HEAT_PUMP_MODE', value: 1 },
      { ...entities, heatPumpModeEntityId: undefined },
    );
    expect(result).toEqual({ error: 'HA_HEAT_PUMP_MODE_ENTITY not configured' });
  });

  it('rejects unsupported command types', () => {
    const result = mapProtocolCommandToMqttService(
      { type: 'SET_BATTERY_POWER', value: 1000 },
      entities,
    );
    expect(result).toEqual({ error: 'Unsupported command type: SET_BATTERY_POWER' });
  });

  it('builds homeassistant MQTT service topic', () => {
    const call = {
      domain: 'switch',
      service: 'turn_on',
      payload: { entity_id: 'switch.wallbox_charging' },
    };
    expect(mqttServiceTopic('homeassistant', call)).toBe('homeassistant/switch/turn_on');
  });
});
