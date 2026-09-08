/**
 * OCPP 2.1 Mock Server — Hardware-in-the-Loop Mock
 *
 * Simulates an OCPP 2.1 Charging Station (EVSE/Wallbox) that communicates
 * via WebSocket. Fully supports the JSON-RPC message correlation pattern
 * (CALL/CALLRESULT/CALLERROR) used by the OCPP21Adapter.
 *
 * Simulates:
 *   - StatusNotification (connector status changes)
 *   - TransactionEvent (Started/Updated/Ended with meter values)
 *   - MeterValues (power, energy, SoC, current, voltage)
 *   - Heartbeat (keep-alive)
 *   - BootNotification response
 *
 * Usage:
 *   const server = new OCPPMockServer();
 *   server.start();
 *   // ... adapter connects ...
 *   await server.waitForConnection();
 *   server.simulatePlugIn();
 *   server.simulateChargingSession({ powerW: 11000, energyKWh: 5.2, soc: 42 });
 *   server.simulatePlugOut();
 *   server.stop();
 */

import { vi } from 'vitest';

// ─── OCPP Message Constants ─────────────────────────────────────────

const OCPP_CALL = 2;
const OCPP_CALLRESULT = 3;
// const OCPP_CALLERROR = 4; // available if needed

// ─── Types ───────────────────────────────────────────────────────────

interface OCPPCallMessage {
  messageId: string;
  action: string;
  payload: Record<string, unknown>;
}

export interface ChargingSessionParams {
  powerW: number;
  energyKWh?: number;
  soc?: number;
  currentA?: number;
  voltageV?: number;
}

export interface MockWebSocketInstance {
  onopen: (() => void) | null;
  onmessage: ((event: { data: string }) => void) | null;
  onclose: ((event: { code?: number }) => void) | null;
  onerror: ((event: unknown) => void) | null;
  readyState: number;
  send: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
}

// ─── OCPP Mock Server ───────────────────────────────────────────────

export class OCPPMockServer {
  private mockWs: MockWebSocketInstance | null = null;
  private receivedCalls: OCPPCallMessage[] = [];
  private transactionId: string | null = null;
  private connectionResolve: (() => void) | null = null;

  /**
   * Install mock WebSocket globally.
   * The next `new WebSocket(...)` will connect to this mock server.
   */
  start(): void {
    const setMockWs = (ws: MockWebSocketInstance) => {
      this.mockWs = ws;
    };
    const handleCall = (id: string, action: string, payload: Record<string, unknown>) => {
      this.handleAdapterCall(id, action, payload);
    };
    const resolveConnection = () => {
      this.connectionResolve?.();
    };

    const MockWS = class {
      static OPEN = 1;
      static CLOSED = 3;
      readyState = 1;
      onopen: (() => void) | null = null;
      onmessage: ((event: { data: string }) => void) | null = null;
      onclose: ((event: { code?: number }) => void) | null = null;
      onerror: ((event: unknown) => void) | null = null;

      send = vi.fn((data: string) => {
        try {
          const msg = JSON.parse(data) as unknown[];
          if (msg[0] === OCPP_CALL) {
            const [, messageId, action, payload] = msg as [
              number,
              string,
              string,
              Record<string, unknown>,
            ];
            handleCall(messageId, action, payload);
          }
        } catch {
          // ignore non-JSON
        }
      });

      close = vi.fn(() => {
        this.readyState = 3;
        setTimeout(() => this.onclose?.({ code: 1000 }), 0);
      });

      constructor(_url: string, _protocols?: string | string[]) {
        setMockWs(this as unknown as MockWebSocketInstance);
        setTimeout(() => {
          this.onopen?.();
          resolveConnection();
        }, 0);
      }
    };

    vi.stubGlobal('WebSocket', MockWS);
  }

  /** Stop the mock server and restore WebSocket */
  stop(): void {
    vi.unstubAllGlobals();
    this.mockWs = null;
    this.receivedCalls = [];
    this.transactionId = null;
  }

  /** Wait for an adapter to connect (resolves when onopen fires) */
  async waitForConnection(): Promise<void> {
    if (this.mockWs) return;
    return new Promise((resolve) => {
      this.connectionResolve = resolve;
    });
  }

  /** Get the mock WebSocket instance */
  get ws(): MockWebSocketInstance | null {
    return this.mockWs;
  }

  /** Get all CALL messages received from the adapter */
  get calls(): readonly OCPPCallMessage[] {
    return this.receivedCalls;
  }

  /** Get calls filtered by action name */
  getCallsByAction(action: string): OCPPCallMessage[] {
    return this.receivedCalls.filter((c) => c.action === action);
  }

  // ─── Handle adapter outbound CALLs ───────────────────────────────

  private handleAdapterCall(
    messageId: string,
    action: string,
    payload: Record<string, unknown>,
  ): void {
    this.receivedCalls.push({ messageId, action, payload });

    // Auto-respond based on action
    switch (action) {
      case 'BootNotification':
        this.sendCallResult(messageId, {
          currentTime: new Date().toISOString(),
          interval: 300,
          status: 'Accepted',
        });
        break;

      case 'SetChargingProfile':
        this.sendCallResult(messageId, { status: 'Accepted' });
        break;

      case 'RequestStartTransaction':
        this.transactionId = `txn-${Date.now()}`;
        this.sendCallResult(messageId, {
          status: 'Accepted',
          transactionId: this.transactionId,
        });
        break;

      case 'RequestStopTransaction':
        this.sendCallResult(messageId, { status: 'Accepted' });
        break;

      default:
        this.sendCallResult(messageId, {});
    }
  }

