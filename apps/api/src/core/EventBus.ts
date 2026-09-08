/**
 * EventBus — Central datapoint dispatcher for backend protocol adapters.
 *
 * Design:
 *  - Protocol adapters call emit() for each UnifiedEnergyDatapoint
 *  - An internal buffer accumulates datapoints
 *  - Every 500 ms the buffer is flushed to all registered subscribers
 *  - If the buffer grows beyond MAX_BUFFER_SIZE (1000), an immediate flush
 *    is triggered and a dropped counter is incremented
 *
 * This decouples adapters from InfluxDB write timing, WebSocket pushes,
 * and EnergyRouterService — none of which should block an adapter's hot path.
 */

import EventEmitter from 'node:events';
import type { EventBusSubscriber, UnifiedEnergyDatapoint } from '@nexus-hems/shared-types';

const FLUSH_INTERVAL_MS = 500;
const MAX_BUFFER_SIZE = 1000;

interface EventBusStats {
  buffered: number;
  flushed: number;
  dropped: number;
  subscribers: number;
}

export class EventBus {
  private readonly emitter = new EventEmitter();
  private readonly subscribers = new Map<string, EventBusSubscriber>();
  private buffer: UnifiedEnergyDatapoint[] = [];
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private totalFlushed = 0;
  private totalDropped = 0;

  constructor() {
    this.flushTimer = setInterval(() => {
      this.flush();
    }, FLUSH_INTERVAL_MS);
  }

  /**
   * Enqueue a single datapoint. If the buffer is full, trigger an immediate
   * flush before adding the new point (backpressure relief).
   */
  emit(datapoint: UnifiedEnergyDatapoint): void {
    if (this.buffer.length >= MAX_BUFFER_SIZE) {
      this.totalDropped++;
      this.flush(); // relieve pressure, then continue
    }
    this.buffer.push(datapoint);
  }

  /**
   * Register a subscriber. The subscriber's onBatch() is called on every
   * flush cycle with the accumulated datapoints.
   *
   * @param id Unique subscriber identifier (used for unsubscribe)
   * @param subscriber Object implementing EventBusSubscriber
   */
  subscribe(id: string, subscriber: EventBusSubscriber): void {
    this.subscribers.set(id, subscriber);
  }

  /** Remove a previously registered subscriber. */
  unsubscribe(id: string): void {
    this.subscribers.delete(id);
  }

  /** Return current buffer and counters for health checks / Prometheus. */
  getStats(): EventBusStats {
    return {
      buffered: this.buffer.length,
      flushed: this.totalFlushed,
      dropped: this.totalDropped,
      subscribers: this.subscribers.size,
    };
  }

  /** Graceful shutdown: flush remaining buffer and clear the timer. */
  destroy(): void {
    if (this.flushTimer !== null) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    // Flush any remaining datapoints synchronously
    this.flush();
    this.emitter.removeAllListeners();
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  private flush(): void {
    if (this.buffer.length === 0) return;

    const batch = this.buffer;
    this.buffer = [];
    this.totalFlushed += batch.length;

    for (const [id, subscriber] of this.subscribers) {
      try {
        const result = subscriber.onBatch(batch);
        if (result instanceof Promise) {
          result.catch((err: unknown) => {
            console.error('[EventBus] Subscriber async error:', id, err);
          });
        }
      } catch (err) {
        console.error('[EventBus] Subscriber sync error:', id, err);
      }
    }
  }
}

/** Singleton instance shared across the entire backend process. */
export const eventBus = new EventBus();
