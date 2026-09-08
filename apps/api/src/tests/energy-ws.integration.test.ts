/**
 * setupWebSocket integration tests — real WebSocketServer + client.
 */

import { createServer, type Server } from 'node:http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import WebSocket, { WebSocketServer } from 'ws';
import { setupWebSocket } from '../ws/energy.ws.js';

const TEST_JWT_SECRET = 'energy-ws-integration-test-secret-min-32c';

function waitForMessage(ws: WebSocket, timeoutMs = 5_000): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('Timed out waiting for WS message')),
      timeoutMs,
    );
    ws.once('message', (data) => {
      clearTimeout(timer);
      try {
        resolve(JSON.parse(data.toString()));
      } catch (err) {
        reject(err);
      }
    });
  });
}

function collectMessages(ws: WebSocket, count: number, timeoutMs = 8_000): Promise<unknown[]> {
  const messages: unknown[] = [];
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Expected ${count} messages, got ${messages.length}`)),
      timeoutMs,
    );
    const onMessage = (data: WebSocket.RawData) => {
      messages.push(JSON.parse(data.toString()));
      if (messages.length >= count) {
        clearTimeout(timer);
        ws.off('message', onMessage);
        resolve(messages);
      }
    };
    ws.on('message', onMessage);
  });
}

describe('setupWebSocket integration', () => {
  const prevEnv = { ...process.env };
  let httpServer: Server;
  let wss: WebSocketServer;
  let port: number;
  let signToken: typeof import('../jwt-utils.js').signToken;

  beforeEach(async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    process.env.NODE_ENV = 'test';
    process.env.JWT_SECRET = TEST_JWT_SECRET;
    delete process.env.JWT_SECRET_NEW;
    delete process.env.READ_ONLY_MODE;
    delete process.env.WS_RATE_LIMIT;

    signToken = (await import('../jwt-utils.js')).signToken;

    httpServer = createServer();
    wss = new WebSocketServer({ server: httpServer });
    setupWebSocket(wss);

    await new Promise<void>((resolve) => {
      httpServer.listen(0, '127.0.0.1', () => resolve());
    });
    const addr = httpServer.address();
    if (!addr || typeof addr === 'string') throw new Error('Failed to bind test server');
    port = addr.port;
  });

  afterEach(async () => {
    vi.clearAllTimers();
    vi.useRealTimers();
    process.env = { ...prevEnv };

    await new Promise<void>((resolve) => {
      for (const client of wss.clients) client.terminate();
      wss.close(() => resolve());
    });
    await new Promise<void>((resolve) => {
      httpServer.close(() => resolve());
    });
  });

  async function connect(scope?: 'read' | 'readwrite' | 'admin'): Promise<WebSocket> {
    let url = `ws://127.0.0.1:${port}/ws`;
    if (scope) {
      const token = await signToken({ sub: 'tester', scope }, '1h');
      url += `?token=${encodeURIComponent(token)}`;
    }
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url);
      ws.once('open', () => resolve(ws));
      ws.once('error', reject);
    });
  }

  it('sends initial ENERGY_UPDATE on connect', async () => {
    const ws = await connect();
    const msg = (await waitForMessage(ws)) as { type: string; data: Record<string, unknown> };
    expect(msg.type).toBe('ENERGY_UPDATE');
    expect(msg.data).toHaveProperty('pvPower');
    ws.close();
  });

  it('filters broadcasts after SUBSCRIBE', async () => {
    const ws = await connect();
    await waitForMessage(ws); // initial ENERGY_UPDATE

    ws.send(JSON.stringify({ type: 'SUBSCRIBE', metrics: ['pvPower'] }));
    const ack = (await waitForMessage(ws)) as { type: string; metrics: string[] };
    expect(ack.type).toBe('SUBSCRIBE_ACK');
    expect(ack.metrics).toEqual(['pvPower']);

    await vi.advanceTimersByTimeAsync(2_100);
    const update = (await waitForMessage(ws)) as { type: string; data: Record<string, unknown> };
    expect(update.type).toBe('ENERGY_UPDATE');
    expect(update.data).toHaveProperty('pvPower');
    expect(update.data).not.toHaveProperty('batteryPower');
    ws.close();
  });

  it('applies hardware commands with readwrite JWT and broadcasts updates', async () => {
    const ws = await connect('readwrite');
    await waitForMessage(ws);

    ws.send(JSON.stringify({ type: 'SET_EV_POWER', value: 3200 }));
    const messages = await collectMessages(ws, 1);
    const update = messages[0] as { type: string; data: { evPower: number } };
    expect(update.type).toBe('ENERGY_UPDATE');
    expect(update.data.evPower).toBe(3200);
    ws.close();
  });

  it('closes connection when command rate limit is exceeded', async () => {
    process.env.WS_RATE_LIMIT = '1';
    const ws = await connect('readwrite');
    await waitForMessage(ws);

    ws.send(JSON.stringify({ type: 'SET_EV_POWER', value: 1000 }));
    await waitForMessage(ws); // ENERGY_UPDATE after accepted command

    ws.send(JSON.stringify({ type: 'SET_EV_POWER', value: 2000 }));

    const closeCode = await new Promise<number>((resolve) => {
      ws.once('close', (code) => resolve(code));
    });
    expect(closeCode).toBe(4429);
  });

  it('rejects connections beyond per-IP limit', async () => {
    const sockets: WebSocket[] = [];
    for (let i = 0; i < 10; i++) {
      sockets.push(await connect());
    }

    const closeCode = await new Promise<number>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Expected connection rejection')), 3_000);
      const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
      ws.once('close', (code) => {
        clearTimeout(timer);
        resolve(code);
      });
    });
    expect(closeCode).toBe(4429);

    for (const ws of sockets) ws.terminate();
  });
});
