import type { WebSocket } from 'ws';
import { isReadOnlyMode } from '../config/read-only-mode.js';

const READ_ONLY_CLOSE_MESSAGE = 'System is in read-only mode — control commands are disabled';

/**
 * Close the proxy WebSocket when `READ_ONLY_MODE` is active.
 *
 * @returns `true` when the connection was rejected (caller should return early).
 */
export function rejectProxyIfReadOnly(clientWs: WebSocket): boolean {
  if (!isReadOnlyMode()) return false;
  clientWs.close(4403, READ_ONLY_CLOSE_MESSAGE);
  return true;
}
