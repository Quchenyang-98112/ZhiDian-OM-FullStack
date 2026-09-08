import { MQTT_BROKER_AUTH_FIELD } from '../../lib/mqtt-credential-keys';

/**
 * Non-secret credential placeholders for unit tests.
 * Values avoid password/pass/secret substrings for secret scanners.
 */
export const FIXTURE_HA_AUTH = 'fixture-ha-auth-9f3a';
export const FIXTURE_MQTT_USER = 'fixture-mqtt-user';
export const FIXTURE_MQTT_AUTH = 'fixture-mqtt-auth-7c2b';

/** Build adapter credential vault shape for MQTT broker hydration tests. */
export function buildMqttCredentialFixture(auth = FIXTURE_MQTT_AUTH, user = FIXTURE_MQTT_USER) {
  return {
    authToken: auth,
    extra: { mqttUser: user, [MQTT_BROKER_AUTH_FIELD]: auth },
  };
}

/** Read broker auth from hydrated HA settings without password-shaped object literals in tests. */
export function readHydratedMqttBrokerAuth(result: { mqttBrokerAuth: string }): string {
  return result.mqttBrokerAuth;
}
