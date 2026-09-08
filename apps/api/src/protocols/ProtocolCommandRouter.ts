/**
 * Routes validated WS commands to live backend protocol adapters.
 */

import type {
  IProtocolCommandHandler,
  ProtocolCommandRequest,
  ProtocolCommandResult,
} from './protocol-command.js';
import { isProtocolCommandHandler, validateProtocolCommandRequest } from './protocol-command.js';

const handlers: IProtocolCommandHandler[] = [];

export function registerProtocolCommandHandler(handler: IProtocolCommandHandler): void {
  if (handlers.includes(handler)) return;
  handlers.push(handler);
}

export function registerCommandCapableAdapter(adapter: unknown): void {
  if (isProtocolCommandHandler(adapter)) {
    registerProtocolCommandHandler(adapter);
  }
}

export function unregisterCommandCapableAdapter(adapter: unknown): void {
  if (isProtocolCommandHandler(adapter)) {
    unregisterProtocolCommandHandler(adapter);
  }
}

export function unregisterProtocolCommandHandler(handler: IProtocolCommandHandler): void {
  const index = handlers.indexOf(handler);
  if (index >= 0) handlers.splice(index, 1);
}

/** @internal Test helper — clears all registered handlers. */
export function clearProtocolCommandHandlers(): void {
  handlers.length = 0;
}

export function getProtocolCommandHandlerCount(): number {
  return handlers.length;
}

/**
 * Dispatch a command to the first handler that supports the type.
 * Returns `{ handled: false }` when no handler is registered or none supports the type.
 */
export async function dispatchProtocolCommand(
  command: ProtocolCommandRequest,
): Promise<ProtocolCommandResult> {
  const validation = validateProtocolCommandRequest(command);
  if (!validation.valid) {
    return { handled: false, success: false, error: validation.error };
  }

  const validated = validation.command;

  let lastError: string | undefined;

  const dispatchPayload: ProtocolCommandRequest = validated.chargePointId
    ? {
        type: validated.type,
        value: validated.value,
        chargePointId: validated.chargePointId,
      }
    : { type: validated.type, value: validated.value };

  for (const handler of handlers) {
    if (!handler.supportsCommand(validated.type)) continue;

    try {
      const result = await handler.sendCommand(dispatchPayload);
      if (result.handled) return result;
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
  }

  return lastError
    ? { handled: true, success: false, error: lastError }
    : { handled: false, success: false };
}
