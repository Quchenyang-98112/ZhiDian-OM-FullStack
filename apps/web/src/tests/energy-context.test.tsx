/**
 * Tests for EnergyContext / EnergyProvider
 *
 * Covers:
 *  - Single combined useAppStoreShallow subscription (Opt #2)
 *  - Derived metrics: selfSufficiencyPercent, isExporting
 *  - detailPanel state: openNode / close
 *  - Demo-data fallback when disconnected
 *  - useEnergyContext throws outside provider
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EnergyProvider, useEnergyContext } from '../core/EnergyContext';
import { useAppStore } from '../store';
import { act, render, screen, waitFor } from './test-utils';

// ── Mocks ─────────────────────────────────────────────────────────────

vi.mock('../lib/db', () => ({ persistSettings: vi.fn() }));

// Mock all 5 adapters so useEnergyStore can initialise
function makeAdapter(id: string) {
  return class {
    id = id;
    name = id;
    status = 'disconnected';
    capabilities: string[] = [];
    connect = vi.fn();
    disconnect = vi.fn();
    destroy = vi.fn();
    sendCommand = vi.fn();
    onData = vi.fn();
    onStatus = vi.fn();
  };
}

vi.mock('../core/adapters/VictronMQTTAdapter', () => ({
  VictronMQTTAdapter: makeAdapter('victron-mqtt'),
}));
vi.mock('../core/adapters/ModbusSunSpecAdapter', () => ({
  ModbusSunSpecAdapter: makeAdapter('modbus-sunspec'),
}));
vi.mock('../core/adapters/KNXAdapter', () => ({
  KNXAdapter: makeAdapter('knx'),
}));
vi.mock('../core/adapters/OCPP21Adapter', () => ({
  OCPP21Adapter: makeAdapter('ocpp-21'),
}));
vi.mock('../core/adapters/EEBUSAdapter', () => ({
  EEBUSAdapter: makeAdapter('eebus'),
}));

// ── Helpers ───────────────────────────────────────────────────────────

/** Consumer component that renders context values as data-testid text */
function ContextInspector() {
  const ctx = useEnergyContext();
  return (
    <div>
      <span data-testid="connected">{String(ctx.connected)}</span>
      <span data-testid="selfSufficiency">{ctx.selfSufficiencyPercent}</span>
      <span data-testid="isExporting">{String(ctx.isExporting)}</span>
      <span data-testid="panelOpen">{String(ctx.detailPanel.open)}</span>
      <span data-testid="panelNodeId">{ctx.detailPanel.nodeId ?? 'null'}</span>
      <button
        type="button"
        data-testid="openBtn"
        onClick={() => ctx.detailPanel.openNode('pv-node')}
      >
        open
      </button>
      <button type="button" data-testid="closeBtn" onClick={() => ctx.detailPanel.close()}>
        close
      </button>
    </div>
  );
}

function renderWithProvider() {
  return render(
    <EnergyProvider>
      <ContextInspector />
    </EnergyProvider>,
  );
}

// ── Tests ─────────────────────────────────────────────────────────────

