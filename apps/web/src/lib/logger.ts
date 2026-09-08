/**
 * Structured Logger with Sentry Error Tracking
 *
 * Production-grade logging for Nexus HEMS Dashboard:
 * - Structured log entries with level, context, timestamp
 * - Pino-compatible JSON output (activated via ?log=json or LOG_FORMAT=json)
 * - Sentry error/warning capture in production
 * - Ring buffer for recent log history (last 200 entries)
 * - Context tagging (adapter, component, subsystem)
 *
 * JSON output follows Pino wire format:
 *   { level: number, time: ms, pid: 0, hostname, msg, context?, ...data }
 * Level codes: debug=20, info=30, warn=40, error=50, fatal=60
 */

// ─── Types ──────────────────────────────────────────────────────────

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal';

export interface LogEntry {
  level: LogLevel;
  message: string;
  context?: string;
  data?: Record<string, unknown>;
  timestamp: number;
  error?: Error;
}

export interface LoggerConfig {
  /** Minimum level to output (default: 'info' in prod, 'debug' in dev) */
  minLevel: LogLevel;
  /** Enable Sentry integration (from centralized sentry.ts) */
  sentryEnabled: boolean;
  /** Max log ring buffer size */
  bufferSize: number;
}

// ─── Level Ordering ─────────────────────────────────────────────────

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  fatal: 4,
};

// Pino-compatible wire-format level numbers
const PINO_LEVELS: Record<LogLevel, number> = {
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
  fatal: 60,
};

function detectJsonMode(): boolean {
  if (typeof window !== 'undefined') {
    try {
      if (new URLSearchParams(window.location.search).get('log') === 'json') return true;
      return window.localStorage?.getItem('LOG_FORMAT') === 'json';
    } catch {
      return false;
    }
  }
  return typeof process !== 'undefined' && process.env != null && process.env.LOG_FORMAT === 'json';
}

// ─── Sentry Integration ─────────────────────────────────────────────

// Sentry is initialized centrally via src/lib/sentry.ts (called in main.tsx).
// The logger imports the already-initialized SDK and checks sentryEnabled.
import { Sentry, sentryEnabled } from './sentry';

function captureToSentry(entry: LogEntry): void {
  if (!sentryEnabled) return;
  try {
    const captureCtx = {
      tags: { context: entry.context ?? 'unknown' },
      ...(entry.data != null && { extra: entry.data }),
    };
    if (entry.error) {
      Sentry.captureException(entry.error, captureCtx);
    } else if (entry.level === 'error' || entry.level === 'fatal') {
      Sentry.captureMessage(entry.message, {
        level: entry.level === 'fatal' ? 'fatal' : 'error',
        ...captureCtx,
      });
    } else if (entry.level === 'warn') {
      Sentry.captureMessage(entry.message, {
        level: 'warning',
        ...captureCtx,
      });
    }
  } catch {
    // Silently fail — logging must never crash the app
  }
}

// ─── App Version ────────────────────────────────────────────────────

declare const __APP_VERSION__: string;

// ─── Logger ─────────────────────────────────────────────────────────

class Logger {
  private config: LoggerConfig;
  private buffer: LogEntry[] = [];
  private readonly jsonMode: boolean;

  constructor() {
    const isProd = import.meta.env.PROD;
    this.jsonMode = detectJsonMode();

    this.config = {
      minLevel: isProd ? 'info' : 'debug',
      sentryEnabled,
      bufferSize: 200,
    };
  }

  private shouldLog(level: LogLevel): boolean {
    return LEVEL_ORDER[level] >= LEVEL_ORDER[this.config.minLevel];
  }

  private addToBuffer(entry: LogEntry): void {
    this.buffer.push(entry);
    if (this.buffer.length > this.config.bufferSize) {
      this.buffer.shift();
    }
  }

  private log(
    level: LogLevel,
    message: string,
    context?: string,
    data?: Record<string, unknown>,
    error?: Error,
  ): void {
    if (!this.shouldLog(level)) return;

    const entry: LogEntry = {
      level,
      message,
      ...(context != null && { context }),
      ...(data != null && { data }),
      timestamp: Date.now(),
      ...(error != null && { error }),
    };

    this.addToBuffer(entry);

    if (this.jsonMode) {
      // Pino-compatible JSON output (parseable by Vector, Datadog, Loki, etc.)
      const pinoEntry: Record<string, unknown> = {
        level: PINO_LEVELS[level],
        time: entry.timestamp,
        pid: 0,
        hostname: typeof window !== 'undefined' ? window.location.hostname : 'server',
        msg: message,
        ...(context != null && { context }),
        ...(data != null && data),
        ...(error != null && {
          err: { type: error.name, message: error.message, stack: error.stack },
        }),
      };
      console.log(JSON.stringify(pinoEntry));
    } else {
      // Human-readable output for development
      const prefix = context ? `[${context}]` : '';
      const consoleMethod = level === 'fatal' ? 'error' : level;
      const consoleFn =
        (console[consoleMethod as keyof typeof console] as typeof console.log) ?? console.log;

      if (error) {
        consoleFn(`${prefix} ${message}`, data ?? '', error);
      } else if (data) {
        consoleFn(`${prefix} ${message}`, data);
      } else {
        consoleFn(`${prefix} ${message}`);
      }
    }

    // Sentry capture for error/warn/fatal
    if (this.config.sentryEnabled && LEVEL_ORDER[level] >= LEVEL_ORDER.warn) {
      void captureToSentry(entry);
    }
  }

  debug(message: string, context?: string, data?: Record<string, unknown>): void {
    this.log('debug', message, context, data);
  }

  info(message: string, context?: string, data?: Record<string, unknown>): void {
    this.log('info', message, context, data);
  }

  warn(message: string, context?: string, data?: Record<string, unknown>): void {
    this.log('warn', message, context, data);
  }

  error(message: string, error?: Error, context?: string, data?: Record<string, unknown>): void {
    this.log('error', message, context, data, error ?? undefined);
  }

  fatal(message: string, error?: Error, context?: string, data?: Record<string, unknown>): void {
    this.log('fatal', message, context, data, error ?? undefined);
  }

  /** Get recent log entries (ring buffer) */
  getRecentLogs(): ReadonlyArray<LogEntry> {
    return [...this.buffer];
  }

  /** Create a child logger with a fixed context */
  child(context: string): ContextLogger {
    return new ContextLogger(this, context);
  }
}

/** Logger scoped to a specific context (adapter, component, subsystem) */
export class ContextLogger {
  constructor(
    private parent: Logger,
    private context: string,
  ) {}

  debug(message: string, data?: Record<string, unknown>): void {
    this.parent.debug(message, this.context, data);
  }

  info(message: string, data?: Record<string, unknown>): void {
    this.parent.info(message, this.context, data);
  }

  warn(message: string, data?: Record<string, unknown>): void {
    this.parent.warn(message, this.context, data);
  }

  error(message: string, error?: Error, data?: Record<string, unknown>): void {
    this.parent.error(message, error, this.context, data);
  }

  fatal(message: string, error?: Error, data?: Record<string, unknown>): void {
    this.parent.fatal(message, error, this.context, data);
  }
}

// ─── Singleton ──────────────────────────────────────────────────────

export const logger = new Logger();
