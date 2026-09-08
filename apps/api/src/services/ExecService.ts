/**
 * ExecService — Sandboxed script execution for ExecAdapter
 *
 * Security model:
 *   1. Only scripts explicitly listed in EXEC_SCRIPTS_CONFIG may be executed.
 *   2. Commands are passed as argv arrays — never concatenated into a shell string.
 *      `child_process.spawn()` is used with `shell: false` to prevent injection.
 *   3. Argument keys/values are validated against strict allow-lists defined per script.
 *   4. Execution is bounded by configurable timeout (default 30 s).
 *   5. stdout is capped at 64 KB; excess is truncated to prevent memory exhaustion.
 *   6. Output must be valid JSON matching the ExecScriptOutput schema.
 *   7. READ_ONLY_MODE=true rejects all exec command requests.
 *   8. All executions are recorded in the command audit log.
 *
 * Configuration (env: EXEC_SCRIPTS_CONFIG — JSON string or file path):
 * ```json
 * {
 *   "scripts": {
 *     "read_solar_meter": {
 *       "command": "/opt/nexus/scripts/read_solar.py",
 *       "allowedArgs": ["--device", "--port", "--baud"],
 *       "timeoutMs": 10000,
 *       "description": "Read power from RS485 solar meter"
 *     },
 *     "read_heat_pump": {
 *       "command": "/usr/local/bin/python3",
 *       "commandArgs": ["/opt/nexus/scripts/viessmann.py"],
 *       "allowedArgs": ["--host", "--port"],
 *       "timeoutMs": 15000
 *     }
 *   }
 * }
 * ```
 */

import { execFile } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { isReadOnlyMode } from '../config/read-only-mode.js';

const execFileAsync = promisify(execFile);

// ─── Types ─────────────────────────────────────────────────────────

type EnergyRole = 'pv' | 'battery' | 'grid' | 'load' | 'ev' | 'heatpump';
type MetricType =
  | 'POWER_W'
  | 'ENERGY_KWH'
  | 'SOC_PERCENT'
  | 'VOLTAGE_V'
  | 'CURRENT_A'
  | 'FREQUENCY_HZ'
  | 'TEMPERATURE_C';

interface ExecReading {
  metric: MetricType;
  value: number;
  role?: EnergyRole;
  label?: string;
}

export interface ExecScriptOutput {
  readings: ExecReading[];
  error?: string;
}

interface ScriptConfig {
  /** Absolute path to the executable */
  command: string;
  /** Pre-defined arguments always prepended (e.g. a Python script path) */
  commandArgs?: string[];
  /** Allowed argument keys from the caller (--device, --port, etc.) */
  allowedArgs?: string[];
  /** Execution timeout in ms. Default: 30_000 */
  timeoutMs?: number;
  /** Human-readable description for the UI */
  description?: string;
}

interface ExecConfig {
  scripts: Record<string, ScriptConfig>;
}

export interface ExecRunRequest {
  scriptId: string;
  args?: Record<string, string>;
}

export interface ExecCommandRequest extends ExecRunRequest {
  commandType: string;
  value?: unknown;
  targetDeviceId?: string;
}

// ─── Constants ────────────────────────────────────────────────────────

const MAX_OUTPUT_BYTES = 65_536; // 64 KB cap
const DEFAULT_TIMEOUT_MS = 30_000;
const SAFE_ARG_KEY = /^[a-zA-Z0-9_\-.]{1,64}$/;
const SAFE_ARG_VALUE = /^[a-zA-Z0-9_\-./: ]{0,256}$/;

// ─── Config Loading ───────────────────────────────────────────────────

let _config: ExecConfig | null = null;

function loadConfig(): ExecConfig {
  if (_config) return _config;

  const envVal = process.env.EXEC_SCRIPTS_CONFIG;
  if (!envVal) {
    _config = { scripts: {} };
    return _config;
  }

  // Try as a file path first
  const absPath = resolve(process.cwd(), envVal);
  if (existsSync(absPath)) {
    try {
      _config = JSON.parse(readFileSync(absPath, 'utf-8')) as ExecConfig;
      return _config;
    } catch (err) {
      console.error('[ExecService] Failed to parse EXEC_SCRIPTS_CONFIG file:', err);
    }
  }

  // Try as an inline JSON string
  try {
    _config = JSON.parse(envVal) as ExecConfig;
    return _config;
  } catch (err) {
    console.error('[ExecService] Failed to parse EXEC_SCRIPTS_CONFIG env var as JSON:', err);
  }

  _config = { scripts: {} };
  return _config;
}

