import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AddAdapterWizard } from '../components/hardware/AddAdapterWizard';
import type { AdapterStatus } from '../core/adapters/EnergyAdapter';

// ── i18n: return the key (or defaultValue) verbatim ───────────────────────────
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: { defaultValue?: string }) => opts?.defaultValue ?? key,
  }),
}));

// ── Force the *live* code path so runConnectionTest() actually probes ─────────
vi.mock('../lib/adapter-mode', () => ({ isLiveHardwareBuildAllowed: () => true }));

// ── Motion → plain div (jsdom-friendly) ──────────────────────────────────────
vi.mock('motion/react', () => ({
  motion: new Proxy({}, { get: () => (props: Record<string, unknown>) => <div {...props} /> }),
}));

// ── Store + helper mocks (wizard only reads a handful of things) ──────────────
vi.mock('../core/useEnergyStore', () => ({
  useEnergyStore: (sel: (s: Record<string, unknown>) => unknown) =>
    sel({ enableAdapter: vi.fn(), addContribAdapter: vi.fn() }),
  useEnergyStoreBase: { getState: () => ({ adapters: {} }) },
}));
vi.mock('../store', () => ({
  useAppStore: (sel: (s: Record<string, unknown>) => unknown) => sel({ updateSettings: vi.fn() }),
}));
vi.mock('../lib/hardware-adapter-map', () => ({
  defaultHostForDevice: () => '192.168.1.50',
  defaultPortForAdapter: () => 502,
  suggestAdapterIdForDevice: () => null,
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn() } }));

// ── Adapter probe: build a fake adapter whose connect() ends in a chosen state ─
const createRegisteredAdapter = vi.fn();
vi.mock('../core/adapters/adapter-registry', () => ({
  createRegisteredAdapter: (id: string, cfg: unknown) => createRegisteredAdapter(id, cfg),
  listRegisteredAdapters: () => [{ id: 'victron-mqtt', label: 'Victron MQTT' }],
}));

function makeProbe(finalStatus: AdapterStatus, error?: string) {
  let statusCb: ((s: AdapterStatus, e?: string) => void) | undefined;
  return {
    status: finalStatus,
    onStatus: (cb: (s: AdapterStatus, e?: string) => void) => {
      statusCb = cb;
    },
    connect: vi.fn(async () => {
      // Non-throwing contract (ADR-024): report failure via status, never reject.
      statusCb?.(finalStatus, error);
    }),
    disconnect: vi.fn(async () => {}),
    destroy: vi.fn(),
  };
}

async function advanceToTestStep(user: ReturnType<typeof userEvent.setup>) {
  // adapter → connection → test (host/name are pre-filled by the mocked defaults)
  await user.click(screen.getByRole('button', { name: /common\.confirm/ }));
  await user.click(screen.getByRole('button', { name: /common\.confirm/ }));
  await user.click(screen.getByRole('button', { name: /wizard\.runTest/ }));
}

describe('AddAdapterWizard — live connection test', () => {
  beforeEach(() => {
    createRegisteredAdapter.mockReset();
  });

  it('reports FAILURE when the probe ends in error status (non-throwing connect)', async () => {
    const probe = makeProbe('error', 'health endpoint not reachable');
    createRegisteredAdapter.mockReturnValue(probe);
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <AddAdapterWizard onClose={vi.fn()} />
      </MemoryRouter>,
    );
    await advanceToTestStep(user);

    // The captured error message surfaces; success is NOT reported.
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent('health endpoint not reachable'),
    );
    expect(screen.queryByText('hardwareRegistry.wizard.testSuccess')).not.toBeInTheDocument();
    // A failed probe must not be disconnected-as-success and must be cleaned up.
    expect(probe.disconnect).not.toHaveBeenCalled();
    expect(probe.destroy).toHaveBeenCalled();
    // The "Enable" button stays disabled because testOk !== true.
    expect(screen.getByRole('button', { name: /wizard\.enable/ })).toBeDisabled();
  });

  it('reports SUCCESS when the probe connects cleanly', async () => {
    const probe = makeProbe('connected');
    createRegisteredAdapter.mockReturnValue(probe);
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <AddAdapterWizard onClose={vi.fn()} />
      </MemoryRouter>,
    );
    await advanceToTestStep(user);

    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent('hardwareRegistry.wizard.testSuccess'),
    );
    expect(probe.disconnect).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /wizard\.enable/ })).toBeEnabled();
  });
});
