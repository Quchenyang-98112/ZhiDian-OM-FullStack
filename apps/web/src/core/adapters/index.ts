/**
 * HEMS Protocol Adapters — Barrel Export
 *
 * All adapter implementations, the core interface, and the plugin registry
 * are re-exported from here.
 */

export type { AdapterFactory, AdapterRegistration } from './adapter-registry';
// Plugin registry
export {
  createRegisteredAdapter,
  getRegisteredAdapter,
  isAdapterRegistered,
  listRegisteredAdapters,
  loadAllContribAdapters,
  loadContribAdapter,
  registerAdapter,
  registerBuiltinAdapters,
  unregisterAdapter,
} from './adapter-registry';
export type { AdapterPerfMetrics, CommandConfirmFn } from './BaseAdapter';
// Base class & error types
export { BaseAdapter, CommandCancelledError } from './BaseAdapter';
export type {
  EEBUSAdapterConfig,
  EEBUSConnectionEvent,
  EEBUSDeviceType,
  EEBUSDiscoveredDevice,
  EEBUSEntity,
  EEBUSFeature,
  EEBUSFeatureType,
  EEBUSIncentive,
  EEBUSLoadControlLimit,
  EEBUSMeasurement,
  SHIPConnectionState,
} from './EEBUSAdapter';
export { EEBUSAdapter } from './EEBUSAdapter';
// Core types & interface
export type {
  AdapterCapability,
  AdapterCommand,
  AdapterCommandType,
  AdapterConnectionConfig,
  AdapterDataCallback,
  AdapterEvent,
  AdapterEventType,
  AdapterStatus,
  AdapterStatusCallback,
  BatteryData,
  EnergyAdapter,
  EVChargerData,
  GridData,
  KNXData,
  KNXRoom,
  LoadData,
  PVData,
  TariffData,
  UnifiedEnergyModel,
} from './EnergyAdapter';
export type { KNXAdapterConfig, KNXMQTTConfig, KNXRoomConfig, KNXTransport } from './KNXAdapter';
export { KNXAdapter } from './KNXAdapter';
export type { SunSpecDeviceInfo } from './ModbusSunSpecAdapter';
export { ModbusSunSpecAdapter, SUNSPEC_MODELS } from './ModbusSunSpecAdapter';
export type { OCPPAdapterConfig, OCPPSecurityProfile } from './OCPP21Adapter';
export { OCPP21Adapter } from './OCPP21Adapter';
export type { OcppRevocationCheck, OcppSecurityInput } from './ocpp-security';
export { prepareOcppConnection } from './ocpp-security';
export type {
  VictronAdapterConfig,
  VictronConnectionMode,
  VictronGatewayType,
} from './VictronMQTTAdapter';
// Adapter implementations
export { VENUS_DBUS_PATHS, VENUS_MQTT_PREFIX, VictronMQTTAdapter } from './VictronMQTTAdapter';
