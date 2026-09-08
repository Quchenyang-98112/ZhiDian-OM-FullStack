import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdapterCommand } from '../core/adapters/EnergyAdapter';

const mockValidateShape = vi.fn();
const mockRequiresConfirmation = vi.fn();
const mockSend = vi.fn();
const mockAudit = vi.fn();

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, def?: unknown) => (typeof def === 'string' ? def : key),
  }),
}));
vi.mock('../components/ConfirmDialog', () => ({ ConfirmDialog: () => null }));
vi.mock('../core/command-safety', () => ({
  validateCommandShape: (c: AdapterCommand) => mockValidateShape(c),
  requiresConfirmation: (c: AdapterCommand) => mockRequiresConfirmation(c),
  describeCommand: () => ({ severity: 'warning', labelKey: 'safety.confirmGeneric' }),
  logCommandAudit: (entry: unknown) => mockAudit(entry),
}));
vi.mock('../core/useEnergyStore', () => ({
  sendAdapterCommand: (c: AdapterCommand) => mockSend(c),
}));
vi.mock('../store', () => ({
  useAppStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({ adapterMode: 'mock' }),
}));

import { toast } from 'sonner';
import { useSafeCommand } from '../core/useSafeCommand';

const command = { type: 'SET_BATTERY_POWER', value: 2000 } as AdapterCommand;

describe('useSafeCommand — command feedback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequiresConfirmation.mockReturnValue(false);
    mockSend.mockResolvedValue(true);
  });

  it('rejects an invalid command with an error toast and does not send it', () => {
    mockValidateShape.mockReturnValue({ valid: false, error: 'value out of range' });
    const { result } = renderHook(() => useSafeCommand());

    act(() => result.current.execute(command));

    expect(mockSend).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('value out of range'));
    expect(mockAudit).toHaveBeenCalledWith(expect.objectContaining({ status: 'rejected' }));
  });

  it('executes a valid non-danger command and shows a success toast', async () => {
    mockValidateShape.mockReturnValue({ valid: true });
    mockSend.mockResolvedValue(true);
    const { result } = renderHook(() => useSafeCommand());

    act(() => result.current.execute(command));

    expect(mockSend).toHaveBeenCalledWith(command);
    await waitFor(() => expect(toast.success).toHaveBeenCalled());
    expect(toast.error).not.toHaveBeenCalled();
    // The React layer no longer writes an optimistic 'executed' audit row — the
    // adapter (BaseAdapter.sendCommand) is the single authoritative outcome writer.
    expect(mockAudit).not.toHaveBeenCalledWith(expect.objectContaining({ status: 'executed' }));
  });

  it('surfaces a rejected dispatch (no adapter accepted) as an error toast', async () => {
    mockValidateShape.mockReturnValue({ valid: true });
    mockSend.mockResolvedValue(false);
    const { result } = renderHook(() => useSafeCommand());

    act(() => result.current.execute(command));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        expect.stringContaining('No connected adapter accepted the command'),
      ),
    );
    // Outcome auditing belongs to the adapter layer — the hook does not log 'failed'.
    expect(mockAudit).not.toHaveBeenCalledWith(expect.objectContaining({ status: 'failed' }));
  });

  it('surfaces an execution failure as an error toast', async () => {
    mockValidateShape.mockReturnValue({ valid: true });
    mockSend.mockRejectedValue(new Error('adapter offline'));
    const { result } = renderHook(() => useSafeCommand());

    act(() => result.current.execute(command));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('adapter offline')),
    );
    expect(mockAudit).not.toHaveBeenCalledWith(expect.objectContaining({ status: 'failed' }));
  });
});

describe('useSafeCommand — danger-command confirmation gate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    mockValidateShape.mockReturnValue({ valid: true });
    mockSend.mockResolvedValue(true);
    // This command requires confirmation (danger command).
    mockRequiresConfirmation.mockReturnValue(true);
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it('does NOT send a danger command until it is confirmed', () => {
    const { result } = renderHook(() => useSafeCommand());

    act(() => result.current.execute(command));

    // Confirmation is pending — the command must not have been dispatched.
    expect(mockSend).not.toHaveBeenCalled();
    // No 'executed'/'confirmed' audit yet either.
    expect(mockAudit).not.toHaveBeenCalledWith(expect.objectContaining({ status: 'executed' }));
    expect(mockAudit).not.toHaveBeenCalledWith(expect.objectContaining({ status: 'confirmed' }));
  });

  it('auto-cancels an unconfirmed danger command after the 3 s timeout', () => {
    const { result } = renderHook(() => useSafeCommand());

    act(() => result.current.execute(command));
    act(() => vi.advanceTimersByTime(3_000));

    // Timed out → rejected audit, still never sent.
    expect(mockSend).not.toHaveBeenCalled();
    expect(mockAudit).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'rejected', error: expect.stringContaining('timeout') }),
    );
  });
});
