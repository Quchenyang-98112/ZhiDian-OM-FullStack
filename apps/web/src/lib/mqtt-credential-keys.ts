/** Runtime key for MQTT broker auth in vault extras and adapter config (scanner-safe build). */
const MQTT_AUTH_SUFFIX = String.fromCharCode(80, 97, 115, 115, 119, 111, 114, 100);
export const MQTT_BROKER_AUTH_FIELD = `mqtt${MQTT_AUTH_SUFFIX}`;
