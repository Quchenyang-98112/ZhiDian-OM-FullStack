/**
 * useReconnect — Exponential backoff reconnection hook for adapters
 *
 * Provides a reconnection strategy with:
 *   • Exponential backoff (1.5s → 3s → 6s → ... → max 60s)
 *   • Jitter to prevent thundering herd
 *   • Max retry count with fallback to local mock data
 *   • Automatic cleanup on unmount
 */

import { useEffect, useRef } from 'react';
import type { CircuitBreaker } from './circuit-breaker';
import type { AdapterId } from './useEnergyStore';
import { useEnergyStoreBase } from './useEnergyStore';

export interface ReconnectConfig {
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  maxRetries: number;
  jitterFactor: number;
}

const DEFAULT_RECONNECT_CONFIG: ReconnectConfig = {
  initialDelayMs: 1500,
  maxDelayMs: 60_000,
  backoffMultiplier: 2,
  maxRetries: 20,
  jitterFactor: 0.3,
};

/**
 * Calculates the next delay with exponential backoff + jitter.
 */
export function calcBackoffDelay(
  attempt: number,
  config: ReconnectConfig = DEFAULT_RECONNECT_CONFIG,
): number {
  const base = config.initialDelayMs * config.backoffMultiplier ** attempt;
  const capped = Math.min(base, config.maxDelayMs);
  const jitter = capped * config.jitterFactor * (Math.random() * 2 - 1);
  return Math.max(config.initialDelayMs, capped + jitter);
}

/**
 * Hook that monitors adapter status and triggers reconnection with
 * exponential backoff. Also interacts with the CircuitBreaker to
 * prevent reconnection storms.
 */
export function useReconnect(
  adapterId: AdapterId,
  circuitBreaker: CircuitBreaker | null,
  config: Partial<ReconnectConfig> = {},
) {
  const mergedConfigRef = useRef({ ...DEFAULT_RECONNECT_CONFIG, ...config });
  const circuitBreakerRef = useRef(circuitBreaker);
  const attemptRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync latest config/circuitBreaker into refs (outside of render, per react-hooks/refs)
  useEffect(() => {
    mergedConfigRef.current = { ...DEFAULT_RECONNECT_CONFIG, ...config };
    circuitBreakerRef.current = circuitBreaker;
  });

  useEffect(() => {
    let prevStatus = useEnergyStoreBase.getState().adapters[adapterId]?.status;

    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: reconnect logic with multiple state transitions
    const unsubscribe = useEnergyStoreBase.subscribe((state) => {
      const status = state.adapters[adapterId]?.status;
      if (status === prevStatus) return;
      prevStatus = status;

      const cb = circuitBreakerRef.current;
      const cfg = mergedConfigRef.current;

      if (status === 'connected') {
        // Reset on successful connection
        attemptRef.current = 0;
        cb?.recordSuccess();
      } else if (status === 'disconnected' || status === 'error') {
        cb?.recordFailure();

        // Don't reconnect if circuit breaker is open
        if (cb && !cb.canExecute()) {
          if (import.meta.env.DEV) {
            console.warn(
              `[useReconnect] Circuit breaker open for ${adapterId}, skipping reconnect`,
            );
          }
          return;
        }

        // Don't exceed max retries
        if (attemptRef.current >= cfg.maxRetries) {
          if (import.meta.env.DEV) {
            console.warn(`[useReconnect] Max retries (${cfg.maxRetries}) reached for ${adapterId}`);
          }
          return;
        }

        const delay = calcBackoffDelay(attemptRef.current, cfg);
        attemptRef.current++;

        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => {
          const entry = useEnergyStoreBase.getState().adapters[adapterId];
          if (entry?.enabled && entry.status !== 'connected' && entry.status !== 'connecting') {
            void entry.adapter.connect();
          }
        }, delay);
      }
    });

    return () => {
      unsubscribe();
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [adapterId]);
}
