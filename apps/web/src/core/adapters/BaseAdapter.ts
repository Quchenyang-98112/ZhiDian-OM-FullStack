/**
 * BaseAdapter — Abstract base class for all HEMS protocol adapters
 *
 * Every concrete adapter (Victron, Modbus, KNX, OCPP, EEBUS) extends this
 * class to get safety-critical features built-in:
 *
 *   1. Circuit Breaker  — per-adapter, auto-opens after N failures
 *   2. Zod Validation   — every command validated before dispatch
 *   3. Double-Confirm   — injectable confirmation delegate for danger commands
 *   4. Audit Trail      — every command logged to IndexedDB + Prometheus
 *   5. Reconnect Logic  — exponential backoff with jitter + navigator.onLine
 *   6. Lifecycle Mgmt   — connect/disconnect/destroy with guard checks
 *   7. Per-Adapter Metrics — latency, error-rate, data-freshness tracking
 *
 * Subclasses implement three abstract methods:
 *   _connect()     — establish the actual connection
 *   _disconnect()  — close the actual connection
 *   _sendCommand() — send a command to the hardware
 */

import { logger } from '../../lib/logger';
import { metricsCollector } from '../../lib/metrics';
import { CircuitBreaker, type CircuitBreakerConfig } from '../circuit-breaker';
import { logCommandAudit, requiresConfirmation, validateCommand } from '../command-safety';
import type {
  AdapterCapability,
  AdapterCommand,
  AdapterConnectionConfig,
  AdapterDataCallback,
  AdapterStatus,
  AdapterStatusCallback,
  EnergyAdapter,
  UnifiedEnergyModel,
} from './EnergyAdapter';

// ─── Error types ─────────────────────────────────────────────────────

export class CommandCancelledError extends Error {
  constructor(commandType: string) {
    super(`Command "${commandType}" was cancelled by the user`);
    this.name = 'CommandCancelledError';
  }
}

// ─── Confirmation delegate ───────────────────────────────────────────

/**
 * Injected by the React layer (e.g. useAdapterBridge) to show a
 * Radix UI confirmation dialog for danger commands.
 */
export type CommandConfirmFn = (command: AdapterCommand) => Promise<boolean>;

// ─── Default reconnect config ────────────────────────────────────────

const BASE_RECONNECT = {
  enabled: true,
  initialDelayMs: 1500,
  maxDelayMs: 60_000,
  backoffMultiplier: 2,
};

// ─── Abstract Base Class ─────────────────────────────────────────────

// ─── Per-adapter performance metrics ─────────────────────────────────

export interface AdapterPerfMetrics {
  /** Last successful data timestamp */
  lastDataAt: number;
  /** Last connection attempt timestamp */
  lastConnectAttemptAt: number;
  /** Rolling average latency (ms) for the last N data updates */
  avgLatencyMs: number;
  /** Total error count since creation */
  totalErrors: number;
  /** Total successful data updates */
  totalUpdates: number;
  /** Data freshness: ms since last data update */
  dataFreshnessMs: number;
  /** Error rate: errors / (errors + successes) */
  errorRate: number;
  /** Consecutive reconnect attempts */
  reconnectAttempts: number;
  /** Whether the browser is currently online */
  isOnline: boolean;
}

export abstract class BaseAdapter implements EnergyAdapter {
  abstract readonly id: string;
  abstract readonly name: string;
  abstract readonly capabilities: AdapterCapability[];

  protected _status: AdapterStatus = 'disconnected';
  protected dataCallbacks: AdapterDataCallback[] = [];
  protected statusCallbacks: AdapterStatusCallback[] = [];
  protected snapshot: Partial<UnifiedEnergyModel> = {};
  protected destroyed = false;
  protected reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  protected retryDelay: number;
  protected config: AdapterConnectionConfig;

  /** Exposes connection config for settings hydration (no secrets beyond in-memory adapter state). */
  getConnectionConfig(): Readonly<AdapterConnectionConfig> {
    return this.config;
  }

