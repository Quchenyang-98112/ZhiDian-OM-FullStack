/**
 * useAdapterWorker — React hook for offloading adapter polling to a Web Worker
 *
 * Manages the adapter-worker lifecycle and bridges poll results back to the
 * main thread via the useEnergyStore.mergeData() pipeline.
 *
 * Usage:
 *   const { startPolling, stopPolling, stopAll } = useAdapterWorker();
 *   startPolling('modbus-sunspec', {
 *     protocol: 'http',
 *     host: '192.168.1.50',
 *     path: '/api/modbus/sunspec',
 *     query: { model: 'inverter' },
 *   });
 */

import { useEffect, useRef } from 'react';
import { metricsCollector } from '../lib/metrics';
import { useAppStore } from '../store';
import type { PollTarget } from './adapter-worker';
import { BaseAdapter } from './adapters/BaseAdapter';
import { type AdapterId, useEnergyStoreBase } from './useEnergyStore';

interface WorkerDataMessage {
  type: 'data';
  adapterId: string;
  result: unknown;
}

interface WorkerErrorMessage {
  type: 'error';
  adapterId: string;
  error: string;
}

interface WorkerLatencyMessage {
  type: 'latency';
  adapterId: string;
  ms: number;
}

type WorkerOutMessage = WorkerDataMessage | WorkerErrorMessage | WorkerLatencyMessage;

function circuitBreakerFor(adapterId: AdapterId) {
  const adapter = useEnergyStoreBase.getState().adapters[adapterId]?.adapter;
  return adapter instanceof BaseAdapter ? adapter.circuitBreaker : undefined;
}

/**
 * Normalize a poll target into a structured {@link PollTarget}, or `null` if it is
 * not a safe http(s) target. Only `http:`/`https:` URLs are accepted — any other
 * scheme (`file:`, `ftp:`, `javascript:`, …) or unparseable input returns `null`,
 * a first line of SSRF/defence-in-depth before the worker's hostname allowlist.
 * Exported (pure) so this security-relevant parsing can be unit-tested directly.
 */
export function normalizePollTarget(target: string | PollTarget): PollTarget | null {
  if (typeof target !== 'string') return target;

  try {
    const parsed = new URL(target);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;

    const query = Object.fromEntries(parsed.searchParams.entries());
    return {
      protocol: parsed.protocol === 'https:' ? 'https' : 'http',
      host: parsed.hostname,
      port: parsed.port ? Number(parsed.port) : undefined,
      path: parsed.pathname,
      query: Object.keys(query).length > 0 ? query : undefined,
    };
  } catch {
    return null;
  }
}

export function useAdapterWorker() {
  const workerRef = useRef<Worker | null>(null);

  useEffect(() => {
    const worker = new Worker(new URL('./adapter-worker.ts', import.meta.url), { type: 'module' });
    workerRef.current = worker;

    worker.onmessage = (event: MessageEvent<WorkerOutMessage>) => {
      const msg = event.data;

      switch (msg.type) {
        case 'data': {
          useEnergyStoreBase
            .getState()
            .mergeData(msg.adapterId, msg.result as Record<string, unknown>);
          circuitBreakerFor(msg.adapterId as AdapterId)?.recordSuccess();
          useEnergyStoreBase.getState().setAdapterStatus(msg.adapterId as AdapterId, 'connected');
          const anyConn = Object.values(useEnergyStoreBase.getState().adapters).some(
            (a) => a.enabled && a.status === 'connected',
          );
          useAppStore.getState().setConnected(anyConn);
          break;
        }
        case 'error': {
          metricsCollector.recordAdapterError(msg.adapterId, msg.error);
          circuitBreakerFor(msg.adapterId as AdapterId)?.recordFailure();
          useEnergyStoreBase
            .getState()
            .setAdapterStatus(msg.adapterId as AdapterId, 'error', msg.error);
          break;
        }
        case 'latency':
          metricsCollector.recordAdapterStatus(msg.adapterId, msg.adapterId, true, msg.ms);
          break;
      }
    };

    return () => {
      worker.postMessage({ type: 'stopAll' });
      worker.terminate();
      workerRef.current = null;
    };
  }, []);

  const startSunSpecPolling = (
    adapterId: string,
    config: {
      protocol: 'http' | 'https';
      host: string;
      port?: number;
      path?: string;
      headers?: Record<string, string>;
      pollIntervalMs?: number;
    },
  ): void => {
    const target: PollTarget = {
      protocol: config.protocol,
      host: config.host,
      port: config.port,
      path: config.path ?? '/api/modbus/sunspec',
    };
    const normalizedTarget = normalizePollTarget(target);
    if (!normalizedTarget) {
      workerRef.current?.postMessage({ type: 'stop', adapterId });
      if (import.meta.env.DEV) {
        console.warn('[useAdapterWorker] Ignored invalid SunSpec poll target for', adapterId);
      }
      return;
    }

    workerRef.current?.postMessage({
      type: 'sunspecPoll',
      adapterId,
      target: normalizedTarget,
      headers: config.headers,
      intervalMs: config.pollIntervalMs,
    });
  };

  const startPolling = (
    adapterId: string,
    target: string | PollTarget,
    headers?: Record<string, string>,
    intervalMs?: number,
  ): void => {
    const normalizedTarget = normalizePollTarget(target);
    if (!normalizedTarget) {
      workerRef.current?.postMessage({ type: 'stop', adapterId });
      if (import.meta.env.DEV) {
        console.warn('[useAdapterWorker] Ignored invalid poll target for', adapterId);
      }
      return;
    }

    workerRef.current?.postMessage({
      type: 'poll',
      adapterId,
      target: normalizedTarget,
      headers,
      intervalMs,
    });
  };

  const stopPolling = (adapterId: string): void => {
    workerRef.current?.postMessage({ type: 'stop', adapterId });
  };

  const transform = (
    adapterId: string,
    rawData: string,
    format: 'sunspec-inverter' | 'sunspec-battery' | 'sunspec-meter' | 'venus-mqtt' | 'json',
  ): void => {
    workerRef.current?.postMessage({ type: 'transform', adapterId, rawData, format });
  };

  const stopAll = (): void => {
    workerRef.current?.postMessage({ type: 'stopAll' });
  };

  return { startPolling, startSunSpecPolling, stopPolling, transform, stopAll };
}
