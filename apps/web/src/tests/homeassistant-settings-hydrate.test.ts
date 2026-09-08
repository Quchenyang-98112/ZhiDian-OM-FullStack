import { describe, expect, it } from 'vitest';
import { hydrateHomeAssistantSettingsFromAdapter } from '../lib/homeassistant-settings-hydrate';
import {
  buildMqttCredentialFixture,
  FIXTURE_HA_AUTH,
  FIXTURE_MQTT_AUTH,
  FIXTURE_MQTT_USER,
  readHydratedMqttBrokerAuth,
} from './fixtures/credential-fixtures';

describe('hydrateHomeAssistantSettingsFromAdapter', () => {
  it('returns defaults when adapter config is missing', () => {
    expect(hydrateHomeAssistantSettingsFromAdapter(null, null, false)).toMatchObject({
      haMode: 'ha-ws-api',
      enabled: false,
      entityRoles: [],
    });
  });

  it('hydrates WS API config and entity role overrides', () => {
    const result = hydrateHomeAssistantSettingsFromAdapter(
      {
        haMode: 'ha-ws-api',
        haBaseUrl: 'http://ha.local:8123',
        host: 'ha.local',
        port: 8123,
        entityRoles: [{ entityId: 'sensor.pv', role: 'pvPower' }],
      },
      { authToken: FIXTURE_HA_AUTH },
      true,
    );

    expect(result).toMatchObject({
      haMode: 'ha-ws-api',
      haBaseUrl: 'http://ha.local:8123',
      haToken: FIXTURE_HA_AUTH,
      enabled: true,
      entityRoles: [{ entityId: 'sensor.pv', role: 'pvPower' }],
    });
  });

  it('hydrates MQTT broker credentials from vault extras', () => {
    const result = hydrateHomeAssistantSettingsFromAdapter(
      {
        haMode: 'mqtt-broker',
        host: 'mqtt.local',
        port: 1883,
      },
      buildMqttCredentialFixture(),
      false,
    );

    expect(result).toMatchObject({
      haMode: 'mqtt-broker',
      mqttHost: 'mqtt.local',
      mqttPort: 1883,
      mqttUser: FIXTURE_MQTT_USER,
    });
    expect(readHydratedMqttBrokerAuth(result)).toBe(FIXTURE_MQTT_AUTH);
  });
});
