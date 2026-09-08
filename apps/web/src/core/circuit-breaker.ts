/**
 * Circuit Breaker Pattern for Adapter Connections
 *
 * States:
 *   CLOSED  → Normal operation. Errors increment the counter.
 *   OPEN    → Too many errors. All calls fail-fast. After cooldown → HALF_OPEN.
 *   HALF_OPEN → One probe call allowed. Success → CLOSED, failure → OPEN.
 *
 * Integrated into useEnergyStore for per-adapter circuit breaking.
 */

export type CircuitState = 'closed' | 'open' | 'half-open';

export interface CircuitBreakerConfig {
  /** Number of failures before opening the circuit */
  failureThreshold: number;
  /** Cooldown period in ms before transitioning to half-open */
  cooldownMs: number;
  /** Success count required in half-open to close the circuit */
  halfOpenSuccessThreshold: number;
}

const DEFAULT_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  cooldownMs: 30_000,
  halfOpenSuccessThreshold: 2,
};

export class CircuitBreaker {
  private state: CircuitState = 'closed';
  private failureCount = 0;
  private successCount = 0;
  private lastFailureTime = 0;
  /** MED-09: number of times the circuit has transitioned to OPEN */
  private openCount = 0;
  private readonly config: CircuitBreakerConfig;
  private stateChangeCallbacks: Array<(state: CircuitState) => void> = [];

  constructor(config?: Partial<CircuitBreakerConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  get currentState(): CircuitState {
    // Auto-transition from open → half-open after effective cooldown
    // MED-09: Exponential backoff with ±20% jitter prevents thundering herd
    if (this.state === 'open') {
      const exponent = Math.max(0, this.openCount - 1);
      const baseCooldown = this.config.cooldownMs * 2 ** exponent;
      const cappedCooldown = Math.min(baseCooldown, 300_000);
      const jitter = 0.8 + Math.random() * 0.4; // [0.8, 1.2)
      const effectiveCooldown = cappedCooldown * jitter;
      if (Date.now() - this.lastFailureTime >= effectiveCooldown) {
        this.state = 'half-open';
        this.successCount = 0;
        this.notifyStateChange();
      }
    }
    return this.state;
  }

  /** Check if a call is allowed */
  canExecute(): boolean {
    const current = this.currentState;
    return current === 'closed' || current === 'half-open';
  }

  /** Record a successful call */
  recordSuccess(): void {
    if (this.state === 'half-open') {
      this.successCount++;
      if (this.successCount >= this.config.halfOpenSuccessThreshold) {
        this.state = 'closed';
        this.failureCount = 0;
        this.successCount = 0;
        this.notifyStateChange();
      }
    } else if (this.state === 'closed') {
      // Reset failure count on success
      this.failureCount = 0;
    }
  }

  /** Record a failed call */
  recordFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.state === 'half-open') {
      // Any failure in half-open goes back to open
      this.state = 'open';
      this.openCount++;
      this.notifyStateChange();
    } else if (this.state === 'closed' && this.failureCount >= this.config.failureThreshold) {
      this.state = 'open';
      this.openCount++;
      this.notifyStateChange();
    }
  }

  /**
   * Execute a function through the circuit breaker.
   * Automatically records success/failure and throws if the circuit is open.
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (!this.canExecute()) {
      throw new Error('Circuit breaker is open');
    }
    try {
      const result = await fn();
      this.recordSuccess();
      return result;
    } catch (error) {
      this.recordFailure();
      throw error;
    }
  }

  /** Force the circuit to open (e.g. emergency stop) */
  forceOpen(): void {
    this.state = 'open';
    this.lastFailureTime = Date.now();
    this.notifyStateChange();
  }

  /** Reset to closed state */
  reset(): void {
    this.state = 'closed';
    this.failureCount = 0;
    this.successCount = 0;
    this.openCount = 0;
    this.notifyStateChange();
  }

  onStateChange(callback: (state: CircuitState) => void): void {
    this.stateChangeCallbacks.push(callback);
  }

  destroy(): void {
    this.stateChangeCallbacks = [];
  }

  private notifyStateChange(): void {
    for (const cb of this.stateChangeCallbacks) {
      cb(this.state);
    }
  }
}
