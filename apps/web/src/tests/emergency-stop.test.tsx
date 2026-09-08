import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { logCommandAuditMock, recordEmergencyStopMock, destroyMock, setAdapterStatusMock } =
  vi.hoisted(() => ({
    logCommandAuditMock: vi.fn().mockResolvedValue(undefined),
    recordEmergencyStopMock: vi.fn(),
    destroyMock: vi.fn(),
    setAdapterStatusMock: vi.fn(),
  }));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('../core/command-safety', () => ({
  logCommandAudit: logCommandAuditMock,
}));

vi.mock('../lib/metrics', () => ({
  metricsCollector: {
    recordEmergencyStop: recordEmergencyStopMock,
  },
}));

vi.mock('../core/useEnergyStore', () => ({
  useEnergyStoreBase: {
    getState: () => ({
      adapters: {
        'victron-mqtt': {
          enabled: true,
          adapter: { destroy: destroyMock },
        },
      },
      setAdapterStatus: setAdapterStatusMock,
    }),
  },
}));

import { EmergencyStop } from '../components/EmergencyStop';

describe('EmergencyStop', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('requires confirmation before executing the emergency stop', async () => {
    const user = userEvent.setup();
    render(<EmergencyStop />);

    await user.click(screen.getByRole('button', { name: 'safety.emergencyStop' }));
    expect(screen.getByText('safety.emergencyStopTitle')).toBeInTheDocument();
    expect(recordEmergencyStopMock).not.toHaveBeenCalled();
    expect(logCommandAuditMock).not.toHaveBeenCalled();
    expect(destroyMock).not.toHaveBeenCalled();
    expect(setAdapterStatusMock).not.toHaveBeenCalled();
  });

  it('logs via command-safety audit and tears down enabled adapters on confirm', async () => {
    const user = userEvent.setup();
    render(<EmergencyStop />);

    await user.click(screen.getByRole('button', { name: 'safety.emergencyStop' }));
    await user.click(screen.getByRole('button', { name: 'safety.confirmEmergencyStop' }));

    await waitFor(() => {
      expect(recordEmergencyStopMock).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(logCommandAuditMock).toHaveBeenCalledWith(
        expect.objectContaining({
          commandType: 'SET_GRID_LIMIT',
          value: 'EMERGENCY_STOP',
          status: 'emergency_stop',
        }),
      );
    });
    expect(destroyMock).toHaveBeenCalledTimes(1);
    expect(setAdapterStatusMock).toHaveBeenCalledWith(
      'victron-mqtt',
      'disconnected',
      'Emergency stop activated',
    );
    expect(await screen.findByRole('alert')).toHaveTextContent('safety.emergencyActive');
  });
});