  /** Public circuit breaker — the store reads this for reactive UI state */
  readonly circuitBreaker: CircuitBreaker;

  /** Injected by the React layer for double-confirm on danger commands */
  confirmCommand?: CommandConfirmFn;

  // ─── Per-adapter performance tracking ─────────────────────────
  private _lastDataAt = 0;
  private _lastConnectAttemptAt = 0;
  private _totalErrors = 0;
  private _totalUpdates = 0;
  private _reconnectAttempts = 0;
  private _latencyBuffer: number[] = [];
  private readonly _latencyBufferSize = 20;
  private _onlineHandler: (() => void) | null = null;
  private _offlineHandler: (() => void) | null = null;

  // Lazy child logger — resolved after derived class sets this.id
  private _log?: ReturnType<typeof logger.child>;
  protected get log(): ReturnType<typeof logger.child> {
    if (!this._log) this._log = logger.child(this.id);
    return this._log;
  }

  constructor(
    config: AdapterConnectionConfig,
    circuitBreakerConfig?: Partial<CircuitBreakerConfig>,
  ) {
    this.config = config;
    this.circuitBreaker = new CircuitBreaker({
      failureThreshold: 5,
      cooldownMs: 30_000,
      halfOpenSuccessThreshold: 2,
      ...circuitBreakerConfig,
    });
    this.retryDelay = config.reconnect?.initialDelayMs ?? BASE_RECONNECT.initialDelayMs;

    // Track circuit breaker state changes in Prometheus + structured log
    this.circuitBreaker.onStateChange((state) => {
      metricsCollector.recordCircuitBreakerState(this.id, state);
      if (state === 'open') {
        this.log.error('Circuit breaker opened — all calls fail-fast until cooldown', undefined, {
          adapterId: this.id,
          cooldownMs: 30_000,
        });
      } else if (state === 'half-open') {
        this.log.warn('Circuit breaker half-open — probing single call', { adapterId: this.id });
      } else {
        this.log.info('Circuit breaker closed — service recovered', { adapterId: this.id });
      }
    });

    // navigator.onLine listeners — auto-reconnect on network recovery
    if (typeof window !== 'undefined') {
      this._onlineHandler = () => {
        // Ignore synthetic `online` events for adapters that never attempted a connection
        // (e.g. disabled built-ins during E2E offline-banner tests).
        if (this.destroyed || this._lastConnectAttemptAt === 0) return;
        if (this._status === 'disconnected' || this._status === 'error') {
          this.resetRetryDelay();
          this._reconnectAttempts = 0;
          void this.connect();
        }
      };
      this._offlineHandler = () => {
        this.clearReconnect();
      };
      window.addEventListener('online', this._onlineHandler);
      window.addEventListener('offline', this._offlineHandler);
    }
  }

  // ─── Public getters ─────────────────────────────────────────────

  get status(): AdapterStatus {
    return this._status;
  }

  /** Get per-adapter performance snapshot */
  get perfMetrics(): AdapterPerfMetrics {
    const now = Date.now();
    const total = this._totalErrors + this._totalUpdates;
    return {
      lastDataAt: this._lastDataAt,
      lastConnectAttemptAt: this._lastConnectAttemptAt,
      avgLatencyMs:
        this._latencyBuffer.length > 0
          ? this._latencyBuffer.reduce((a, b) => a + b, 0) / this._latencyBuffer.length
          : 0,
      totalErrors: this._totalErrors,
      totalUpdates: this._totalUpdates,
      dataFreshnessMs: this._lastDataAt > 0 ? now - this._lastDataAt : Infinity,
      errorRate: total > 0 ? this._totalErrors / total : 0,
      reconnectAttempts: this._reconnectAttempts,
      isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
    };
  }

  // ─── Lifecycle (Template Method) ────────────────────────────────