describe('EnergyProvider', () => {
  beforeEach(() => {
    // Reset to disconnected, zeroed energy data
    useAppStore.setState({
      energyData: {
        gridPower: 0,
        pvPower: 0,
        batteryPower: 0,
        houseLoad: 0,
        batterySoC: 0,
        heatPumpPower: 0,
        evPower: 0,
        gridVoltage: 230,
        batteryVoltage: 51.2,
        pvYieldToday: 0,
        priceCurrent: 0.18,
      },
      connected: false,
    });
  });

  it('exposes connected=false by default', () => {
    renderWithProvider();
    expect(screen.getByTestId('connected').textContent).toBe('false');
  });

  it('reflects connected=true when store updates', async () => {
    renderWithProvider();
    act(() => {
      useAppStore.getState().setConnected(true);
    });
    await waitFor(() => {
      expect(screen.getByTestId('connected').textContent).toBe('true');
    });
  });

  describe('isExporting derived metric', () => {
    it('is false when gridPower >= 0 (importing)', async () => {
      // Ensure connected so we get real data, not demo data
      useAppStore.setState({
        connected: true,
        energyData: {
          gridPower: 500,
          pvPower: 3000,
          batteryPower: 0,
          houseLoad: 3500,
          batterySoC: 60,
          heatPumpPower: 0,
          evPower: 0,
          gridVoltage: 230,
          batteryVoltage: 51.2,
          pvYieldToday: 10,
          priceCurrent: 0.18,
        },
      });
      renderWithProvider();
      await waitFor(() => {
        expect(screen.getByTestId('isExporting').textContent).toBe('false');
      });
    });

    it('is true when gridPower < 0 (exporting)', async () => {
      useAppStore.setState({
        connected: true,
        energyData: {
          gridPower: -1200,
          pvPower: 8000,
          batteryPower: -2000,
          houseLoad: 3000,
          batterySoC: 72,
          heatPumpPower: 0,
          evPower: 0,
          gridVoltage: 232,
          batteryVoltage: 52,
          pvYieldToday: 25,
          priceCurrent: 0.12,
        },
      });
      renderWithProvider();
      await waitFor(() => {
        expect(screen.getByTestId('isExporting').textContent).toBe('true');
      });
    });
  });

  describe('selfSufficiencyPercent derived metric', () => {
    it('is 0 when houseLoad is 0', () => {
      useAppStore.setState({ connected: true });
      renderWithProvider();
      // houseLoad=0 → 0% self-sufficiency
      expect(screen.getByTestId('selfSufficiency').textContent).toBe('0');
    });

    it('calculates correctly when fully self-sufficient (no grid import)', async () => {
      useAppStore.setState({
        connected: true,
        energyData: {
          gridPower: -500, // exporting surplus
          pvPower: 5000,
          batteryPower: 0,
          houseLoad: 4000,
          batterySoC: 80,
          heatPumpPower: 0,
          evPower: 0,
          gridVoltage: 230,
          batteryVoltage: 52,
          pvYieldToday: 20,
          priceCurrent: 0.1,
        },
      });
      renderWithProvider();
      await waitFor(() => {
        // gridImport = max(0, -500) = 0 → 100% self-sufficient
        expect(screen.getByTestId('selfSufficiency').textContent).toBe('100');
      });
    });

    it('calculates correctly when partially on grid', async () => {
      useAppStore.setState({
        connected: true,
        energyData: {
          gridPower: 1000, // importing 1 kW
          pvPower: 3000,
          batteryPower: 0,
          houseLoad: 4000, // total 4 kW load
          batterySoC: 50,
          heatPumpPower: 0,
          evPower: 0,
          gridVoltage: 230,
          batteryVoltage: 51.2,
          pvYieldToday: 10,
          priceCurrent: 0.2,
        },
      });
      renderWithProvider();
      await waitFor(() => {
        // self-suff = round((4000 - 1000) / 4000 * 100) = 75
        expect(screen.getByTestId('selfSufficiency').textContent).toBe('75');
      });
    });
  });

  describe('detailPanel', () => {
    it('starts with panel closed and no nodeId', () => {
      renderWithProvider();
      expect(screen.getByTestId('panelOpen').textContent).toBe('false');
      expect(screen.getByTestId('panelNodeId').textContent).toBe('null');
    });

    it('opens panel and sets nodeId on openNode()', async () => {
      renderWithProvider();
      act(() => {
        screen.getByTestId('openBtn').click();
      });
      await waitFor(() => {
        expect(screen.getByTestId('panelOpen').textContent).toBe('true');
        expect(screen.getByTestId('panelNodeId').textContent).toBe('pv-node');
      });
    });

    it('closes panel on close()', async () => {
      renderWithProvider();
      act(() => {
        screen.getByTestId('openBtn').click();
      });
      await waitFor(() => {
        expect(screen.getByTestId('panelOpen').textContent).toBe('true');
      });
      act(() => {
        screen.getByTestId('closeBtn').click();
      });
      await waitFor(() => {
        expect(screen.getByTestId('panelOpen').textContent).toBe('false');
      });
    });
  });

  describe('demo-data fallback', () => {
    it('uses demo data when disconnected and store has zeroed data', () => {
      // mock/disconnected → simulation chrome → demo plant
      useAppStore.setState({ adapterMode: 'mock' });
      renderWithProvider();
      expect(screen.getByTestId('isExporting').textContent).toBe('true');
      expect(screen.getByTestId('selfSufficiency').textContent).toBe('100');
    });

    it('does not substitute demo data in live mode when disconnected', () => {
      useAppStore.setState({ adapterMode: 'live' });
      renderWithProvider();
      expect(screen.getByTestId('isExporting').textContent).toBe('false');
      expect(screen.getByTestId('selfSufficiency').textContent).toBe('0');
    });
  });
});

describe('useEnergyContext', () => {
  it('throws when used outside EnergyProvider', () => {
    // Suppress expected React error boundary output in test
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    function BadConsumer() {
      useEnergyContext();
      return null;
    }

    expect(() => render(<BadConsumer />)).toThrow(
      'useEnergyContext must be used within <EnergyProvider>',
    );

    consoleError.mockRestore();
  });
});
