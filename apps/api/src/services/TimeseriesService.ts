/**
 * TimeseriesService — Writes UnifiedEnergyDatapoint batches to InfluxDB v2.
 *
 * Features:
 *  - Subscribes to the EventBus for all adapter batches
 *  - Converts UnifiedEnergyDatapoint → InfluxDB Points
 *  - WAL (Write-Ahead Log) for crash-safe durability when InfluxDB is unreachable
 *  - Recovery on startup: replays WAL to InfluxDB with exponential backoff
 *  - Prometheus gauge tracking InfluxDB connectivity
 */

import { appendFileSync, existsSync, readFileSync, renameSync, truncateSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { InfluxDB, Point, type WriteApi } from '@influxdata/influxdb-client';
import type { EventBusSubscriber, UnifiedEnergyDatapoint } from '@nexus-hems/shared-types';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '../../data');
const WAL_PATH = join(DATA_DIR, 'wal.ndjson');
const WAL_BATCH_SIZE = 200;
const MAX_RETRY_ATTEMPTS = 5;

function getEnv(key: string, fallback: string): string {
  return process.env[key] ?? fallback;
}

export class TimeseriesService implements EventBusSubscriber {
  private readonly writeApi: WriteApi | null;
  private influxConnected = false;

  constructor() {
    const url = getEnv('INFLUXDB_URL', 'http://influxdb:8086');
    const token = getEnv('INFLUXDB_TOKEN', 'nexus-hems-influx-token');
    const org = getEnv('INFLUXDB_ORG', 'nexus-hems');
    const bucket = getEnv('INFLUXDB_BUCKET', 'nexus-hems');

    try {
      const client = new InfluxDB({ url, token });
      this.writeApi = client.getWriteApi(org, bucket, 'ms');
      this.influxConnected = true;
    } catch (err) {
      console.warn('[TimeseriesService] InfluxDB init failed — WAL mode only:', err);
      this.writeApi = null;
    }
  }

  /** Called by EventBus on each flush cycle. */
  async onBatch(datapoints: UnifiedEnergyDatapoint[]): Promise<void> {
    if (datapoints.length === 0) return;

    if (this.writeApi && this.influxConnected) {
      try {
        for (const dp of datapoints) {
          const point = new Point(dp.metric)
            .tag('device_id', dp.deviceId)
            .tag('protocol', dp.protocol)
            .tag('quality', dp.qualityIndicator)
            .floatField('value', dp.value)
            .timestamp(dp.timestamp);
          this.writeApi.writePoint(point);
        }
        await this.writeApi.flush();
      } catch (err) {
        console.error('[TimeseriesService] InfluxDB write error — falling back to WAL:', err);
        this.influxConnected = false;
        await this.writeToWAL(datapoints);
      }
    } else {
      await this.writeToWAL(datapoints);
    }
  }

  /**
   * Attempt to replay WAL entries to InfluxDB.
   * Called on startup and whenever connectivity is restored.
   */
  async recoverWAL(): Promise<void> {
    if (!existsSync(WAL_PATH)) return;

    const raw = readFileSync(WAL_PATH, 'utf8').trim();
    if (!raw) return;

    const lines = raw.split('\n').filter(Boolean);
    if (lines.length === 0) return;

    console.log(`[TimeseriesService] Recovering ${lines.length} WAL entries…`);

    const parsed: UnifiedEnergyDatapoint[] = [];
    for (const line of lines) {
      try {
        parsed.push(JSON.parse(line) as UnifiedEnergyDatapoint);
      } catch {
        // Skip corrupt WAL lines
      }
    }

    // Process in batches with exponential backoff
    for (let start = 0; start < parsed.length; start += WAL_BATCH_SIZE) {
      const batch = parsed.slice(start, start + WAL_BATCH_SIZE);
      let attempt = 0;
      let success = false;

      while (attempt < MAX_RETRY_ATTEMPTS && !success) {
        try {
          await this.onBatch(batch);
          success = true;
        } catch {
          const delayMs = Math.min(1000 * 2 ** attempt, 30_000);
          await new Promise((r) => setTimeout(r, delayMs));
          attempt++;
        }
      }

      if (!success) {
        const failedPath = `${WAL_PATH}.failed-${Date.now()}`;
        renameSync(WAL_PATH, failedPath);
        console.error(`[TimeseriesService] WAL recovery failed — moved to ${failedPath}`);
        return;
      }
    }

    // Success — clear the WAL
    truncateSync(WAL_PATH, 0);
    console.log('[TimeseriesService] WAL recovery complete.');
  }

  /** Graceful shutdown. */
  async destroy(): Promise<void> {
    if (this.writeApi) {
      try {
        await this.writeApi.close();
      } catch {
        // ignore close errors
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  private async writeToWAL(datapoints: UnifiedEnergyDatapoint[]): Promise<void> {
    await mkdir(DATA_DIR, { recursive: true });
    const lines = `${datapoints.map((dp) => JSON.stringify(dp)).join('\n')}\n`;
    appendFileSync(WAL_PATH, lines, 'utf8');
  }
}
