/**
 * Read-Only Mode — Global safety flag for certification-grade deployments.
 *
 * When READ_ONLY_MODE=true is set, ALL hardware control commands are blocked
 * at the API level, regardless of scope or adapter configuration.
 *
 * This is essential for:
 *   - Certification-grade deployments (VDE/IEC/CE)
 *   - Incident investigation (forensic analysis)
 *   - Maintenance windows
 *   - Operator safety during commissioning
 *
 * See docs/Safety-Certification-Notice.md for deployment checklist.
 */

const READ_ONLY_ACK = 'true';

/**
 * Check if read-only mode is enabled.
 * Returns true when READ_ONLY_MODE=true is set in environment.
 */
export function isReadOnlyMode(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.READ_ONLY_MODE?.trim().toLowerCase() === READ_ONLY_ACK;
}

/**
 * Log startup guidance when read-only mode is active.
 */
export function logReadOnlyModeStartup(env: NodeJS.ProcessEnv = process.env): void {
  if (isReadOnlyMode(env)) {
    console.log(
      '[Safety] READ_ONLY_MODE=true — all hardware control commands are BLOCKED. ' +
        'Set to "false" or remove to enable control.',
    );
  }
}
