/**
 * Minimal structured logger — emits NDJSON to stdout.
 *
 * Zero extra dependencies. Produces log lines compatible with Loki,
 * Datadog, and any JSON-aware log aggregator.
 *
 * LOG_LEVEL env var controls minimum level (debug/info/warn/error).
 * Default: "info" in production, "debug" in dev.
 */

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 } as const;
type Level = keyof typeof LEVELS;

const envLevel = (process.env.LOG_LEVEL ?? 'info').toLowerCase() as Level;
const minLevel: number = LEVELS[envLevel] ?? LEVELS.info;

function write(level: Level, msg: string, ctx?: Record<string, unknown>): void {
  if (LEVELS[level] < minLevel) return;
  process.stdout.write(`${JSON.stringify({ time: Date.now(), level, msg, ...ctx })}\n`);
}

export type Logger = {
  debug(msg: string, ctx?: Record<string, unknown>): void;
  info(msg: string, ctx?: Record<string, unknown>): void;
  warn(msg: string, ctx?: Record<string, unknown>): void;
  error(msg: string, ctx?: Record<string, unknown>): void;
  child(base: Record<string, unknown>): Logger;
};

function makeLogger(base: Record<string, unknown> = {}): Logger {
  return {
    debug: (msg, ctx) => write('debug', msg, { ...base, ...ctx }),
    info: (msg, ctx) => write('info', msg, { ...base, ...ctx }),
    warn: (msg, ctx) => write('warn', msg, { ...base, ...ctx }),
    error: (msg, ctx) => write('error', msg, { ...base, ...ctx }),
    child: (extra) => makeLogger({ ...base, ...extra }),
  };
}

export const logger: Logger = makeLogger();
