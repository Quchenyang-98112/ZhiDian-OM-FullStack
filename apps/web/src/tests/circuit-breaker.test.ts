/**
 * CircuitBreaker — full state-machine coverage
 *
 * States: CLOSED → OPEN → HALF_OPEN → CLOSED
 * All transitions, canExecute(), execute(), forceOpen(), reset(),
 * onStateChange callbacks, and the cooldown auto-transition tested.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CircuitState } from '../core/circuit-breaker';
import { CircuitBreaker } from '../core/circuit-breaker';

describe('CircuitBreaker', () => {
  beforeEach(() => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  // ── Initial state ────────────────────────────────────────────────

  describe('initial state', () => {
    it('starts in closed state', () => {
      const cb = new CircuitBreaker();
      expect(cb.currentState).toBe('closed');
    });

    it('allows execution when closed', () => {
      const cb = new CircuitBreaker();
      expect(cb.canExecute()).toBe(true);
    });
  });

  // ── CLOSED → OPEN transition ─────────────────────────────────────

  describe('CLOSED → OPEN (failure threshold)', () => {
    it('opens after reaching the failure threshold (default 5)', () => {
      const cb = new CircuitBreaker({ failureThreshold: 5 });
      for (let i = 0; i < 4; i++) {
        cb.recordFailure();
        expect(cb.currentState).toBe('closed');
      }
      cb.recordFailure(); // 5th failure
      expect(cb.currentState).toBe('open');
    });

    it('rejects execution immediately when open', () => {
      const cb = new CircuitBreaker({ failureThreshold: 1 });
      cb.recordFailure();
      expect(cb.canExecute()).toBe(false);
    });

    it('custom threshold opens at the specified count', () => {
      const cb = new CircuitBreaker({ failureThreshold: 3 });
      cb.recordFailure();
      cb.recordFailure();
      expect(cb.currentState).toBe('closed');
      cb.recordFailure(); // 3rd = threshold
      expect(cb.currentState).toBe('open');
    });

    it('resets failure count on success while closed', () => {
      const cb = new CircuitBreaker({ failureThreshold: 3 });
      cb.recordFailure();
      cb.recordFailure(); // 2 failures
      cb.recordSuccess(); // success resets counter
      cb.recordFailure();
      cb.recordFailure(); // 2 more — should NOT open yet
      expect(cb.currentState).toBe('closed');
    });
  });

  // ── OPEN → HALF_OPEN transition (cooldown) ───────────────────────

  describe('OPEN → HALF_OPEN (cooldown)', () => {
    it('auto-transitions to half-open after cooldown', () => {
      vi.useFakeTimers();
      const cb = new CircuitBreaker({ failureThreshold: 1, cooldownMs: 5000 });
      cb.recordFailure();
      expect(cb.currentState).toBe('open');

      vi.advanceTimersByTime(5001);
      expect(cb.currentState).toBe('half-open');
    });

    it('stays open before cooldown expires', () => {
      vi.useFakeTimers();
      const cb = new CircuitBreaker({ failureThreshold: 1, cooldownMs: 10_000 });
      cb.recordFailure();

      vi.advanceTimersByTime(9999);
      expect(cb.currentState).toBe('open');
    });

    it('applies exponential backoff on repeated open transitions (MED-09)', () => {
      vi.useFakeTimers();
      const cb = new CircuitBreaker({ failureThreshold: 1, cooldownMs: 1000 });
      cb.recordFailure();
      vi.advanceTimersByTime(1001);
      expect(cb.currentState).toBe('half-open');
      cb.recordFailure();

      vi.advanceTimersByTime(1999);
      expect(cb.currentState).toBe('open');
      vi.advanceTimersByTime(2);
      expect(cb.currentState).toBe('half-open');
    });

    it('allows one execution in half-open state', () => {
      vi.useFakeTimers();
      const cb = new CircuitBreaker({ failureThreshold: 1, cooldownMs: 1000 });
      cb.recordFailure();
      vi.advanceTimersByTime(1001);
      expect(cb.canExecute()).toBe(true);
    });
  });

  // ── HALF_OPEN → CLOSED (success probe) ──────────────────────────

  describe('HALF_OPEN → CLOSED (success threshold)', () => {
    function openAndCoolDown(threshold = 2): CircuitBreaker {
      vi.useFakeTimers();
      const cb = new CircuitBreaker({
        failureThreshold: 1,
        cooldownMs: 1000,
        halfOpenSuccessThreshold: threshold,
      });
      cb.recordFailure();
      vi.advanceTimersByTime(1001);
      expect(cb.currentState).toBe('half-open');
      return cb;
    }

    it('closes after reaching halfOpenSuccessThreshold successes', () => {
      const cb = openAndCoolDown(2);
      cb.recordSuccess();
      expect(cb.currentState).toBe('half-open'); // still waiting
      cb.recordSuccess();
      expect(cb.currentState).toBe('closed');
    });

    it('goes back to OPEN on failure in half-open state', () => {
      const cb = openAndCoolDown(2);
      cb.recordFailure();
      expect(cb.currentState).toBe('open');
    });

    it('resets failure count when closing from half-open', () => {
      const cb = openAndCoolDown(1);
      cb.recordSuccess();
      expect(cb.currentState).toBe('closed');
      // Now it should need 1 failure again (threshold reset)
      expect(cb.canExecute()).toBe(true);
    });
  });

  // ── execute() wrapper ────────────────────────────────────────────

  describe('execute()', () => {
    it('executes and returns result when closed', async () => {
      const cb = new CircuitBreaker();
      const result = await cb.execute(async () => 42);
      expect(result).toBe(42);
    });

    it('records success on resolved promise', async () => {
      const cb = new CircuitBreaker({ failureThreshold: 2 });
      await cb.execute(async () => 'ok');
      // One success — still closed
      expect(cb.currentState).toBe('closed');
    });

    it('records failure and throws on rejected promise', async () => {
      const cb = new CircuitBreaker({ failureThreshold: 1 });
      await expect(cb.execute(async () => Promise.reject(new Error('boom')))).rejects.toThrow(
        'boom',
      );
      expect(cb.currentState).toBe('open');
    });

    it('throws immediately when circuit is open (fail-fast)', async () => {
      const cb = new CircuitBreaker({ failureThreshold: 1 });
      cb.recordFailure(); // open it
      await expect(cb.execute(async () => 'should not run')).rejects.toThrow(
        'Circuit breaker is open',
      );
    });

    it('does not call fn when circuit is open', async () => {
      const cb = new CircuitBreaker({ failureThreshold: 1 });
      cb.recordFailure();
      const fn = vi.fn().mockResolvedValue('x');
      await expect(cb.execute(fn)).rejects.toThrow();
      expect(fn).not.toHaveBeenCalled();
    });
  });

  // ── forceOpen() / reset() ────────────────────────────────────────

  describe('forceOpen()', () => {
    it('forces the circuit open from closed', () => {
      const cb = new CircuitBreaker();
      cb.forceOpen();
      expect(cb.currentState).toBe('open');
      expect(cb.canExecute()).toBe(false);
    });
  });

  describe('reset()', () => {
    it('resets the circuit to closed', () => {
      const cb = new CircuitBreaker({ failureThreshold: 1 });
      cb.recordFailure();
      expect(cb.currentState).toBe('open');
      cb.reset();
      expect(cb.currentState).toBe('closed');
      expect(cb.canExecute()).toBe(true);
    });

    it('resets failure and success counters', () => {
      const cb = new CircuitBreaker({ failureThreshold: 2 });
      cb.recordFailure();
      cb.reset();
      // After reset one failure should not open it (counter reset)
      cb.recordFailure();
      expect(cb.currentState).toBe('closed');
    });
  });

  // ── onStateChange callbacks ──────────────────────────────────────

  describe('onStateChange()', () => {
    it('fires callback on CLOSED → OPEN transition', () => {
      const cb = new CircuitBreaker({ failureThreshold: 1 });
      const states: CircuitState[] = [];
      cb.onStateChange((s) => states.push(s));
      cb.recordFailure();
      expect(states).toEqual(['open']);
    });

    it('fires callback on forceOpen()', () => {
      const cb = new CircuitBreaker();
      const states: CircuitState[] = [];
      cb.onStateChange((s) => states.push(s));
      cb.forceOpen();
      expect(states).toContain('open');
    });

    it('fires callback on reset()', () => {
      const cb = new CircuitBreaker({ failureThreshold: 1 });
      const states: CircuitState[] = [];
      cb.onStateChange((s) => states.push(s));
      cb.recordFailure();
      cb.reset();
      expect(states).toEqual(['open', 'closed']);
    });

    it('fires callback on HALF_OPEN → CLOSED transition', () => {
      vi.useFakeTimers();
      const cb = new CircuitBreaker({
        failureThreshold: 1,
        cooldownMs: 1000,
        halfOpenSuccessThreshold: 1,
      });
      const states: CircuitState[] = [];
      cb.onStateChange((s) => states.push(s));

      cb.recordFailure(); // open
      vi.advanceTimersByTime(1001);
      expect(cb.currentState).toBe('half-open'); // trigger + verify auto-transition
      cb.recordSuccess(); // close

      expect(states).toContain('open');
      expect(states).toContain('half-open');
      expect(states).toContain('closed');
    });

    it('supports multiple callbacks', () => {
      const cb = new CircuitBreaker({ failureThreshold: 1 });
      const a: CircuitState[] = [];
      const b: CircuitState[] = [];
      cb.onStateChange((s) => a.push(s));
      cb.onStateChange((s) => b.push(s));
      cb.recordFailure();
      expect(a).toEqual(['open']);
      expect(b).toEqual(['open']);
    });
  });

  // ── destroy() ───────────────────────────────────────────────────

  describe('destroy()', () => {
    it('removes all state change listeners', () => {
      const cb = new CircuitBreaker({ failureThreshold: 1 });
      const states: CircuitState[] = [];
      cb.onStateChange((s) => states.push(s));
      cb.destroy();
      cb.recordFailure();
      expect(states).toHaveLength(0);
    });
  });
});
