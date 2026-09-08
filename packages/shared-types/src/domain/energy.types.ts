/**
 * Domain Types for Nexus-HEMS Backend Protocol Adapters
 *
 * These types complement packages/shared-types/src/protocol.ts with
 * backend-specific interfaces for the EventBus → InfluxDB pipeline.
 *
 * Import: import type { IProtocolAdapter, UnifiedEnergyDatapoint } from '@nexus-hems/shared-types'
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Protocol Types
// ---------------------------------------------------------------------------

/** All supported hardware protocol identifiers */
export const ProtocolTypeSchema = z.enum([
  'victron-mqtt',
  'modbus-sunspec',
  'knx',
  'evcc',
  'openems',
  'ocpp',
  'eebus',
  'homeassistant-mqtt',
  'matter-thread',
  'zigbee2mqtt',
  'shelly-rest',
]);

export type ProtocolType = z.infer<typeof ProtocolTypeSchema>;

// ---------------------------------------------------------------------------
// Metric Types
// ---------------------------------------------------------------------------

/** Physical measurement dimensions for energy metrics */
export const MetricTypeSchema = z.enum([
  'POWER_W',
  'ENERGY_KWH',
  'SOC_PERCENT',
  'VOLTAGE_V',
  'CURRENT_A',
  'FREQUENCY_HZ',
  'TEMPERATURE_C',
  'CO2_PPM',
  'REACTIVE_POWER_VAR',
  'APPARENT_POWER_VA',
  'POWER_FACTOR',
]);

export type MetricType = z.infer<typeof MetricTypeSchema>;

// ---------------------------------------------------------------------------
// Energy Role (HIGH-17)
// ---------------------------------------------------------------------------

/**
 * The role a datapoint's source plays in the unified energy model.
 *
 * The datapoint model is metric-centric (deviceId + metric + value), but the
 * client `EnergyData` model is role-centric (pvPower, batteryPower, …). A single
 * device (e.g. a Victron system) can emit multiple roles via different
 * registers/topics, so `role` is a property of the source mapping — attached at
 * emit time — not of the deviceId. Optional and backward-compatible: producers
 * that omit it simply do not contribute to the live `EnergyData` snapshot.
 */
export const EnergyRoleSchema = z.enum(['pv', 'battery', 'grid', 'load', 'ev', 'heatpump']);

export type EnergyRole = z.infer<typeof EnergyRoleSchema>;

// ---------------------------------------------------------------------------
// Quality Indicators
// ---------------------------------------------------------------------------

/**
 * Data quality indicator following IEC 61968 / CIM standards:
 * - GOOD: Fresh measurement within the expected polling interval
 * - STALE: Measurement older than 30 s (adapter still connected but no update)
 * - ERROR: Measurement could not be parsed or validated
 */
export const QualityIndicatorSchema = z.enum(['GOOD', 'STALE', 'ERROR']);

export type QualityIndicator = z.infer<typeof QualityIndicatorSchema>;

// ---------------------------------------------------------------------------
// Unified Energy Datapoint
// ---------------------------------------------------------------------------

/**
 * The canonical unit of data flowing through the EventBus.
 * Every protocol adapter must produce this schema.
 */
export const energyDatapointSchema = z.object({
  /** Unix timestamp in milliseconds */
  timestamp: z.number().int().positive(),
  /** Unique device identifier (UUID or deterministic slug) */
  deviceId: z.string().min(1).max(128),
  /** Source protocol */
  protocol: ProtocolTypeSchema,
  /** Measured physical quantity */
  metric: MetricTypeSchema,
  /** Numeric value in the SI unit indicated by MetricType */
  value: z.number().finite(),
  /** Quality classification */
  qualityIndicator: QualityIndicatorSchema,
  /**
   * Optional role of the source in the unified energy model (HIGH-17).
   * When present, the LiveEnergyAggregator folds this datapoint into the
   * matching `EnergyData` field for live-mode WebSocket broadcast.
   */
  role: EnergyRoleSchema.optional(),
});

export type UnifiedEnergyDatapoint = z.infer<typeof energyDatapointSchema>;

// ---------------------------------------------------------------------------
// Adapter Health
// ---------------------------------------------------------------------------

export const AdapterHealthSchema = z.object({
  status: z.enum(['healthy', 'degraded', 'offline']),
  /** Unix ms of the last successful data read */
  lastSuccessMs: z.number().int().positive().optional(),
  /** Human-readable error description when status !== 'healthy' */
  errorMessage: z.string().optional(),
  /** Count of consecutive read errors since last success */
  consecutiveErrors: z.number().int().nonnegative().default(0),
});

export type AdapterHealth = z.infer<typeof AdapterHealthSchema>;

// ---------------------------------------------------------------------------
// IProtocolAdapter Interface
// ---------------------------------------------------------------------------

/**
 * All backend protocol adapters must implement this interface.
 * Analogous to the frontend EnergyAdapter but designed for
 * server-side Node.js processes with direct hardware access.
 */
export interface IProtocolAdapter {
  /** Immutable adapter instance identifier */
  readonly id: string;
  /** Protocol this adapter handles */
  readonly protocol: ProtocolType;

  /** Establish hardware connection and begin data acquisition */
  connect(): Promise<void>;

  /** Gracefully tear down the hardware connection */
  disconnect(): Promise<void>;

  /** Return the current health state of this adapter */
  healthCheck(): Promise<AdapterHealth>;

  /**
   * Async generator yielding validated UnifiedEnergyDatapoint values.
   * The generator should run indefinitely until disconnect() is called.
   * Invalid readings must be routed to the Dead-Letter Queue, not yielded.
   */
  getDataStream(): AsyncGenerator<UnifiedEnergyDatapoint>;
}

// ---------------------------------------------------------------------------
// Dead-Letter Queue Entry
// ---------------------------------------------------------------------------

export const DeadLetterEntrySchema = z.object({
  /** Unix ms when the message was received */
  ts: z.number().int().positive(),
  /** Source identifier (MQTT topic, Modbus device:register, etc.) */
  source: z.string(),
  /** Raw unparsed payload (truncated to 4 KB) */
  rawPayload: z.string().max(4096),
  /** Human-readable reason for rejection */
  error: z.string(),
  /** Protocol that produced this entry */
  protocol: ProtocolTypeSchema.optional(),
});

export type DeadLetterEntry = z.infer<typeof DeadLetterEntrySchema>;

// ---------------------------------------------------------------------------
// EventBus Subscriber Contract
// ---------------------------------------------------------------------------

/** Implemented by any service that consumes EventBus batches */
export interface EventBusSubscriber {
  onBatch(datapoints: UnifiedEnergyDatapoint[]): void | Promise<void>;
}

// ---------------------------------------------------------------------------
// Adapter Registry Entry
// ---------------------------------------------------------------------------

export interface AdapterRegistryEntry {
  id: string;
  protocol: ProtocolType;
  status: AdapterHealth['status'];
  startedAt: number;
  lastHealthCheck: number;
}
