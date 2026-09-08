import { SET_EV_POWER_ERROR } from '@nexus-hems/shared-types';
import { afterEach, describe, expect, it } from 'vitest';
import {
  clearProtocolCommandHandlers,
  dispatchProtocolCommand,
  getProtocolCommandHandlerCount,
  registerCommandCapableAdapter,
  registerProtocolCommandHandler,
  unregisterCommandCapableAdapter,
  unregisterProtocolCommandHandler,
} from './ProtocolCommandRouter.js';
import type { IProtocolCommandHandler, ProtocolCommandRequest } from './protocol-command.js';
import { isProtocolCommandHandler } from './protocol-command.js';

function stubHandler(
  id: string,
  supported: string[],
  result: { success: boolean; error?: string },
): IProtocolCommandHandler {
  return {
    supportsCommand: (type) => supported.includes(type),
    sendCommand: async (_command: ProtocolCommandRequest) => ({
      handled: true,
      success: result.success,
      adapterId: id,
      ...(result.error ? { error: result.error } : {}),
    }),
  };
}

describe('ProtocolCommandRouter', () => {
  afterEach(() => {
    clearProtocolCommandHandlers();
  });

  it('returns handled:false when no handlers are registered', async () => {
    const result = await dispatchProtocolCommand({ type: 'SET_EV_POWER', value: 1000 });
    expect(result).toEqual({ handled: false, success: false });
  });

  it('dispatches to the first handler that supports the command type', async () => {
    registerProtocolCommandHandler(
      stubHandler('openems', ['SET_BATTERY_POWER'], { success: true }),
    );
    registerProtocolCommandHandler(stubHandler('ocpp', ['SET_EV_POWER'], { success: true }));

    const result = await dispatchProtocolCommand({ type: 'SET_EV_POWER', value: 7200 });
    expect(result).toEqual({ handled: true, success: true, adapterId: 'ocpp' });
    expect(getProtocolCommandHandlerCount()).toBe(2);
  });

  it('skips handlers that do not support the command type', async () => {
    registerProtocolCommandHandler(stubHandler('ha', ['START_CHARGING'], { success: true }));

    const result = await dispatchProtocolCommand({ type: 'SET_EV_CURRENT', value: 16 });
    expect(result).toEqual({ handled: false, success: false });
  });

  it('propagates handler failure as handled with success:false', async () => {
    registerProtocolCommandHandler(
      stubHandler('ocpp', ['STOP_CHARGING'], { success: false, error: 'No active transaction' }),
    );

    const result = await dispatchProtocolCommand({ type: 'STOP_CHARGING', value: true });
    expect(result.handled).toBe(true);
    expect(result.success).toBe(false);
    expect(result.error).toBe('No active transaction');
  });

  it('ignores duplicate handler registration', () => {
    const handler = stubHandler('dup', ['SET_EV_POWER'], { success: true });
    registerProtocolCommandHandler(handler);
    registerProtocolCommandHandler(handler);
    expect(getProtocolCommandHandlerCount()).toBe(1);
  });

  it('unregisters handlers explicitly', async () => {
    const handler = stubHandler('ocpp', ['SET_EV_POWER'], { success: true });
    registerProtocolCommandHandler(handler);
    unregisterProtocolCommandHandler(handler);
    const result = await dispatchProtocolCommand({ type: 'SET_EV_POWER', value: 1 });
    expect(result).toEqual({ handled: false, success: false });
  });

  it('registers only command-capable adapters', async () => {
    const capable = stubHandler('ocpp', ['SET_EV_POWER'], { success: true });
    registerCommandCapableAdapter(capable);
    registerCommandCapableAdapter({ id: 'telemetry-only' });
    expect(getProtocolCommandHandlerCount()).toBe(1);
    expect(isProtocolCommandHandler(capable)).toBe(true);

    const result = await dispatchProtocolCommand({ type: 'SET_EV_POWER', value: 5000 });
    expect(result.success).toBe(true);

    unregisterCommandCapableAdapter(capable);
    expect(getProtocolCommandHandlerCount()).toBe(0);
  });

  it('continues when a handler returns handled:false', async () => {
    const passthrough: IProtocolCommandHandler = {
      supportsCommand: () => true,
      sendCommand: async () => ({ handled: false, success: false }),
    };
    registerProtocolCommandHandler(passthrough);
    registerProtocolCommandHandler(stubHandler('ocpp', ['SET_EV_POWER'], { success: true }));

    const result = await dispatchProtocolCommand({ type: 'SET_EV_POWER', value: 3000 });
    expect(result).toEqual({ handled: true, success: true, adapterId: 'ocpp' });
  });

  it('returns handled failure when the only handler throws', async () => {
    registerProtocolCommandHandler({
      supportsCommand: () => true,
      sendCommand: async () => {
        throw new Error('transport down');
      },
    });

    const result = await dispatchProtocolCommand({ type: 'SET_EV_POWER', value: 1 });
    expect(result).toEqual({ handled: true, success: false, error: 'transport down' });
  });

  it('falls through to the next handler when sendCommand throws', async () => {
    registerProtocolCommandHandler({
      supportsCommand: () => true,
      sendCommand: async () => {
        throw new Error('boom');
      },
    });
    registerProtocolCommandHandler(stubHandler('fallback', ['SET_EV_POWER'], { success: true }));

    const result = await dispatchProtocolCommand({ type: 'SET_EV_POWER', value: 5000 });
    expect(result).toEqual({ handled: true, success: true, adapterId: 'fallback' });
  });

  it('returns the last handler error when all supporting handlers throw', async () => {
    registerProtocolCommandHandler({
      supportsCommand: () => true,
      sendCommand: async () => {
        throw new Error('first');
      },
    });
    registerProtocolCommandHandler({
      supportsCommand: () => true,
      sendCommand: async () => {
        throw new Error('last');
      },
    });

    const result = await dispatchProtocolCommand({ type: 'SET_EV_POWER', value: 1 });
    expect(result).toEqual({ handled: true, success: false, error: 'last' });
  });

  it('rejects invalid command payloads before dispatching', async () => {
    registerProtocolCommandHandler(stubHandler('ocpp', ['SET_EV_POWER'], { success: true }));

    const result = await dispatchProtocolCommand({
      type: 'SET_EV_POWER',
      value: true as unknown as number,
    });
    expect(result).toEqual({
      handled: false,
      success: false,
      error: SET_EV_POWER_ERROR,
    });
    expect(getProtocolCommandHandlerCount()).toBe(1);
  });
});
