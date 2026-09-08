/**
 * Victron Venus OS Simulator — Hardware-in-the-Loop Mock
 *
 * Simulates a Venus OS dbus-mqtt bridge via a mock WebSocket server.
 * Provides realistic MQTT topic messages (N/<portalId>/<service>/<path>)
 * and accepts W/ write commands, enabling full integration testing
 * without a physical Cerbo GX device.
 *
 * Usage:
 *   const sim = new VictronSimulator({ portalId: 'test-portal-1' });
 *   sim.start();           // starts mock WebSocket
 *   sim.setPV(4200, 18.5); // simulate PV output
 *   sim.stop();            // cleanup
 */

import { vi } from 'vitest';

// ─── Types ───────────────────────────────────────────────────────────

export interface VictronSimulatorConfig {
  portalId?: string;
  /** Initial PV power (W) */
  pvPowerW?: number;
  /** Initial battery SoC (%) */
  batterySoC?: number;
  /** Initial grid power (W, positive=import) */
  gridPowerW?: number;
}

interface SimulatorState {
  pvPowerW: number;
  pvYieldWh: number;
  batteryPowerW: number;
  batterySoC: number;
  batteryVoltageV: number;
  batteryCurrentA: number;
  gridPowerW: number;
  gridVoltageV: number;
  gridEnergyFwdWh: number;
  gridEnergyRevWh: number;
  vebusPowerW: number;
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

// ─── Simulator ───────────────────────────────────────────────────────

export class VictronSimulator {
  readonly portalId: string;
  private state: SimulatorState;
  private mockWs: MockWebSocketInstance | null = null;
  private originalWebSocket: typeof WebSocket | undefined;
  private writeHandler: ((topic: string, value: unknown) => void) | null = null;

  constructor(config?: VictronSimulatorConfig) {
    this.portalId = config?.portalId ?? 'sim-portal-001';
    this.state = {
      pvPowerW: config?.pvPowerW ?? 0,
      pvYieldWh: 0,
      batteryPowerW: 0,
      batterySoC: config?.batterySoC ?? 50,
      batteryVoltageV: 51.2,
      batteryCurrentA: 0,
      gridPowerW: config?.gridPowerW ?? 0,
      gridVoltageV: 230,
      gridEnergyFwdWh: 0,
      gridEnergyRevWh: 0,
      vebusPowerW: 0,
    };
  }

  /**
   * Install the mock WebSocket globally and prepare for connections.
   * Returns the mock WS instance after the adapter connects.
   */
  start(): void {
    this.originalWebSocket = globalThis.WebSocket;
    const setMockWs = (ws: MockWebSocketInstance) => {
      this.mockWs = ws;
    };
    const getWriteHandler = () => this.writeHandler;

    const MockWS = class {
      static OPEN = 1;
      static CLOSED = 3;
      readyState = 1;
      onopen: (() => void) | null = null;
      onmessage: ((event: { data: string }) => void) | null = null;
      onclose: ((event: { code?: number }) => void) | null = null;
      onerror: ((event: unknown) => void) | null = null;

      send = vi.fn((data: string) => {
        // Handle W/ write commands from adapter
        try {
          const parsed = JSON.parse(data);
          // Legacy format: { type: string, value: ... }
          if (parsed.type) {
            getWriteHandler()?.(parsed.type, parsed.value);
          }
        } catch {
          // Not JSON
        }
      });

      close = vi.fn(() => {
        this.readyState = 3;
        setTimeout(() => this.onclose?.({ code: 1000 }), 0);
      });

      constructor() {
        setMockWs(this as unknown as MockWebSocketInstance);
        setTimeout(() => this.onopen?.(), 0);
      }
    };

    vi.stubGlobal('WebSocket', MockWS);
  }

  /** Stop simulator and restore original WebSocket */
  stop(): void {
    if (this.originalWebSocket) {
      vi.stubGlobal('WebSocket', this.originalWebSocket);
    } else {
      vi.unstubAllGlobals();
    }
    this.mockWs = null;
  }

  /** Get the mock WebSocket instance (available after adapter connects) */
  get ws(): MockWebSocketInstance | null {
    return this.mockWs;
  }

  /** Register a handler for W/ write commands */
  onWrite(handler: (topic: string, value: unknown) => void): void {
    this.writeHandler = handler;
  }

  // ─── Simulate data publishing ─────────────────────────────────────

  /** Send a legacy Node-RED ENERGY_UPDATE message */
  publishLegacyUpdate(): void {
    if (!this.mockWs?.onmessage) return;
    this.mockWs.onmessage({
      data: JSON.stringify({
        type: 'ENERGY_UPDATE',
        data: {
          pvPower: this.state.pvPowerW,
          pvYieldToday: this.state.pvYieldWh / 1000,
          batteryPower: this.state.batteryPowerW,
          batterySoC: this.state.batterySoC,
          batteryVoltage: this.state.batteryVoltageV,
          gridPower: this.state.gridPowerW,
          gridVoltage: this.state.gridVoltageV,
          houseLoad: Math.max(
            0,
            this.state.pvPowerW - this.state.batteryPowerW + this.state.gridPowerW,
          ),
          heatPumpPower: 0,
          evPower: 0,
          priceCurrent: 0.28,
        },
      }),
    });
  }

  // ─── State setters ────────────────────────────────────────────────

  /** Set PV production values */
  setPV(powerW: number, yieldTodayKWh: number = 0): void {
    this.state.pvPowerW = powerW;
    this.state.pvYieldWh = yieldTodayKWh * 1000;
  }

  /** Set battery state */
  setBattery(powerW: number, socPercent: number, voltageV: number = 51.2): void {
    this.state.batteryPowerW = powerW;
    this.state.batterySoC = socPercent;
    this.state.batteryVoltageV = voltageV;
    this.state.batteryCurrentA = voltageV > 0 ? powerW / voltageV : 0;
  }

  /** Set grid state */
  setGrid(powerW: number, voltageV: number = 230): void {
    this.state.gridPowerW = powerW;
    this.state.gridVoltageV = voltageV;
    if (powerW > 0) {
      this.state.gridEnergyFwdWh += powerW;
    } else {
      this.state.gridEnergyRevWh += Math.abs(powerW);
    }
  }

  /** Set VE.Bus power */
  setVebus(powerW: number): void {
    this.state.vebusPowerW = powerW;
  }

  /** Get current internal state (for assertions) */
  getState(): Readonly<SimulatorState> {
    return { ...this.state };
  }

  /**
   * Simulate a complete energy scenario.
   * Sets PV, battery, grid coherently and publishes update.
   */
  simulateScenario(scenario: {
    pvPowerW?: number;
    batteryPowerW?: number;
    batterySoC?: number;
    gridPowerW?: number;
    evPowerW?: number;
    heatPumpPowerW?: number;
  }): void {
    if (scenario.pvPowerW !== undefined) this.state.pvPowerW = scenario.pvPowerW;
    if (scenario.batteryPowerW !== undefined) this.state.batteryPowerW = scenario.batteryPowerW;
    if (scenario.batterySoC !== undefined) this.state.batterySoC = scenario.batterySoC;
    if (scenario.gridPowerW !== undefined) this.state.gridPowerW = scenario.gridPowerW;
  }
}