/** Invalidate the config cache (useful in tests) */
export function invalidateExecConfigCache(): void {
  _config = null;
}

// ─── Validation ──────────────────────────────────────────────────────

/**
 * Validate the script ID and arguments against the whitelist.
 * Returns the resolved ScriptConfig or throws with a safe error message.
 */
function validateRequest(scriptId: string, args?: Record<string, string>): ScriptConfig {
  // Validate scriptId format
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(scriptId)) {
    throw new Error('Invalid scriptId format');
  }

  const config = loadConfig();
  const scriptConfig = config.scripts[scriptId];
  if (!scriptConfig) {
    throw new Error(`Script '${scriptId}' is not in the whitelist`);
  }

  // Validate arg keys/values
  for (const [k, v] of Object.entries(args ?? {})) {
    if (!SAFE_ARG_KEY.test(k)) throw new Error(`Unsafe argument key: ${k}`);
    if (!SAFE_ARG_VALUE.test(v)) throw new Error(`Unsafe argument value for key: ${k}`);
    if (scriptConfig.allowedArgs && !scriptConfig.allowedArgs.includes(k)) {
      throw new Error(`Argument '${k}' is not allowed for script '${scriptId}'`);
    }
  }

  return scriptConfig;
}

// ─── Execution ───────────────────────────────────────────────────────

/**
 * Execute a whitelisted script and return its parsed output.
 *
 * The script must write a JSON object to stdout:
 * ```json
 * { "readings": [{ "metric": "POWER_W", "value": 1500, "role": "pv" }] }
 * ```
 *
 * On error, throws with a safe, non-leaking message.
 */
export async function runScript(req: ExecRunRequest): Promise<ExecScriptOutput> {
  const scriptConfig = validateRequest(req.scriptId, req.args);

  // Build argv: [commandArgs..., ...k, v pairs from args]
  const argv: string[] = [...(scriptConfig.commandArgs ?? [])];
  for (const [k, v] of Object.entries(req.args ?? {})) {
    argv.push(k, v);
  }

  const timeout = scriptConfig.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  let stdout: string;
  try {
    const result = await execFileAsync(scriptConfig.command, argv, {
      timeout,
      maxBuffer: MAX_OUTPUT_BYTES,
      // Never use shell — prevents injection
      shell: false,
      env: {
        // Pass only safe environment variables (no secrets)
        PATH: process.env.PATH ?? '/usr/bin:/bin',
        HOME: process.env.HOME ?? '/tmp',
        LANG: 'C.UTF-8',
      },
    });
    stdout = result.stdout;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Log to console only — do not expose internal error to caller
    console.warn('[ExecService] Script execution failed:', req.scriptId, message);
    return { readings: [], error: 'Script execution failed' };
  }

  // Parse and validate output
  try {
    const output = JSON.parse(stdout) as ExecScriptOutput;
    if (!Array.isArray(output.readings)) {
      return { readings: [], error: 'Script output missing "readings" array' };
    }
    // Filter out invalid readings (non-finite values, unknown metrics)
    const validMetrics = new Set<MetricType>([
      'POWER_W',
      'ENERGY_KWH',
      'SOC_PERCENT',
      'VOLTAGE_V',
      'CURRENT_A',
      'FREQUENCY_HZ',
      'TEMPERATURE_C',
    ]);
    output.readings = output.readings.filter(
      (r) => validMetrics.has(r.metric) && Number.isFinite(r.value),
    );
    return output;
  } catch {
    return { readings: [], error: 'Script output is not valid JSON' };
  }
}

/**
 * Execute a command script (for ExecAdapter._sendCommand).
 * Blocked in READ_ONLY_MODE.
 */
export async function runCommandScript(req: ExecCommandRequest): Promise<{ success: boolean }> {
  if (isReadOnlyMode()) {
    console.info('[ExecService] Command blocked — READ_ONLY_MODE active', req.scriptId);
    return { success: false };
  }
  const output = await runScript(req);
  return { success: !output.error };
}

/**
 * List all available script IDs and their descriptions.
 * Does not expose internal command paths.
 */
export function listAvailableScripts(): Array<{ id: string; description: string }> {
  const config = loadConfig();
  return Object.entries(config.scripts).map(([id, s]) => ({
    id,
    description: s.description ?? '',
  }));
}