  /**
   * Non-throwing by contract (ADR-024): on failure this records the failure and
   * sets status 'error' — it does NOT reject. Callers detect failure via
   * `status === 'error'` and the `onStatus(status, error?)` callback.
   */
  async connect(): Promise<void> {
    if (this._status === 'connected' || this._status === 'connecting') return;
    if (!this.circuitBreaker.canExecute()) {
      this.log.warn('Connection attempt blocked by circuit breaker', {
        adapterId: this.id,
        circuitState: this.circuitBreaker.currentState,
        host: this.config.host,
        port: this.config.port,
      });
      return;
    }
    // Don't attempt connection when offline
    if (typeof navigator !== 'undefined' && !navigator.onLine) return;
    this.destroyed = false;
    this._lastConnectAttemptAt = Date.now();
    try {
      await this._connect();
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Connection failed';
      this.setStatus('error', msg);
      this._totalErrors++;
      this.circuitBreaker.recordFailure();
    }
  }

  async disconnect(): Promise<void> {
    this.clearReconnect();
    await this._disconnect();
    this.setStatus('disconnected');
  }

  destroy(): void {
    this.destroyed = true;
    this.clearReconnect();
    this._cleanup();
    this.dataCallbacks = [];
    this.statusCallbacks = [];
    this.circuitBreaker.destroy();
    // Remove navigator.onLine listeners
    if (typeof window !== 'undefined') {
      if (this._onlineHandler) window.removeEventListener('online', this._onlineHandler);
      if (this._offlineHandler) window.removeEventListener('offline', this._offlineHandler);
    }
  }

  // ─── Subscriptions ──────────────────────────────────────────────

  onData(callback: AdapterDataCallback): void {
    this.dataCallbacks.push(callback);
  }

  onStatus(callback: AdapterStatusCallback): void {
    this.statusCallbacks.push(callback);
  }

  // ─── Command dispatch (Template Method) ─────────────────────────

  /**
   * Send a command through the full safety pipeline:
   *   Zod validation → Circuit breaker check → Double-confirm → Online check → Execute + Audit
   */
  async sendCommand(command: AdapterCommand): Promise<boolean> {
    // 1. Validate via Zod schema
    const validation = validateCommand(command);
    if (!validation.valid) {
      void logCommandAudit({
        timestamp: Date.now(),
        commandType: command.type,
        value: command.value,
        targetDeviceId: command.targetDeviceId,
        status: 'rejected',
        error: validation.error,
        adapterId: this.id,
      });
      return false;
    }

    // 2. Check circuit breaker
    if (!this.circuitBreaker.canExecute()) {
      void logCommandAudit({
        timestamp: Date.now(),
        commandType: command.type,
        value: command.value,
        targetDeviceId: command.targetDeviceId,
        status: 'rejected',
        error: 'Circuit breaker is open',
        adapterId: this.id,
      });
      return false;
    }

    // 3. Double-confirm for danger commands (delegate from React layer)
    if (requiresConfirmation(command) && this.confirmCommand) {
      const confirmed = await this.confirmCommand(command);
      if (!confirmed) {
        void logCommandAudit({
          timestamp: Date.now(),
          commandType: command.type,
          value: command.value,
          targetDeviceId: command.targetDeviceId,
          status: 'rejected',
          error: 'User cancelled',
          adapterId: this.id,
        });
        throw new CommandCancelledError(command.type);
      }
    }

    // 4. Check online connectivity
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      void logCommandAudit({
        timestamp: Date.now(),
        commandType: command.type,
        value: command.value,
        targetDeviceId: command.targetDeviceId,
        status: 'failed',
        error: 'Device is offline',
        adapterId: this.id,
      });
      return false;
    }