  // ─── Send messages TO the adapter ─────────────────────────────────

  /** Send a CALLRESULT response for a pending adapter CALL */
  private sendCallResult(messageId: string, payload: Record<string, unknown>): void {
    this.sendToAdapter(JSON.stringify([OCPP_CALLRESULT, messageId, payload]));
  }

  /** Send an inbound CALL to the adapter (simulating wallbox → CSMS) */
  sendCall(action: string, payload: Record<string, unknown>): string {
    const messageId = `server-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    this.sendToAdapter(JSON.stringify([OCPP_CALL, messageId, action, payload]));
    return messageId;
  }

  private sendToAdapter(data: string): void {
    if (!this.mockWs?.onmessage) return;
    this.mockWs.onmessage({ data });
  }

  // ─── Simulation helpers ───────────────────────────────────────────

  /** Simulate EV plug-in: StatusNotification → Occupied */
  simulatePlugIn(): void {
    this.sendCall('StatusNotification', {
      timestamp: new Date().toISOString(),
      connectorStatus: 'Occupied',
      evseId: 1,
      connectorId: 1,
    });
  }

  /** Simulate EV plug-out: StatusNotification → Available */
  simulatePlugOut(): void {
    this.transactionId = null;
    this.sendCall('StatusNotification', {
      timestamp: new Date().toISOString(),
      connectorStatus: 'Available',
      evseId: 1,
      connectorId: 1,
    });
  }

  /** Simulate charging session start with TransactionEvent */
  simulateChargingStart(params?: Partial<ChargingSessionParams>): string {
    this.transactionId = `txn-${Date.now()}`;
    this.sendCall('TransactionEvent', {
      eventType: 'Started',
      timestamp: new Date().toISOString(),
      transactionInfo: {
        transactionId: this.transactionId,
        chargingState: 'Charging',
      },
      evse: { id: 1, connectorId: 1 },
      meterValue: params
        ? [
            {
              timestamp: new Date().toISOString(),
              sampledValue: this.buildMeterValues(params),
            },
          ]
        : undefined,
    });
    return this.transactionId;
  }

  /** Simulate charging update with meter values */
  simulateChargingUpdate(params: ChargingSessionParams): void {
    this.sendCall('TransactionEvent', {
      eventType: 'Updated',
      timestamp: new Date().toISOString(),
      transactionInfo: {
        transactionId: this.transactionId,
        chargingState: 'Charging',
      },
      meterValue: [
        {
          timestamp: new Date().toISOString(),
          sampledValue: this.buildMeterValues(params),
        },
      ],
    });
  }

  /** Simulate charging session end */
  simulateChargingEnd(finalEnergyKWh?: number): void {
    const meterValues = finalEnergyKWh
      ? [
          {
            timestamp: new Date().toISOString(),
            sampledValue: [
              {
                value: finalEnergyKWh * 1000,
                measurand: 'Energy.Active.Import.Register',
                unit: 'Wh',
              },
              { value: 0, measurand: 'Power.Active.Import', unit: 'W' },
            ],
          },
        ]
      : undefined;

    this.sendCall('TransactionEvent', {
      eventType: 'Ended',
      timestamp: new Date().toISOString(),
      transactionInfo: {
        transactionId: this.transactionId,
        chargingState: 'Idle',
      },
      meterValue: meterValues,
    });
    this.transactionId = null;
  }

  /** Simulate standalone MeterValues message */
  simulateMeterValues(params: ChargingSessionParams): void {
    this.sendCall('MeterValues', {
      evseId: 1,
      meterValue: [
        {
          timestamp: new Date().toISOString(),
          sampledValue: this.buildMeterValues(params),
        },
      ],
    });
  }

  /** Simulate Heartbeat */
  simulateHeartbeat(): void {
    this.sendCall('Heartbeat', {});
  }

  /** Simulate a full charging session lifecycle */
  async simulateFullSession(params: ChargingSessionParams, durationMs: number = 0): Promise<void> {
    this.simulatePlugIn();
    this.simulateChargingStart(params);
    if (durationMs > 0) {
      await new Promise((r) => setTimeout(r, durationMs));
    }
    this.simulateChargingUpdate(params);
    this.simulateChargingEnd(params.energyKWh);
    this.simulatePlugOut();
  }

  // ─── Helpers ──────────────────────────────────────────────────────

  private buildMeterValues(
    params: Partial<ChargingSessionParams>,
  ): { value: number; measurand: string; unit: string }[] {
    const values: { value: number; measurand: string; unit: string }[] = [];

    if (params.powerW !== undefined) {
      values.push({ value: params.powerW, measurand: 'Power.Active.Import', unit: 'W' });
    }
    if (params.energyKWh !== undefined) {
      values.push({
        value: params.energyKWh * 1000,
        measurand: 'Energy.Active.Import.Register',
        unit: 'Wh',
      });
    }
    if (params.soc !== undefined) {
      values.push({ value: params.soc, measurand: 'SoC', unit: 'Percent' });
    }
    if (params.currentA !== undefined) {
      values.push({ value: params.currentA, measurand: 'Current.Import', unit: 'A' });
    }
    if (params.voltageV !== undefined) {
      values.push({ value: params.voltageV, measurand: 'Voltage', unit: 'V' });
    }

    return values;
  }
}
