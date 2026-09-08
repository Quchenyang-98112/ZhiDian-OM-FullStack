/**
 * OcppCsmsProtocolAdapter unit tests — real WebSocket client against ephemeral CSMS port.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import {
  createOcppCsmsAdapterFromEnv,
  OcppCsmsProtocolAdapter,
} from './OcppCsmsProtocolAdapter.js';

type OcppOutboundCall = [2, string, string, Record<string, unknown>];

interface OcppChargingProfilePayload {
  chargingProfilePurpose: string;
  transactionId?: string;
  chargingSchedule: Array<{
    chargingRateUnit: string;
    chargingSchedulePeriod: Array<{ limit: number }>;
  }>;
}

function parseOutboundCall(data: WebSocket.RawData): OcppOutboundCall {
  return JSON.parse(String(data)) as OcppOutboundCall;
}

function chargingProfileFromCall(msg: OcppOutboundCall): OcppChargingProfilePayload {
  return msg[3].chargingProfile as OcppChargingProfilePayload;
}

async function expectNoSetChargingProfile(
  client: WebSocket,
  action: () => Promise<void>,
): Promise<void> {
  const outboundActions: string[] = [];
  const listener = (data: WebSocket.RawData) => {
    const msg = parseOutboundCall(data);
    if (msg[0] === 2 && msg[2] === 'SetChargingProfile') {
      outboundActions.push(msg[2]);
    }
  };
  client.on('message', listener);
  await action();
  await new Promise((resolve) => setTimeout(resolve, 20));
  client.off('message', listener);
  expect(outboundActions).toHaveLength(0);
}

async function connectChargePoint(port: number, cpId: string): Promise<WebSocket> {
  const client = new WebSocket(`ws://127.0.0.1:${port}/${cpId}`, 'ocpp2.0.1');
  await new Promise<void>((resolve, reject) => {
    client.once('open', () => resolve());
    client.once('error', reject);
  });
  client.on('message', (data) => {
    const msg = JSON.parse(String(data)) as [number, string, ...unknown[]];
    if (msg[0] === 2) {
      client.send(JSON.stringify([3, msg[1], { status: 'Accepted' }]));
    }
  });
  return client;
}

async function seedSoc(
  client: WebSocket,
  socPercent: number,
  voltageV = 230,
  options?: { transactionId?: string },
): Promise<void> {
  const callId = `soc-${Date.now()}`;
  const payload: Record<string, unknown> = {
    eventType: 'Updated',
    meterValue: [
      {
        timestamp: new Date().toISOString(),
        sampledValue: [
          { measurand: 'SoC', value: socPercent, unit: 'Percent' },
          { measurand: 'Voltage', value: voltageV, unit: 'V' },
        ],
      },
    ],
  };
  if (options?.transactionId) {
    payload.transactionInfo = { transactionId: options.transactionId };
  }
  client.send(JSON.stringify([2, callId, 'TransactionEvent', payload]));
  await new Promise<void>((resolve) => {
    const onMessage = (data: WebSocket.RawData) => {
      const msg = JSON.parse(String(data)) as [number, string, ...unknown[]];
      if (msg[0] === 3 && msg[1] === callId) {
        client.off('message', onMessage);
        resolve();
      }
    };
    client.on('message', onMessage);
  });
}

describe('OcppCsmsProtocolAdapter', () => {
  let adapter: OcppCsmsProtocolAdapter;
  let boundPort: number;

  beforeEach(async () => {
    adapter = new OcppCsmsProtocolAdapter({ id: 'test-csms', port: 0 });
    await adapter.connect();
    boundPort = adapter.getBoundPort() ?? 0;
    expect(boundPort).toBeGreaterThan(0);
  });

  afterEach(async () => {
    await adapter.disconnect();
  });

  it('has correct id and protocol', () => {
    expect(adapter.id).toBe('test-csms');
    expect(adapter.protocol).toBe('ocpp');
  });

  it('reports healthy when listening', async () => {
    const health = await adapter.healthCheck();
    expect(health.status).toBe('healthy');
  });

  it('responds to BootNotification and emits power from TransactionEvent', async () => {
    const stream = adapter.getDataStream();
    const dpPromise = stream.next();

    const client = new WebSocket(`ws://127.0.0.1:${boundPort}/CP-TEST-01`, 'ocpp2.0.1');
    await new Promise<void>((resolve, reject) => {
      client.once('open', () => resolve());
      client.once('error', reject);
    });

    const bootId = 'boot-1';
    client.send(
      JSON.stringify([
        2,
        bootId,
        'BootNotification',
        {
          chargingStation: {
            model: 'TestEVSE',
            vendorName: 'Test',
            serialNumber: 'CP-TEST-01',
          },
          reason: 'PowerUp',
        },
      ]),
    );

    const bootResult = await new Promise<unknown>((resolve) => {
      client.once('message', (data) => resolve(JSON.parse(String(data))));
    });
    expect(bootResult).toEqual([
      3,
      bootId,
      expect.objectContaining({ status: 'Accepted', interval: 300 }),
    ]);

    const txId = 'tx-1';
    client.send(
      JSON.stringify([
        2,
        txId,
        'TransactionEvent',
        {
          eventType: 'Updated',
          meterValue: [
            {
              timestamp: new Date().toISOString(),
              sampledValue: [{ measurand: 'Power.Active.Import', value: 7200, unit: 'W' }],
            },
          ],
        },
      ]),
    );

    await new Promise<void>((resolve) => {
      client.once('message', () => resolve());
    });

    const next = await dpPromise;
    expect(next.value?.role).toBe('ev');
    expect(next.value?.metric).toBe('POWER_W');
    expect(next.value?.value).toBe(7200);
    expect(next.value?.deviceId).toBe('CP-TEST-01');

    client.close();
  });

  it('createOcppCsmsAdapterFromEnv returns null without OCPP_CSMS_PORT', () => {
    expect(createOcppCsmsAdapterFromEnv({})).toBeNull();
  });

  it('createOcppCsmsAdapterFromEnv builds adapter from env', () => {
    const a = createOcppCsmsAdapterFromEnv({
      OCPP_CSMS_PORT: '9000',
      OCPP_CSMS_ADAPTER_ID: 'csms-edge',
    });
    expect(a?.id).toBe('csms-edge');
    expect(a?.protocol).toBe('ocpp');
  });

  it('supports EV command types', () => {
    expect(adapter.supportsCommand('SET_EV_POWER')).toBe(true);
    expect(adapter.supportsCommand('SET_V2X_DISCHARGE')).toBe(true);
    expect(adapter.supportsCommand('SET_GRID_LIMIT')).toBe(true);
    expect(adapter.supportsCommand('SET_BATTERY_POWER')).toBe(false);
  });

  it('sends SetChargingProfile on SET_EV_POWER when a charge point is connected', async () => {
    const client = await connectChargePoint(boundPort, 'CP-CMD-01');

    const outbound = new Promise<unknown>((resolve) => {
      client.once('message', (data) => resolve(JSON.parse(String(data))));
    });

    const result = await adapter.sendCommand({ type: 'SET_EV_POWER', value: 7200 });
    expect(result).toEqual({ handled: true, success: true, adapterId: 'test-csms' });

    const msg = (await outbound) as [number, string, string, Record<string, unknown>];
    expect(msg[0]).toBe(2);
    expect(msg[2]).toBe('SetChargingProfile');
    expect(msg[3].evseId).toBe(1);

    client.close();
  });

  it('returns error when no charge point is connected', async () => {
    const result = await adapter.sendCommand({ type: 'START_CHARGING', value: true });
    expect(result.handled).toBe(true);
    expect(result.success).toBe(false);
    expect(result.error).toContain('No charge point');
  });

  it('sends RequestStartTransaction on START_CHARGING', async () => {
    const client = await connectChargePoint(boundPort, 'CP-START');

    const outbound = new Promise<unknown>((resolve) => {
      client.once('message', (data) => resolve(JSON.parse(String(data))));
    });

    const result = await adapter.sendCommand({ type: 'START_CHARGING', value: true });
    expect(result.success).toBe(true);

    const msg = (await outbound) as [number, string, string, Record<string, unknown>];
    expect(msg[2]).toBe('RequestStartTransaction');
    client.close();
  });

  it('sends SetChargingProfile with amps on SET_EV_CURRENT', async () => {
    const client = await connectChargePoint(boundPort, 'CP-AMP');

    const outbound = new Promise<unknown>((resolve) => {
      client.once('message', (data) => resolve(JSON.parse(String(data))));
    });

    const result = await adapter.sendCommand({ type: 'SET_EV_CURRENT', value: 16 });
    expect(result.success).toBe(true);

    const msg = (await outbound) as OcppOutboundCall;
    expect(msg[2]).toBe('SetChargingProfile');
    const schedule = chargingProfileFromCall(msg).chargingSchedule[0];
    expect(schedule?.chargingRateUnit).toBe('A');
    client.close();
  });

  it('sends RequestStopTransaction when a transaction is active', async () => {
    const client = new WebSocket(`ws://127.0.0.1:${boundPort}/CP-STOP`, 'ocpp2.0.1');
    await new Promise<void>((resolve, reject) => {
      client.once('open', () => resolve());
      client.once('error', reject);
    });

    client.send(
      JSON.stringify([
        2,
        'tx-open',
        'TransactionEvent',
        { eventType: 'Started', transactionInfo: { transactionId: 'tx-42' } },
      ]),
    );
    await new Promise<void>((resolve) => {
      client.once('message', () => resolve());
    });

    client.on('message', (data) => {
      const msg = JSON.parse(String(data)) as [number, string, ...unknown[]];
      if (msg[0] === 2) {
        client.send(JSON.stringify([3, msg[1], { status: 'Accepted' }]));
      }
    });

    const outbound = new Promise<unknown>((resolve) => {
      client.once('message', (data) => {
        const parsed = JSON.parse(String(data)) as [number, string, ...unknown[]];
        if (parsed[0] === 2) resolve(parsed);
      });
    });

    const result = await adapter.sendCommand({ type: 'STOP_CHARGING', value: true });
    expect(result.success).toBe(true);

    const msg = (await outbound) as [number, string, string, Record<string, unknown>];
    expect(msg[2]).toBe('RequestStopTransaction');
    expect(msg[3].transactionId).toBe('tx-42');
    client.close();
  });

  it('rejects invalid SET_EV_POWER values', async () => {
    const client = await connectChargePoint(boundPort, 'CP-INVALID');

    const result = await adapter.sendCommand({
      type: 'SET_EV_POWER',
      value: '7200' as unknown as number,
    });
    expect(result.success).toBe(false);
    client.close();
  });

  it('fails when charge point responds with CallError', async () => {
    const client = new WebSocket(`ws://127.0.0.1:${boundPort}/CP-ERR`, 'ocpp2.0.1');
    await new Promise<void>((resolve, reject) => {
      client.once('open', () => resolve());
      client.once('error', reject);
    });
    client.on('message', (data) => {
      const msg = JSON.parse(String(data)) as [number, string, ...unknown[]];
      if (msg[0] === 2) {
        client.send(JSON.stringify([4, msg[1], 'InternalError', 'rejected', {}]));
      }
    });

    const result = await adapter.sendCommand({ type: 'SET_EV_POWER', value: 5000 });
    expect(result.success).toBe(false);
    expect(result.error).toContain('rejected or timed out');
    client.close();
  });

  it('fails when charge point responds with Rejected status', async () => {
    const client = new WebSocket(`ws://127.0.0.1:${boundPort}/CP-REJ`, 'ocpp2.0.1');
    await new Promise<void>((resolve, reject) => {
      client.once('open', () => resolve());
      client.once('error', reject);
    });
    client.on('message', (data) => {
      const msg = JSON.parse(String(data)) as [number, string, ...unknown[]];
      if (msg[0] === 2) {
        client.send(JSON.stringify([3, msg[1], { status: 'Rejected' }]));
      }
    });

    const result = await adapter.sendCommand({ type: 'SET_EV_POWER', value: 5000 });
    expect(result.success).toBe(false);
    client.close();
  });

  it('fails when charge point responds without Accepted status', async () => {
    const client = new WebSocket(`ws://127.0.0.1:${boundPort}/CP-NOSTATUS`, 'ocpp2.0.1');
    await new Promise<void>((resolve, reject) => {
      client.once('open', () => resolve());
      client.once('error', reject);
    });
    client.on('message', (data) => {
      const msg = JSON.parse(String(data)) as [number, string, ...unknown[]];
      if (msg[0] === 2) {
        client.send(JSON.stringify([3, msg[1], {}]));
      }
    });

    const result = await adapter.sendCommand({ type: 'SET_EV_POWER', value: 5000 });
    expect(result.success).toBe(false);
    client.close();
  });

  it('targets chargePointId when multiple charge points are connected', async () => {
    const clientA = await connectChargePoint(boundPort, 'CP-TARGET-A');
    const clientB = await connectChargePoint(boundPort, 'CP-TARGET-B');

    const outbound = new Promise<unknown>((resolve) => {
      clientB.once('message', (data) => resolve(JSON.parse(String(data))));
    });

    const result = await adapter.sendCommand({
      type: 'SET_EV_POWER',
      value: 5000,
      chargePointId: 'CP-TARGET-B',
    });
    expect(result.success).toBe(true);

    const msg = (await outbound) as [number, string, string, Record<string, unknown>];
    expect(msg[2]).toBe('SetChargingProfile');

    clientA.close();
    clientB.close();
  });

  it('returns error when chargePointId is not found', async () => {
    const client = await connectChargePoint(boundPort, 'CP-ONLY');

    const result = await adapter.sendCommand({
      type: 'SET_EV_POWER',
      value: 5000,
      chargePointId: 'missing-cp',
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('not found');

    client.close();
  });

  it('ignores malformed inbound OCPP frames without crashing', async () => {
    const client = new WebSocket(`ws://127.0.0.1:${boundPort}/CP-BADFRAME`, 'ocpp2.0.1');
    await new Promise<void>((resolve, reject) => {
      client.once('open', () => resolve());
      client.once('error', reject);
    });

    client.send(JSON.stringify([3, 'bad-callresult', 'not-an-object']));
    await new Promise((resolve) => setTimeout(resolve, 50));

    const health = await adapter.healthCheck();
    expect(health.status).toBe('healthy');
    client.close();
  });

  it('ignores malformed meterValue payloads without breaking TransactionEvent ACK', async () => {
    const client = await connectChargePoint(boundPort, 'CP-BADMETER');
    const callId = 'bad-meter-1';
    client.send(
      JSON.stringify([
        2,
        callId,
        'TransactionEvent',
        {
          eventType: 'Updated',
          meterValue: [{ sampledValue: 'not-an-array' }, null],
        },
      ]),
    );

    const ack = await new Promise<unknown>((resolve) => {
      client.once('message', (data) => resolve(JSON.parse(String(data))));
    });
    expect(ack).toEqual([3, callId, {}]);

    const health = await adapter.healthCheck();
    expect(health.status).toBe('healthy');
    client.close();
  });

  it('rejects commands when multiple charge points are connected', async () => {
    const clientA = await connectChargePoint(boundPort, 'CP-MULTI-A');
    const clientB = await connectChargePoint(boundPort, 'CP-MULTI-B');

    const result = await adapter.sendCommand({ type: 'SET_EV_POWER', value: 5000 });
    expect(result.success).toBe(false);
    expect(result.error).toContain('Multiple charge points');

    clientA.close();
    clientB.close();
  });

  it('sends negative TxProfile on SET_V2X_DISCHARGE when SOC is sufficient', async () => {
    const client = await connectChargePoint(boundPort, 'CP-V2G');
    await seedSoc(client, 50, 230, { transactionId: 'tx-v2g-1' });

    const outbound = new Promise<unknown>((resolve) => {
      client.once('message', (data) => resolve(JSON.parse(String(data))));
    });

    const result = await adapter.sendCommand({ type: 'SET_V2X_DISCHARGE', value: 4600 });
    expect(result).toEqual({ handled: true, success: true, adapterId: 'test-csms' });

    const msg = (await outbound) as OcppOutboundCall;
    expect(msg[2]).toBe('SetChargingProfile');
    const profile = chargingProfileFromCall(msg);
    expect(profile.chargingProfilePurpose).toBe('TxProfile');
    expect(profile.transactionId).toBe('tx-v2g-1');
    expect(profile.chargingSchedule[0]?.chargingRateUnit).toBe('A');
    expect(profile.chargingSchedule[0]?.chargingSchedulePeriod[0]?.limit).toBe(-20);

    client.close();
  });

  it('blocks SET_V2X_DISCHARGE without an active transaction', async () => {
    const client = await connectChargePoint(boundPort, 'CP-V2G-NOTX');
    await seedSoc(client, 50);

    await expectNoSetChargingProfile(client, async () => {
      const result = await adapter.sendCommand({ type: 'SET_V2X_DISCHARGE', value: 3000 });
      expect(result.success).toBe(false);
      expect(result.error).toContain('No active transaction');
    });

    client.close();
  });

  it('blocks SET_V2X_DISCHARGE when SoC telemetry is out of range', async () => {
    const client = await connectChargePoint(boundPort, 'CP-V2G-BAD');
    await seedSoc(client, 150, 230, { transactionId: 'tx-bad-soc' });

    await expectNoSetChargingProfile(client, async () => {
      const result = await adapter.sendCommand({ type: 'SET_V2X_DISCHARGE', value: 3000 });
      expect(result.success).toBe(false);
      expect(result.error).toContain('SOC below minimum');
    });

    client.close();
  });

  it('blocks SET_V2X_DISCHARGE when SOC is below guardrail', async () => {
    const client = await connectChargePoint(boundPort, 'CP-V2G-LOW');
    await seedSoc(client, 10);

    await expectNoSetChargingProfile(client, async () => {
      const result = await adapter.sendCommand({ type: 'SET_V2X_DISCHARGE', value: 3000 });
      expect(result.success).toBe(false);
      expect(result.error).toContain('SOC below minimum');
    });

    client.close();
  });

  it('blocks SET_V2X_DISCHARGE when SOC is unknown', async () => {
    const client = await connectChargePoint(boundPort, 'CP-V2G-UNK');

    await expectNoSetChargingProfile(client, async () => {
      const result = await adapter.sendCommand({ type: 'SET_V2X_DISCHARGE', value: 3000 });
      expect(result.success).toBe(false);
      expect(result.error).toContain('SOC below minimum');
    });

    client.close();
  });

  it('sends ChargingStationMaxProfile on SET_GRID_LIMIT in watts', async () => {
    const client = await connectChargePoint(boundPort, 'CP-GRID');

    const outbound = new Promise<unknown>((resolve) => {
      client.once('message', (data) => resolve(JSON.parse(String(data))));
    });

    const result = await adapter.sendCommand({ type: 'SET_GRID_LIMIT', value: 4200 });
    expect(result.success).toBe(true);

    const msg = (await outbound) as OcppOutboundCall;
    expect(msg[2]).toBe('SetChargingProfile');
    expect(msg[3].evseId).toBe(0);
    const profile = chargingProfileFromCall(msg);
    expect(profile.chargingProfilePurpose).toBe('ChargingStationMaxProfile');
    expect(profile.chargingSchedule[0]?.chargingRateUnit).toBe('W');
    expect(profile.chargingSchedule[0]?.chargingSchedulePeriod[0]?.limit).toBe(4200);

    client.close();
  });

  it('passes through SET_GRID_LIMIT values in kW range for OpenEMS', async () => {
    const client = await connectChargePoint(boundPort, 'CP-GRID-KW');

    const result = await adapter.sendCommand({ type: 'SET_GRID_LIMIT', value: 4.2 });
    expect(result.handled).toBe(false);
    expect(result.success).toBe(false);

    client.close();
  });
});