    // 5. Execute through circuit breaker with audit
    try {
      const result = await this.circuitBreaker.execute(() => this._sendCommand(command));
      void logCommandAudit({
        timestamp: Date.now(),
        commandType: command.type,
        value: command.value,
        targetDeviceId: command.targetDeviceId,
        status: result ? 'executed' : 'failed',
        adapterId: this.id,
        error: result ? undefined : 'Adapter rejected command',
      });
      return result;
    } catch (error) {
      void logCommandAudit({
        timestamp: Date.now(),
        commandType: command.type,
        value: command.value,
        targetDeviceId: command.targetDeviceId,
        status: 'failed',
        error: error instanceof Error ? error.message : 'Unknown error',
        adapterId: this.id,
      });
      return false;
    }
  }

  getSnapshot(): Partial<UnifiedEnergyModel> {
    return { ...this.snapshot };
  }

  // ─── Protected helpers (shared by all adapters) ─────────────────

  protected setStatus(status: AdapterStatus, error?: string): void {
    this._status = status;
    for (const cb of this.statusCallbacks) cb(status, error);
  }

  protected emitData(model: Partial<UnifiedEnergyModel>): void {
    const now = Date.now();
    // Track latency: time between last data and this data
    if (this._lastDataAt > 0) {
      const latency = now - this._lastDataAt;
      this._latencyBuffer.push(latency);
      if (this._latencyBuffer.length > this._latencyBufferSize) {
        this._latencyBuffer.shift();
      }
    }
    this._lastDataAt = now;
    this._totalUpdates++;
    this.snapshot = model;
    for (const cb of this.dataCallbacks) cb(model);
  }

  protected scheduleReconnect(): void {
    this.clearReconnect();
    if (this.destroyed) return;
    // Don't attempt reconnect when offline — the 'online' handler will do it
    if (typeof navigator !== 'undefined' && !navigator.onLine) return;

    const reconnectCfg = this.config.reconnect ?? BASE_RECONNECT;
    if (!reconnectCfg.enabled) return;

    this._reconnectAttempts++;
    this._totalErrors++;

    // Feed failure into circuit breaker (opens after failureThreshold drops)
    this.circuitBreaker.recordFailure();

    // Exponential backoff with random jitter (±25%) to prevent thundering herd
    const maxDelay = reconnectCfg.maxDelayMs ?? BASE_RECONNECT.maxDelayMs;
    const multiplier = reconnectCfg.backoffMultiplier ?? BASE_RECONNECT.backoffMultiplier;
    const jitter = 0.75 + Math.random() * 0.5; // 0.75–1.25
    const delay = Math.min(this.retryDelay * jitter, maxDelay);
    this.retryDelay = Math.min(this.retryDelay * multiplier, maxDelay);

    this.log.warn('Connection dropped — scheduling reconnect', {
      adapterId: this.id,
      attempt: this._reconnectAttempts,
      delayMs: Math.round(delay),
      host: this.config.host,
      port: this.config.port,
      circuitState: this.circuitBreaker.currentState,
    });

    this.reconnectTimer = setTimeout(() => {
      this.log.info('Attempting reconnect', {
        adapterId: this.id,
        attempt: this._reconnectAttempts,
        host: this.config.host,
        port: this.config.port,
      });
      void this.connect();
    }, delay);
  }

  protected resetRetryDelay(): void {
    const wasReconnecting = this._reconnectAttempts > 0;
    this.retryDelay = this.config.reconnect?.initialDelayMs ?? BASE_RECONNECT.initialDelayMs;
    this._reconnectAttempts = 0;
    // Feed successful connection into the circuit breaker
    this.circuitBreaker.recordSuccess();
    if (wasReconnecting) {
      this.log.info('Connection restored after reconnect', {
        adapterId: this.id,
        host: this.config.host,
        circuitState: this.circuitBreaker.currentState,
      });
    }
  }

  protected clearReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  // ─── Abstract methods (subclasses MUST implement) ───────────────

  /** Establish the actual connection (WebSocket, HTTP polling, etc.) */
  protected abstract _connect(): Promise<void>;

  /** Close the actual connection gracefully */
  protected abstract _disconnect(): Promise<void>;

  /** Send a single command to the hardware. Return true if handled. */
  protected abstract _sendCommand(command: AdapterCommand): Promise<boolean>;

  /** Optional: cleanup adapter-specific resources on destroy */
  protected _cleanup(): void {
    /* Subclasses can override to release WebSockets, timers, etc. */
  }
}
